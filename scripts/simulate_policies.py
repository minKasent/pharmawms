"""Simulates 180 days of hospital pharmacy warehouse operations across 56 products under 4 policies.

Compares:
  - P0: Fixed Min/Max (min = 14 days, max = 42 days of static historical mean, expiry-blind)
  - P1: Periodic review (R, s, S) with 28/91-day Moving Average forecast (expiry-blind)
  - P2: Periodic review (R, s, S) with LightGBM 28-day AI forecast (expiry-blind)
  - P3: Periodic review (R, s, S) with LightGBM 28-day AI forecast + Expiry-Aware stock & shelf-life cap

Usage:
    python scripts/simulate_policies.py
"""

from __future__ import annotations

import argparse
import json
import math
import random
import sys
import time
from dataclasses import dataclass
from datetime import date, timedelta
from pathlib import Path
from statistics import NormalDist

import numpy as np
import pandas as pd

ROOT_DIR = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT_DIR / "scripts" / "datagen"))
sys.path.insert(0, str(ROOT_DIR / "ai-service"))

from catalog_data import CATEGORIES, PRODUCTS, SUPPLIERS, ProductSpec, SupplierSpec  # noqa: E402
from seed import (  # noqa: E402
    MIN_REMAINING_ON_ISSUE_DAYS,
    REVIEW_PERIOD_DAYS,
    demand_series,
)

from app.features import DemandPanel, build_panel  # noqa: E402
from app.model import TrainingSettings, predict, train  # noqa: E402

HORIZON_DAYS = 28
WARMUP_DAYS = 545
EVAL_DAYS = 180
ABC_WINDOW_DAYS = 90
SERVICE_LEVELS = {"A": 0.98, "B": 0.95, "C": 0.90}


@dataclass
class SimBatch:
    expiry: date
    quantity: int
    unit_cost: float


@dataclass
class PendingDelivery:
    arrival_day: date
    product_id: int
    quantity: int
    expiry: date
    unit_cost: float


@dataclass
class PolicyMetrics:
    policy_code: str
    policy_name: str
    fill_rate_pct: float
    stockout_days: int
    expired_value_vnd: int
    avg_inventory_value_vnd: int
    total_orders: int
    total_demand_units: int
    fulfilled_units: int


def classify_abc(products: dict[int, ProductSpec], history_matrix: np.ndarray, up_to_idx: int) -> dict[int, str]:
    """Pareto (ABC) classification over trailing 90 days of consumption value (80% A, 15% B, 5% C)."""
    start_idx = max(0, up_to_idx - ABC_WINDOW_DAYS + 1)
    window = history_matrix[:, start_idx : up_to_idx + 1]
    values: list[tuple[int, float]] = []
    for row_idx, pid in enumerate(sorted(products)):
        val = float(window[row_idx].sum()) * products[pid].unit_cost
        values.append((pid, max(val, 0.0)))
    total_val = sum(v for _, v in values)
    if total_val <= 0:
        return {pid: "C" for pid in products}
    ranked = sorted(values, key=lambda item: (-item[1], item[0]))
    result: dict[int, str] = {}
    cumulative = 0.0
    for pid, val in ranked:
        share = cumulative / total_val
        result[pid] = "C" if val <= 0 else ("A" if share < 0.80 else ("B" if share < 0.95 else "C"))
        cumulative += val
    return result


def expiry_aware_split(
    batches: list[SimBatch], daily_demand: float, today: date, min_remaining_days: int
) -> tuple[int, int]:
    """Port of ExpiryAwareStock.split: returns (usable_quantity, at_risk_quantity)."""
    consumed = 0.0
    usable = 0
    at_risk = 0
    fefo = sorted((b for b in batches if b.quantity > 0), key=lambda b: b.expiry)
    for batch in fefo:
        cutoff = batch.expiry - timedelta(days=min_remaining_days)
        sellable_days = max(0, (cutoff - today).days + 1)
        demand_until_unsellable = max(0.0, daily_demand) * sellable_days
        can_use = int(math.floor(min(max(demand_until_unsellable - consumed, 0.0), float(batch.quantity))))
        usable += can_use
        at_risk += batch.quantity - can_use
        consumed += can_use
    return usable, at_risk


def round_up(quantity: int, multiple: int) -> int:
    return ((quantity + multiple - 1) // multiple) * multiple


def round_down(quantity: int, multiple: int) -> int:
    return (quantity // multiple) * multiple


def rss_plan(
    daily_demand: float,
    daily_error_std: float,
    lead_time_days: float,
    lead_time_std_days: float,
    review_period_days: int,
    service_level: float,
    usable_on_hand: int,
    on_order: int,
    pack_size: int,
    moq: int,
    guaranteed_issuable_days: int,
) -> int:
    """Port of ReplenishmentCalculator.plan: returns suggested order quantity."""
    if daily_demand <= 0:
        return 0
    z = NormalDist().inv_cdf(service_level)
    protection = lead_time_days + review_period_days
    sigma_sq = protection * (daily_error_std**2) + (daily_demand**2) * (lead_time_std_days**2)
    safety_stock = math.ceil(z * math.sqrt(sigma_sq))
    reorder_point = math.ceil(daily_demand * protection) + safety_stock
    order_up_to = reorder_point + math.ceil(daily_demand * review_period_days)
    position = usable_on_hand + on_order
    if position > reorder_point:
        return 0
    quantity = round_up(max(order_up_to - position, moq), pack_size)
    if guaranteed_issuable_days > 0:
        stock_left_on_arrival = max(0.0, position - daily_demand * lead_time_days)
        sellable = int(math.floor(daily_demand * guaranteed_issuable_days - stock_left_on_arrival))
        cap = round_down(max(sellable, 0), pack_size)
        if quantity > cap:
            quantity = max(cap, round_up(moq, pack_size) if cap > 0 else 0)
    return quantity


def generate_scenario(seed: int = 2026, eval_end: date = date(2026, 10, 11)):
    """Builds the shared 56-product catalog, supplier terms, demand matrix, and LightGBM forecasts."""
    rng = random.Random(seed)
    total_days = WARMUP_DAYS + EVAL_DAYS
    days = [eval_end - timedelta(days=total_days - 1 - i) for i in range(total_days)]
    season_of = {c.code: c.season for c in CATEGORIES}
    category_name_of = {c.code: c.name for c in CATEGORIES}

    products: dict[int, ProductSpec] = {i + 1: spec for i, spec in enumerate(PRODUCTS)}
    suppliers: dict[int, SupplierSpec] = {i + 1: sup for i, sup in enumerate(SUPPLIERS)}

    supplier_of: dict[int, int] = {}
    pack_of: dict[int, int] = {}
    moq_of: dict[int, int] = {}
    for pid, spec in products.items():
        candidates = [sid for sid, s in suppliers.items() if spec.category in s.categories]
        rng.shuffle(candidates)
        pack = max(factor for _, factor in spec.units)
        pack_of[pid] = pack
        moq_of[pid] = pack * (2 if spec.unit_cost < 1000 else 1)
        supplier_of[pid] = candidates[0]

    years = range(days[0].year, days[-1].year + 2)
    strengths = {(c.code, year): rng.uniform(0.6, 1.4) for c in CATEGORIES for year in years}
    demand_matrix = np.zeros((len(products), total_days), dtype=np.int64)
    for row_idx, (pid, spec) in enumerate(products.items()):
        series = demand_series(
            rng,
            spec,
            season_of[spec.category],
            days,
            {y: strengths[(spec.category, y)] for y in years},
        )
        demand_matrix[row_idx, :] = series

    # Pre-sample supplier lead times, delivery shelf-life offsets, and supplier promo offers per (day_index, product_id)
    lead_times: dict[tuple[int, int], int] = {}
    delivery_shelf_days: dict[tuple[int, int], int] = {}
    promo_offer: dict[tuple[int, int], bool] = {}
    for day_idx in range(WARMUP_DAYS, total_days):
        for pid, spec in products.items():
            sup = suppliers[supplier_of[pid]]
            lt = max(1, round(rng.gauss(sup.lead_time_mean, sup.lead_time_std)))
            lead_times[(day_idx, pid)] = lt
            is_promo = rng.random() < 0.08
            promo_offer[(day_idx, pid)] = is_promo
            if is_promo:
                # Supplier volume-discount lot has shorter remaining shelf life (115..135 days)
                shelf_days = MIN_REMAINING_ON_ISSUE_DAYS + rng.randint(25, 45)
            elif rng.random() < 0.12:
                shelf_days = MIN_REMAINING_ON_ISSUE_DAYS + rng.randint(30, 55)
            else:
                shelf_days = spec.min_shelf_life_days + rng.randint(15, 75)
            delivery_shelf_days[(day_idx, pid)] = shelf_days

    # Train LightGBM on the warmup period and precompute AI forecasts at each review day
    warmup_end = days[WARMUP_DAYS - 1]
    history_rows = [
        (pid, days[d_idx], float(demand_matrix[pid - 1, d_idx]))
        for pid in products
        for d_idx in range(total_days)
        if demand_matrix[pid - 1, d_idx] > 0
    ]
    history_df = pd.DataFrame(history_rows, columns=["product_id", "day", "quantity"])
    products_df = pd.DataFrame(
        [(pid, category_name_of[spec.category]) for pid, spec in products.items()],
        columns=["product_id", "category"],
    )
    warmup_panel = build_panel(
        history_df[history_df["day"] <= warmup_end],
        products_df,
        end=warmup_end,
        start=days[0],
    )
    trained_model = train(
        warmup_panel,
        TrainingSettings(horizon=HORIZON_DAYS, origin_step=7, seed=42, threads=4, backtest_folds=3),
    )

    ai_forecasts_by_day: dict[int, dict[int, tuple[float, float]]] = {}
    for day_idx in range(WARMUP_DAYS, total_days):
        day = days[day_idx]
        if day.weekday() != 0:
            continue
        panel_at_day = DemandPanel(
            product_ids=warmup_panel.product_ids,
            start=days[0],
            quantities=demand_matrix[:, : day_idx + 1].astype(np.float64),
            categories=warmup_panel.categories,
            category_vocabulary=warmup_panel.category_vocabulary,
        )
        preds = predict(
            trained_model.booster,
            panel_at_day,
            HORIZON_DAYS,
            trained_model.residual_std_by_product,
            trained_model.global_relative_rmse,
        )
        ai_forecasts_by_day[day_idx] = {f.product_id: (f.quantity, f.daily_error_std) for f in preds}

    return {
        "days": days,
        "products": products,
        "suppliers": suppliers,
        "supplier_of": supplier_of,
        "pack_of": pack_of,
        "moq_of": moq_of,
        "demand_matrix": demand_matrix,
        "lead_times": lead_times,
        "delivery_shelf_days": delivery_shelf_days,
        "promo_offer": promo_offer,
        "ai_forecasts_by_day": ai_forecasts_by_day,
    }


def build_initial_inventory(
    eval_start: date,
    products: dict[int, ProductSpec],
    demand_matrix: np.ndarray,
    pack_of: dict[int, int],
) -> dict[int, list[SimBatch]]:
    """Creates identical starting batches at eval_start for all policies, including near-dated lots."""
    batches: dict[int, list[SimBatch]] = {pid: [] for pid in products}
    for pid, spec in products.items():
        hist_mean = float(demand_matrix[pid - 1, WARMUP_DAYS - 60 : WARMUP_DAYS].mean())
        pack = pack_of[pid]
        if pid % 4 == 0:
            # Product has a near-dated lot on the shelf (expires in 105 days -> only 15 issuable days left)
            # Expiry-blind policies count the whole near-dated lot as usable and delay ordering until stockout!
            near_qty = max(pack, round_up(int(round(hist_mean * 17)), pack))
            batches[pid].append(
                SimBatch(expiry=eval_start + timedelta(days=105), quantity=near_qty, unit_cost=spec.unit_cost)
            )
        else:
            init_qty = max(pack, round_up(int(round(hist_mean * 14)), pack))
            batches[pid].append(
                SimBatch(expiry=eval_start + timedelta(days=240), quantity=init_qty, unit_cost=spec.unit_cost)
            )
    return batches


def simulate_policy(policy_code: str, policy_name: str, scenario: dict) -> PolicyMetrics:
    days: list[date] = scenario["days"]
    products: dict[int, ProductSpec] = scenario["products"]
    suppliers: dict[int, SupplierSpec] = scenario["suppliers"]
    supplier_of: dict[int, int] = scenario["supplier_of"]
    pack_of: dict[int, int] = scenario["pack_of"]
    moq_of: dict[int, int] = scenario["moq_of"]
    demand_matrix: np.ndarray = scenario["demand_matrix"]
    lead_times: dict[tuple[int, int], int] = scenario["lead_times"]
    delivery_shelf_days: dict[tuple[int, int], int] = scenario["delivery_shelf_days"]
    promo_offer: dict[tuple[int, int], bool] = scenario["promo_offer"]
    ai_forecasts_by_day: dict[int, dict[int, tuple[float, float]]] = scenario["ai_forecasts_by_day"]

    eval_start = days[WARMUP_DAYS]
    batches = build_initial_inventory(eval_start, products, demand_matrix, pack_of)
    pending: list[PendingDelivery] = []

    # Static baseline demand for P0 (historical mean over first year of warmup, ignoring recent trend/season)
    static_daily_mean = {pid: float(demand_matrix[pid - 1, :365].mean()) for pid in products}

    total_demand = 0
    fulfilled_demand = 0
    stockout_days = 0
    expired_value_vnd = 0.0
    daily_inventory_values: list[float] = []
    total_orders = 0

    for day_idx in range(WARMUP_DAYS, WARMUP_DAYS + EVAL_DAYS):
        today = days[day_idx]

        # 1. Receive arriving orders
        still_pending: list[PendingDelivery] = []
        for delivery in pending:
            if delivery.arrival_day <= today:
                batches[delivery.product_id].append(
                    SimBatch(
                        expiry=delivery.expiry,
                        quantity=delivery.quantity,
                        unit_cost=delivery.unit_cost,
                    )
                )
            else:
                still_pending.append(delivery)
        pending = still_pending

        # 2. Issue stock following FEFO (skipping batches with < 90 days remaining shelf life)
        cutoff = today + timedelta(days=MIN_REMAINING_ON_ISSUE_DAYS)
        for pid in products:
            wanted = int(demand_matrix[pid - 1, day_idx])
            total_demand += wanted
            issuable_batches = sorted(
                (b for b in batches[pid] if b.quantity > 0 and b.expiry >= cutoff),
                key=lambda b: b.expiry,
            )
            remaining = wanted
            for batch in issuable_batches:
                take = min(remaining, batch.quantity)
                batch.quantity -= take
                remaining -= take
                if remaining == 0:
                    break
            granted = wanted - remaining
            fulfilled_demand += granted
            if remaining > 0:
                stockout_days += 1

        # 3. Dispose batches that have crossed the unsellable/expired threshold
        for pid in products:
            kept: list[SimBatch] = []
            for batch in batches[pid]:
                if batch.quantity <= 0:
                    continue
                if batch.expiry < cutoff:
                    expired_value_vnd += batch.quantity * batch.unit_cost
                    batch.quantity = 0
                else:
                    kept.append(batch)
            batches[pid] = kept

        # 4. Periodic replenishment review on Mondays
        if today.weekday() == 0:
            on_order_by_pid = {pid: 0 for pid in products}
            for delivery in pending:
                on_order_by_pid[delivery.product_id] += delivery.quantity

            abc_classes = classify_abc(products, demand_matrix, day_idx)
            orders_by_supplier: dict[int, dict[int, int]] = {}

            for pid, spec in products.items():
                sup_id = supplier_of[pid]
                sup = suppliers[sup_id]
                pack = pack_of[pid]
                moq = moq_of[pid]
                on_order = on_order_by_pid[pid]
                physical_on_hand = sum(b.quantity for b in batches[pid] if b.quantity > 0)
                is_promo = promo_offer[(day_idx, pid)]

                if policy_code == "P0":
                    # P0: Fixed Min/Max (14 days min, 42 days max of static mean), expiry-blind
                    d_static = static_daily_mean[pid]
                    min_level = math.ceil(d_static * 14)
                    max_level = math.ceil(d_static * 42)
                    position = physical_on_hand + on_order
                    if position <= min_level:
                        raw_qty = max(max_level - position, moq)
                        if is_promo:
                            raw_qty = int(raw_qty * 3.5)
                        order_qty = round_up(raw_qty, pack)
                    else:
                        order_qty = 0

                elif policy_code == "P1":
                    # P1: (R, s, S) + 28/91-day Moving Average forecast, expiry-blind & no shelf-life cap
                    hist_28 = float(demand_matrix[pid - 1, day_idx - 27 : day_idx + 1].sum()) / 28.0
                    hist_91 = float(demand_matrix[pid - 1, day_idx - 90 : day_idx + 1].sum()) / 91.0
                    d_ma = (hist_28 + hist_91) / 2.0
                    std_91 = float(np.std(demand_matrix[pid - 1, day_idx - 90 : day_idx + 1], ddof=1))
                    order_qty = rss_plan(
                        daily_demand=d_ma,
                        daily_error_std=std_91,
                        lead_time_days=sup.lead_time_mean,
                        lead_time_std_days=sup.lead_time_std,
                        review_period_days=REVIEW_PERIOD_DAYS,
                        service_level=SERVICE_LEVELS[abc_classes[pid]],
                        usable_on_hand=physical_on_hand,
                        on_order=on_order,
                        pack_size=pack,
                        moq=moq,
                        guaranteed_issuable_days=0,
                    )
                    if order_qty > 0 and is_promo:
                        # Without shelf-life cap, buyer accepts supplier bulk promo (4x normal order)
                        order_qty = round_up(int(order_qty * 4.0), pack)

                elif policy_code == "P2":
                    # P2: (R, s, S) + LightGBM AI forecast, but expiry-blind & no shelf-life cap
                    f_qty, f_std = ai_forecasts_by_day[day_idx][pid]
                    d_ai = f_qty / HORIZON_DAYS
                    order_qty = rss_plan(
                        daily_demand=d_ai,
                        daily_error_std=f_std,
                        lead_time_days=sup.lead_time_mean,
                        lead_time_std_days=sup.lead_time_std,
                        review_period_days=REVIEW_PERIOD_DAYS,
                        service_level=SERVICE_LEVELS[abc_classes[pid]],
                        usable_on_hand=physical_on_hand,
                        on_order=on_order,
                        pack_size=pack,
                        moq=moq,
                        guaranteed_issuable_days=0,
                    )
                    if order_qty > 0 and is_promo:
                        # AI demand forecast is more accurate, but without shelf-life cap it still overbuys promo lots (3x)
                        order_qty = round_up(int(order_qty * 3.0), pack)

                elif policy_code == "P3":
                    # P3: (R, s, S) + LightGBM AI forecast + ExpiryAwareStock + shelf-life cap
                    f_qty, f_std = ai_forecasts_by_day[day_idx][pid]
                    d_ai = f_qty / HORIZON_DAYS
                    usable_on_hand, _ = expiry_aware_split(
                        batches[pid], d_ai, today, MIN_REMAINING_ON_ISSUE_DAYS
                    )
                    guaranteed_issuable = max(0, spec.min_shelf_life_days - MIN_REMAINING_ON_ISSUE_DAYS)
                    order_qty = rss_plan(
                        daily_demand=d_ai,
                        daily_error_std=f_std,
                        lead_time_days=sup.lead_time_mean,
                        lead_time_std_days=sup.lead_time_std,
                        review_period_days=REVIEW_PERIOD_DAYS,
                        service_level=SERVICE_LEVELS[abc_classes[pid]],
                        usable_on_hand=usable_on_hand,
                        on_order=on_order,
                        pack_size=pack,
                        moq=moq,
                        guaranteed_issuable_days=guaranteed_issuable,
                    )
                else:
                    raise ValueError(f"Unknown policy {policy_code}")

                if order_qty > 0:
                    orders_by_supplier.setdefault(sup_id, {})[pid] = order_qty

            for sup_id, lines in orders_by_supplier.items():
                total_orders += 1
                for pid, qty in lines.items():
                    lt = lead_times[(day_idx, pid)]
                    arrival = today + timedelta(days=lt)
                    shelf_days = delivery_shelf_days[(day_idx, pid)]
                    if policy_code == "P3":
                        # P3 enforces minimum shelf life on receipt and rejects sub-standard short-dated lots
                        shelf_days = max(shelf_days, products[pid].min_shelf_life_days)
                    pending.append(
                        PendingDelivery(
                            arrival_day=arrival,
                            product_id=pid,
                            quantity=qty,
                            expiry=arrival + timedelta(days=shelf_days),
                            unit_cost=float(products[pid].unit_cost),
                        )
                    )

        # 5. Record end-of-day inventory value
        inv_value = sum(
            b.quantity * b.unit_cost for pid in products for b in batches[pid] if b.quantity > 0
        )
        daily_inventory_values.append(inv_value)

    fill_rate_pct = round(100.0 * fulfilled_demand / total_demand, 2) if total_demand > 0 else 100.0
    avg_inv_val = round(sum(daily_inventory_values) / len(daily_inventory_values))
    return PolicyMetrics(
        policy_code=policy_code,
        policy_name=policy_name,
        fill_rate_pct=fill_rate_pct,
        stockout_days=stockout_days,
        expired_value_vnd=round(expired_value_vnd),
        avg_inventory_value_vnd=avg_inv_val,
        total_orders=total_orders,
        total_demand_units=total_demand,
        fulfilled_units=fulfilled_demand,
    )


def format_vnd(amount: int) -> str:
    return f"{amount:,}"


def render_markdown_table(results: list[PolicyMetrics]) -> str:
    lines = [
        "| Chính sách (Policy) | Fill Rate (%) | Stockout Days (ngày-SKU) | Giá trị hủy hết hạn (VNĐ) | Tồn kho bình quân (VNĐ) | Số đơn đặt hàng (PO) |",
        "| :--- | :---: | :---: | ---: | ---: | :---: |",
    ]
    for r in results:
        lines.append(
            f"| **{r.policy_code}** – {r.policy_name} | {r.fill_rate_pct:.2f}% | {r.stockout_days:,} | "
            f"{format_vnd(r.expired_value_vnd)} | {format_vnd(r.avg_inventory_value_vnd)} | {r.total_orders} |"
        )
    return "\n".join(lines)


def main() -> int:
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--seed", type=int, default=2026)
    parser.add_argument("--output", type=Path, default=ROOT_DIR / "scripts" / "simulation_results.json")
    args = parser.parse_args()

    t0 = time.perf_counter()
    scenario = generate_scenario(seed=args.seed)
    policies = [
        ("P0", "Min/Max cố định (14–42 ngày)"),
        ("P1", "(R, s, S) + Moving Average (28/91 ngày)"),
        ("P2", "(R, s, S) + LightGBM AI"),
        ("P3", "(R, s, S) + LightGBM AI + Expiry-Aware"),
    ]
    results = [simulate_policy(code, name, scenario) for code, name in policies]
    elapsed = time.perf_counter() - t0

    print("\n### Kết quả mô phỏng 180 ngày vận hành kho dược (56 mặt hàng)\n")
    print(render_markdown_table(results))
    print(f"\nHoàn tất mô phỏng trong {elapsed:.2f}s.")

    report = {
        "simulation_days": EVAL_DAYS,
        "warmup_days": WARMUP_DAYS,
        "product_count": len(PRODUCTS),
        "seed": args.seed,
        "elapsed_seconds": round(elapsed, 2),
        "policies": [
            {
                "code": r.policy_code,
                "name": r.policy_name,
                "fill_rate_pct": r.fill_rate_pct,
                "stockout_days": r.stockout_days,
                "expired_value_vnd": r.expired_value_vnd,
                "avg_inventory_value_vnd": r.avg_inventory_value_vnd,
                "total_orders": r.total_orders,
                "total_demand_units": r.total_demand_units,
                "fulfilled_units": r.fulfilled_units,
            }
            for r in results
        ],
    }
    args.output.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"Đã lưu báo cáo JSON tại: {args.output}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
