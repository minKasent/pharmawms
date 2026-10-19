"""Simulates ~24 months of warehouse operations and loads them into PostgreSQL.

The data is produced the way the application would have produced it: purchase orders go
through approval and arrive after a random lead time, receipts create batches, issues follow
FEFO and skip batches with too little shelf life left, stock-outs lose demand, and expired
stock is disposed monthly. The ledger therefore reconciles exactly with the balances.

Usage (backend must have migrated the schema once):
    python scripts/datagen/seed.py --reset            # wipe business data and load
    python scripts/datagen/seed.py --output seed.sql  # only write the SQL
Standard library only; loads through ``docker exec psql``.
"""

from __future__ import annotations

import argparse
import math
import random
import subprocess
import sys
from collections import defaultdict
from dataclasses import dataclass, field
from datetime import date, datetime, time, timedelta, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from catalog_data import CATEGORIES, DESTINATIONS, PRODUCTS, SUPPLIERS, ProductSpec  # noqa: E402

LOCAL = timezone(timedelta(hours=7))
TET_DATES: tuple[date, ...] = (
    date(2021, 2, 12),
    date(2022, 2, 1),
    date(2023, 1, 22),
    date(2024, 2, 10),
    date(2025, 1, 29),
    date(2026, 2, 17),
    date(2027, 2, 6),
    date(2028, 1, 26),
    date(2029, 2, 13),
    date(2030, 2, 3),
    date(2031, 1, 23),
    date(2032, 2, 11),
)
DAYS_PER_MONTH = 30
MIN_REMAINING_ON_ISSUE_DAYS = 90
OPENING_STOCK_DAYS = 45
REVIEW_PERIOD_DAYS = 7
REORDER_COVER_FACTOR = 1.3
ORDER_UP_TO_EXTRA_DAYS = 21
DEMAND_LOOKBACK_DAYS = 28
PARTIAL_DELIVERY_RATE = 0.10
CLOSE_SHORT_RATE = 0.25
SHORT_DATED_DELIVERY_RATE = 0.08
PROMOTION_OVERBUY_RATE = 0.04  # buyer takes a volume discount and orders far more than needed
PROMOTION_OVERBUY_FACTOR = 6
CLEARANCE_DAYS_BEFORE_END = 150
CLEARANCE_CANDIDATE_POOL = 15
CLEARANCE_PRODUCTS = 4
CLEARANCE_COVER_DAYS = 220
CLEARANCE_EXPIRY_AFTER_END_DAYS = (15, 80)
CLEARANCE_EXPIRED_PRODUCTS = 1  # one clearance lot runs out of date just before today and awaits disposal
CLEARANCE_EXPIRY_BEFORE_END_DAYS = (2, 6)
CLEARANCE_COST_FACTOR = 0.6
LEVEL_SHIFT_RATE = 0.15
NOISE_SHAPE = 6.0
POISSON_NORMAL_THRESHOLD = 30
DISPOSAL_DAY_OF_MONTH = 5
WEEKDAY_FACTOR = (1.15, 1.0, 1.0, 1.0, 1.0, 0.7, 0.35)

SEASON_PEAK_DAY = {"respiratory": 230, "dengue": 250, "digestive": 135, "allergy": 30, "campaign": 300}
SEASON_AMPLITUDE = {"respiratory": 0.35, "dengue": 0.45, "digestive": 0.25, "allergy": 0.30, "campaign": 0.8}

TRUNCATE_SQL = """
TRUNCATE forecasting.purchase_suggestion, forecasting.forecast_result, forecasting.forecast_run,
         forecasting.replenishment_policy,
         inventory.issue_allocation, inventory.goods_issue_line, inventory.goods_issue,
         inventory.goods_receipt_line, inventory.goods_receipt, inventory.stock_take_line, inventory.stock_take,
         inventory.disposal_line, inventory.disposal, inventory.stock_movement, inventory.stock_balance,
         inventory.batch, inventory.location, inventory.zone, inventory.warehouse,
         purchasing.purchase_order_event, purchasing.purchase_order_line, purchasing.purchase_order,
         purchasing.supplier_product, purchasing.supplier,
         catalog.product_unit, catalog.product, catalog.category
RESTART IDENTITY CASCADE;
"""

SERIAL_TABLES = (
    "catalog.category", "catalog.product", "catalog.product_unit", "purchasing.supplier",
    "purchasing.supplier_product", "purchasing.purchase_order", "purchasing.purchase_order_line",
    "purchasing.purchase_order_event", "inventory.warehouse", "inventory.zone", "inventory.location",
    "inventory.batch", "inventory.stock_balance", "inventory.stock_movement", "inventory.goods_receipt",
    "inventory.goods_receipt_line", "inventory.goods_issue", "inventory.goods_issue_line",
    "inventory.issue_allocation", "inventory.disposal", "inventory.disposal_line",
)


# ---------------------------------------------------------------- demand model

def interpolated_strength(day: date, strengths: dict[int, float]) -> float:
    """Linearly blend annual seasonal strength across the calendar year to avoid Jan 1 step jumps."""
    s0 = strengths[day.year]
    s1 = strengths.get(day.year + 1, s0)
    year_start = date(day.year, 1, 1)
    days_in_year = (date(day.year + 1, 1, 1) - year_start).days
    frac = (day - year_start).days / days_in_year
    return s0 + frac * (s1 - s0)


def season_factor(season: str, day: date, strength: float) -> float:
    if season not in SEASON_PEAK_DAY:
        return 1.0
    phase = 2 * math.pi * (day.timetuple().tm_yday - SEASON_PEAK_DAY[season]) / 365.25
    return max(0.2, 1 + SEASON_AMPLITUDE[season] * strength * math.cos(phase))


def tet_factor(day: date, season: str) -> float:
    for tet in TET_DATES:
        offset = (day - tet).days
        if -14 <= offset < 0:
            return 1.5 if season == "chronic" else 1.15  # patients collect prescriptions before the holiday
        if 0 <= offset <= 5:
            return 0.25
        if 6 <= offset <= 12:
            return 1.2
    return 1.0


def poisson(rng: random.Random, mean: float) -> int:
    if mean <= 0:
        return 0
    if mean >= POISSON_NORMAL_THRESHOLD:
        return max(0, round(rng.gauss(mean, math.sqrt(mean))))
    threshold, k, product = math.exp(-mean), 0, rng.random()
    while product > threshold:
        k += 1
        product *= rng.random()
    return k


def demand_series(rng: random.Random, spec: ProductSpec, season: str, days: list[date],
                  strengths: dict[int, float]) -> list[int]:
    growth = rng.uniform(-0.15, 0.30)
    shift_day, shift = (rng.randrange(len(days) // 4, len(days)), rng.uniform(0.6, 1.5)) \
        if rng.random() < LEVEL_SHIFT_RATE else (len(days), 1.0)
    series = []
    for index, day in enumerate(days):
        strength = interpolated_strength(day, strengths)
        mean = (spec.daily_demand * (1 + growth) ** (index / 365) * (shift if index >= shift_day else 1.0)
                * season_factor(season, day, strength) * tet_factor(day, season)
                * WEEKDAY_FACTOR[day.weekday()] * rng.gammavariate(NOISE_SHAPE, 1 / NOISE_SHAPE))
        series.append(poisson(rng, mean))
    return series


# ---------------------------------------------------------------- simulation state

@dataclass
class Batch:
    id: int
    product_id: int
    lot: str
    manufactured: date
    expiry: date
    supplier_id: int | None
    unit_cost: float
    received_at: datetime
    location_id: int
    quantity: int = 0
    status: str = "AVAILABLE"
    hold_reason: str | None = None


@dataclass
class OpenOrder:
    id: int
    supplier_id: int
    lines: dict[int, int]  # product -> ordered
    line_rows: dict[int, int] = field(default_factory=dict)  # product -> row index in purchasing.purchase_order_line
    received: dict[int, int] = field(default_factory=dict)
    deliveries: list[tuple[date, float]] = field(default_factory=list)  # (day, share of remaining)
    close_short: bool = False


class Tables:
    def __init__(self) -> None:
        self.rows: dict[str, list[tuple]] = defaultdict(list)
        self.columns: dict[str, tuple[str, ...]] = {}
        self.ids: dict[str, int] = defaultdict(int)

    def add(self, table: str, columns: tuple[str, ...], values: tuple) -> int:
        self.columns.setdefault(table, ("id", *columns))
        self.ids[table] += 1
        self.rows[table].append((self.ids[table], *values))
        return self.ids[table]


class Simulation:
    def __init__(self, seed: int, days: int, today: date, users: dict[str, int]) -> None:
        self.rng = random.Random(seed)
        self.today = today
        self.end = today - timedelta(days=1)
        self.days = [self.end - timedelta(days=days - 1 - i) for i in range(days)]
        self.users = users
        self.t = Tables()
        self.codes: dict[str, int] = defaultdict(int)
        self.batches: dict[int, list[Batch]] = defaultdict(list)
        self.issued: dict[int, list[int]] = defaultdict(list)
        self.open_orders: list[OpenOrder] = []
        self.lot_counter: dict[int, int] = defaultdict(int)
        self.end_of_history = datetime.combine(self.end, time(23, 59), LOCAL)

    # --- helpers
    def code(self, prefix: str, day: date) -> str:
        self.codes[prefix] += 1
        return f"{prefix}-{day:%Y%m%d}-{self.codes[prefix]:06d}"

    def at(self, day: date, hour: int, minute: int = 0) -> datetime:
        return datetime.combine(day, time(hour, minute), LOCAL)

    # --- master data
    def build_master_data(self) -> None:
        t, now = self.t, self.at(self.days[0] - timedelta(days=200), 8)
        category_ids = {c.code: t.add("catalog.category", ("code", "name"), (c.code, c.name)) for c in CATEGORIES}
        self.season_of = {c.code: c.season for c in CATEGORIES}
        self.specs: dict[int, ProductSpec] = {}
        for spec in PRODUCTS:
            product_id = t.add("catalog.product", (
                "sku", "name", "active_ingredient", "strength", "dosage_form", "registration_number", "category_id",
                "storage_condition", "prescription_required", "base_unit", "min_shelf_life_on_receipt_days",
                "reference_unit_cost", "active", "created_at", "updated_at", "version"), (
                spec.sku, spec.name, spec.ingredient, spec.strength, spec.form,
                f"VD-{self.rng.randint(10000, 99999)}-{self.rng.randint(18, 24)}", category_ids[spec.category],
                spec.storage, spec.prescription, spec.base_unit, spec.min_shelf_life_days, spec.unit_cost, True, now,
                now, 0))
            self.specs[product_id] = spec
            for unit_name, factor in ((spec.base_unit, 1), *spec.units):
                t.add("catalog.product_unit", ("product_id", "unit_name", "factor_to_base"),
                      (product_id, unit_name, factor))

        self.supplier_of: dict[int, int] = {}
        self.supplier_specs = {}
        self.pack_of: dict[int, int] = {}
        self.moq_of: dict[int, int] = {}
        for supplier in SUPPLIERS:
            supplier_id = t.add("purchasing.supplier", (
                "code", "name", "phone", "email", "address", "default_lead_time_days", "active"), (
                supplier.code, supplier.name, supplier.phone, f"sales@{supplier.code.lower()}.example.vn",
                supplier.address, max(1, round(supplier.lead_time_mean)), True))
            self.supplier_specs[supplier_id] = supplier
        for product_id, spec in self.specs.items():
            candidates = [sid for sid, s in self.supplier_specs.items() if spec.category in s.categories]
            self.rng.shuffle(candidates)
            pack = max(factor for _, factor in spec.units)
            self.pack_of[product_id] = pack
            self.moq_of[product_id] = pack * (2 if spec.unit_cost < 1000 else 1)
            for rank, supplier_id in enumerate(candidates[:2]):
                price = round(spec.unit_cost * self.rng.uniform(0.92, 1.08), 2)
                t.add("purchasing.supplier_product", (
                    "supplier_id", "product_id", "pack_size", "min_order_quantity", "unit_price", "preferred"),
                    (supplier_id, product_id, pack, self.moq_of[product_id], price, rank == 0))
                if rank == 0:
                    self.supplier_of[product_id] = supplier_id

        warehouse = t.add("inventory.warehouse", ("code", "name", "address"),
                          ("KTT", "Kho dược trung tâm", "Tầng 1, khu C"))
        self.locations: dict[str, list[int]] = {}
        for zone_code, zone_name, condition, count in (("A", "Khu thường", "NORMAL", 20), ("B", "Khu mát", "COOL", 6),
                                                       ("C", "Khu lạnh", "COLD", 4)):
            zone = t.add("inventory.zone", ("warehouse_id", "code", "name", "storage_condition"),
                         (warehouse, zone_code, zone_name, condition))
            self.locations[condition] = [
                t.add("inventory.location", ("zone_id", "code", "active"), (zone, f"{zone_code}-{i:02d}", True))
                for i in range(1, count + 1)]

    # --- stock movements
    def movement(self, batch: Batch, kind: str, quantity: int, reference: str, reference_id: int, user: int,
                 at: datetime) -> None:
        self.t.add("inventory.stock_movement", (
            "batch_id", "location_id", "product_id", "movement_type", "quantity", "reference_type", "reference_id",
            "performed_by", "occurred_at"), (batch.id, batch.location_id, batch.product_id, kind, quantity, reference,
                                             reference_id, user, at))
        batch.quantity += quantity
        if batch.quantity < 0:
            raise AssertionError(f"negative stock for batch {batch.id}")

    def new_batch(self, product_id: int, arrival: date, supplier_id: int | None, received_at: datetime,
                  expiry: date | None = None, cost_factor: float = 1.0) -> Batch:
        spec = self.specs[product_id]
        shelf_life = spec.shelf_life_months * DAYS_PER_MONTH
        expiry = expiry or self.delivered_expiry(spec, arrival)
        manufactured = expiry - timedelta(days=shelf_life)
        self.lot_counter[product_id] += 1
        lot = f"{spec.sku[:4]}{arrival:%y%m}{self.lot_counter[product_id]:03d}"
        cost = round(spec.unit_cost * cost_factor * self.rng.uniform(0.95, 1.05), 4)
        location = self.rng.choice(self.locations[spec.storage])
        batch = Batch(0, product_id, lot, manufactured, expiry, supplier_id, cost, received_at, location)
        batch.id = self.t.ids["inventory.batch"] + 1
        self.t.ids["inventory.batch"] += 1
        self.batches[product_id].append(batch)
        return batch

    def delivered_expiry(self, spec: ProductSpec, arrival: date) -> date:
        if self.rng.random() < SHORT_DATED_DELIVERY_RATE:
            return arrival + timedelta(days=spec.min_shelf_life_days + self.rng.randint(5, 45))
        shelf_life = spec.shelf_life_months * DAYS_PER_MONTH
        return arrival + timedelta(days=self.rng.randint(
            spec.min_shelf_life_days + 30, max(spec.min_shelf_life_days + 31, shelf_life - 20)))

    def receive(self, day: date, supplier_id: int | None, order_id: int | None, quantities: dict[int, int],
                note: str | None, expiries: dict[int, date] | None = None, cost_factor: float = 1.0) -> None:
        at = self.at(day, 10, self.rng.randint(0, 59))
        receipt = self.t.add("inventory.goods_receipt", (
            "code", "supplier_id", "purchase_order_id", "idempotency_key", "note", "received_by", "received_at"),
            (self.code("PN", day), supplier_id, order_id, None, note, self.users["thukho"], at))
        for product_id, quantity in quantities.items():
            batch = self.new_batch(product_id, day, supplier_id, at, (expiries or {}).get(product_id), cost_factor)
            self.t.add("inventory.goods_receipt_line", (
                "receipt_id", "product_id", "batch_id", "location_id", "quantity", "unit_cost"),
                (receipt, product_id, batch.id, batch.location_id, quantity, batch.unit_cost))
            self.movement(batch, "RECEIPT", quantity, "GOODS_RECEIPT", receipt, self.users["thukho"], at)

    # --- daily operations
    def issue(self, day: date, demand: dict[int, int]) -> None:
        by_destination: dict[str, dict[int, int]] = defaultdict(dict)
        for product_id, quantity in demand.items():
            granted = self.allocatable(product_id, day, quantity)
            self.issued[product_id].append(granted)
            if granted == 0:
                continue
            split = self.rng.sample(DESTINATIONS, k=self.rng.choice((1, 1, 2)))
            first = granted if len(split) == 1 else max(1, round(granted * self.rng.uniform(0.4, 0.8)))
            for destination, part in zip(split, (first, granted - first)):
                if part > 0:
                    by_destination[destination][product_id] = part
        for destination, lines in by_destination.items():
            at = self.at(day, self.rng.randint(8, 16), self.rng.randint(0, 59))
            issue = self.t.add("inventory.goods_issue", (
                "code", "destination", "min_remaining_shelf_life_days", "idempotency_key", "note", "issued_by",
                "issued_at"), (self.code("PX", day), destination, MIN_REMAINING_ON_ISSUE_DAYS, None, None,
                               self.users["thukho"], at))
            for product_id, quantity in lines.items():
                line = self.t.add("inventory.goods_issue_line", ("issue_id", "product_id", "quantity"),
                                  (issue, product_id, quantity))
                remaining = quantity
                for batch in self.fefo(product_id, day):
                    take = min(remaining, batch.quantity)
                    self.t.add("inventory.issue_allocation", ("issue_line_id", "batch_id", "location_id", "quantity"),
                               (line, batch.id, batch.location_id, take))
                    self.movement(batch, "ISSUE", -take, "GOODS_ISSUE", issue, self.users["thukho"], at)
                    remaining -= take
                    if remaining == 0:
                        break

    def fefo(self, product_id: int, day: date) -> list[Batch]:
        cutoff = day + timedelta(days=MIN_REMAINING_ON_ISSUE_DAYS)
        return sorted((b for b in self.batches[product_id]
                       if b.status == "AVAILABLE" and b.quantity > 0 and b.expiry >= cutoff),
                      key=lambda b: (b.expiry, b.manufactured, b.id))

    def allocatable(self, product_id: int, day: date, wanted: int) -> int:
        return min(wanted, sum(b.quantity for b in self.fefo(product_id, day)))

    def review(self, day: date) -> None:
        lines_by_supplier: dict[int, dict[int, int]] = defaultdict(dict)
        on_order = defaultdict(int)
        for order in self.open_orders:
            for product_id, ordered in order.lines.items():
                on_order[product_id] += ordered - order.received.get(product_id, 0)
        for product_id, spec in self.specs.items():
            history = self.issued[product_id][-DEMAND_LOOKBACK_DAYS:]
            rate = sum(history) / len(history) if history else spec.daily_demand
            supplier = self.supplier_specs[self.supplier_of[product_id]]
            cover_days = supplier.lead_time_mean + REVIEW_PERIOD_DAYS
            reorder_point = rate * cover_days * REORDER_COVER_FACTOR
            position = sum(b.quantity for b in self.fefo(product_id, day)) + on_order[product_id]
            if rate <= 0 or position > reorder_point:
                continue
            pack = self.pack_of[product_id]
            quantity = math.ceil((reorder_point + rate * ORDER_UP_TO_EXTRA_DAYS - position) / pack) * pack
            if self.rng.random() < PROMOTION_OVERBUY_RATE:
                quantity *= PROMOTION_OVERBUY_FACTOR
            lines_by_supplier[self.supplier_of[product_id]][product_id] = max(quantity, self.moq_of[product_id])
        for supplier_id, lines in lines_by_supplier.items():
            self.place_order(day, supplier_id, lines, "MANUAL", "Đặt hàng định kỳ hằng tuần")

    def place_order(self, day: date, supplier_id: int, lines: dict[int, int], source: str, note: str,
                    stop_at: str | None = None) -> None:
        supplier = self.supplier_specs[supplier_id]
        created = self.at(day, 9, self.rng.randint(0, 30))
        submitted = created + timedelta(minutes=self.rng.randint(10, 60))
        approved = self.at(day + timedelta(days=self.rng.choice((0, 0, 1))), 14, self.rng.randint(0, 59))
        sent = self.at(approved.date() + timedelta(days=1), 8, self.rng.randint(0, 59))
        steps = [("DRAFT", created, "muahang"), ("PENDING_APPROVAL", submitted, "muahang"),
                 ("APPROVED", approved, "duocsi"), ("SENT", sent, "muahang")]
        if stop_at:
            steps = steps[:[s for s, _, _ in steps].index(stop_at) + 1]
        steps = [s for s in steps if s[1] <= self.end_of_history]
        reached = {status: at for status, at, _ in steps}
        order_id = self.t.add("purchasing.purchase_order", (
            "code", "supplier_id", "status", "source", "note", "created_by", "created_at", "submitted_at",
            "approved_by", "approved_at", "rejection_reason", "sent_at", "first_received_at", "completed_at",
            "version"), (self.code("DMH", day), supplier_id, steps[-1][0], source, note, self.users["muahang"],
                         created, reached.get("PENDING_APPROVAL"),
                         self.users["duocsi"] if "APPROVED" in reached else None, reached.get("APPROVED"), None,
                         reached.get("SENT"), None, None, len(steps)))
        line_rows: dict[int, int] = {}
        for product_id, quantity in lines.items():
            price = next(r[5] for r in self.t.rows["purchasing.supplier_product"]
                         if r[1] == supplier_id and r[2] == product_id)
            line_id = self.t.add("purchasing.purchase_order_line", (
                "purchase_order_id", "product_id", "quantity", "received_quantity", "unit_price", "suggestion_id"),
                (order_id, product_id, quantity, 0, price, None))
            line_rows[product_id] = line_id - 1
        previous = None
        for status, at, actor in steps:
            self.order_event(order_id, previous, status, actor, at, None)
            previous = status
        if "SENT" not in reached:
            return
        lead_time = max(1, round(self.rng.gauss(supplier.lead_time_mean, supplier.lead_time_std)))
        order = OpenOrder(order_id, supplier_id, dict(lines), line_rows=line_rows)
        arrival = sent.date() + timedelta(days=lead_time)
        if self.rng.random() < PARTIAL_DELIVERY_RATE:
            order.deliveries = [(arrival, self.rng.uniform(0.6, 0.8))]
            if self.rng.random() < CLOSE_SHORT_RATE:
                order.close_short = True
            else:
                order.deliveries.append((arrival + timedelta(days=self.rng.randint(2, 6)), 1.0))
        else:
            order.deliveries = [(arrival, 1.0)]
        self.open_orders.append(order)

    def order_event(self, order_id: int, from_status: str | None, to_status: str, actor: str, at: datetime,
                    note: str | None) -> None:
        self.t.add("purchasing.purchase_order_event", (
            "purchase_order_id", "from_status", "to_status", "performed_by", "occurred_at", "note"),
            (order_id, from_status, to_status, self.users[actor], at, note))

    def deliver(self, day: date) -> None:
        for order in list(self.open_orders):
            if not order.deliveries or order.deliveries[0][0] != day:
                continue
            _, share = order.deliveries.pop(0)
            quantities = {}
            for product_id, ordered in order.lines.items():
                remaining = ordered - order.received.get(product_id, 0)
                pack = self.pack_of[product_id]
                quantity = remaining if share >= 1 else max(pack, int(remaining * share) // pack * pack)
                quantity = min(quantity, remaining)
                if quantity > 0:
                    quantities[product_id] = quantity
                    order.received[product_id] = order.received.get(product_id, 0) + quantity
            if quantities:
                self.receive(day, order.supplier_id, order.id, quantities, None)
            self.update_order_after_delivery(order, day)

    def update_order_after_delivery(self, order: OpenOrder, day: date) -> None:
        line_cols = self.t.columns["purchasing.purchase_order_line"]
        rec_col = line_cols.index("received_quantity")
        for product_id, line_idx in order.line_rows.items():
            line_row = list(self.t.rows["purchasing.purchase_order_line"][line_idx])
            line_row[rec_col] = order.received.get(product_id, 0)
            self.t.rows["purchasing.purchase_order_line"][line_idx] = tuple(line_row)

        row_index = order.id - 1
        row = list(self.t.rows["purchasing.purchase_order"][row_index])
        columns = self.t.columns["purchasing.purchase_order"]
        status_col, first_col, done_col, version_col = (columns.index(c) for c in (
            "status", "first_received_at", "completed_at", "version"))
        at = self.at(day, 11)
        complete = all(order.received.get(p, 0) >= q for p, q in order.lines.items())
        previous = row[status_col]
        row[first_col] = row[first_col] or at
        if complete or (order.close_short and not order.deliveries):
            row[status_col], row[done_col] = "RECEIVED", at
            if not complete:
                self.order_event(order.id, previous, "PARTIALLY_RECEIVED", "thukho", at, None)
                previous = "PARTIALLY_RECEIVED"
                at = self.at(day, 15)
                row[done_col] = at
            self.order_event(order.id, previous, "RECEIVED", "muahang" if not complete else "thukho", at,
                             None if complete else "Đóng đơn: nhà cung cấp hết hàng")
            self.open_orders.remove(order)
        else:
            row[status_col] = "PARTIALLY_RECEIVED"
            if previous != "PARTIALLY_RECEIVED":
                self.order_event(order.id, previous, "PARTIALLY_RECEIVED", "thukho", at, None)
        row[version_col] += 1
        self.t.rows["purchasing.purchase_order"][row_index] = tuple(row)

    def buy_clearance_lots(self, day: date) -> None:
        """Supplier clears near-dated stock at a discount; the buyer overestimates how much the wards will use."""
        slow_movers = sorted((pid for pid, spec in self.specs.items() if spec.storage == "NORMAL"),
                             key=lambda pid: self.specs[pid].daily_demand)[:CLEARANCE_CANDIDATE_POOL]
        by_supplier: dict[int, dict[int, int]] = defaultdict(dict)
        expiries: dict[int, date] = {}
        for index, product_id in enumerate(self.rng.sample(slow_movers, CLEARANCE_PRODUCTS)):
            pack = self.pack_of[product_id]
            cover = self.specs[product_id].daily_demand * CLEARANCE_COVER_DAYS
            by_supplier[self.supplier_of[product_id]][product_id] = math.ceil(cover / pack) * pack
            if index < CLEARANCE_EXPIRED_PRODUCTS:
                expiries[product_id] = self.end - timedelta(days=self.rng.randint(*CLEARANCE_EXPIRY_BEFORE_END_DAYS))
            else:
                expiries[product_id] = self.end + timedelta(days=self.rng.randint(*CLEARANCE_EXPIRY_AFTER_END_DAYS))
        for supplier_id, quantities in by_supplier.items():
            self.receive(day, supplier_id, None, quantities, "Lô cận hạn nhà cung cấp thanh lý giá ưu đãi",
                         expiries, CLEARANCE_COST_FACTOR)

    def dispose_expired(self, day: date) -> None:
        """Monthly disposal council: destroys what expired during the previous months."""
        month_start = day.replace(day=1)
        expired = [b for batches in self.batches.values() for b in batches
                   if b.status in ("AVAILABLE", "EXPIRED") and b.expiry < month_start and b.quantity > 0]
        if not expired:
            return
        at = self.at(day, 15)
        disposal = self.t.add("inventory.disposal", ("code", "reason", "disposed_by", "disposed_at"),
                              (self.code("HUY", day), "Hủy thuốc hết hạn sử dụng định kỳ", self.users["duocsi"], at))
        for batch in expired:
            self.t.add("inventory.disposal_line", ("disposal_id", "batch_id", "location_id", "quantity"),
                       (disposal, batch.id, batch.location_id, batch.quantity))
            self.movement(batch, "DISPOSAL", -batch.quantity, "DISPOSAL", disposal, self.users["duocsi"], at)
            batch.status = "DISPOSED"

    # --- run
    def run(self) -> None:
        self.build_master_data()
        years = range(self.days[0].year, self.end.year + 2)
        strengths = {(c.code, year): self.rng.uniform(0.6, 1.4) for c in CATEGORIES for year in years}
        demand = {pid: demand_series(self.rng, spec, self.season_of[spec.category], self.days,
                                     {y: strengths[(spec.category, y)] for y in years})
                  for pid, spec in self.specs.items()}

        opening_day = self.days[0] - timedelta(days=1)
        by_supplier: dict[int, dict[int, int]] = defaultdict(dict)
        for product_id, spec in self.specs.items():
            pack = self.pack_of[product_id]
            by_supplier[self.supplier_of[product_id]][product_id] = max(
                pack, math.ceil(spec.daily_demand * OPENING_STOCK_DAYS / pack) * pack)
        for supplier_id, quantities in by_supplier.items():
            self.receive(opening_day, supplier_id, None, quantities, "Tồn đầu kỳ khi đưa hệ thống vào sử dụng")

        for index, day in enumerate(self.days):
            self.deliver(day)
            self.issue(day, {pid: series[index] for pid, series in demand.items()})
            if day.weekday() == 0:
                self.review(day)
            if day.day == DISPOSAL_DAY_OF_MONTH:
                self.dispose_expired(day)
            if index == len(self.days) - CLEARANCE_DAYS_BEFORE_END:
                self.buy_clearance_lots(day)

        self.finish()

    def finish(self) -> None:
        candidates = [b for batches in self.batches.values() for b in batches
                      if b.status == "AVAILABLE" and b.quantity > 0 and b.expiry > self.today + timedelta(days=200)]
        if candidates:
            held = self.rng.choice(candidates)
            held.status, held.hold_reason = "ON_HOLD", "Tạm ngừng theo công văn thu hồi của Cục Quản lý Dược"
        for batches in self.batches.values():
            for batch in batches:
                if batch.status in ("AVAILABLE", "ON_HOLD") and batch.expiry <= self.today:
                    batch.status = "EXPIRED"

        sample = self.rng.sample(sorted(self.specs), 3)
        supplier_id = self.supplier_of[sample[0]]
        lines = {pid: self.moq_of[pid] for pid in sample if self.supplier_of[pid] == supplier_id}
        self.place_order(self.end, supplier_id, lines, "MANUAL", "Bổ sung hàng cho đợt cao điểm", "PENDING_APPROVAL")

        for product_batches in self.batches.values():
            for b in sorted(product_batches, key=lambda x: x.id):
                self.t.rows["inventory.batch"].append((
                    b.id, b.product_id, b.lot, b.manufactured, b.expiry, b.supplier_id, b.status, b.unit_cost,
                    b.received_at, b.hold_reason, 0))
                self.t.add("inventory.stock_balance", ("batch_id", "location_id", "on_hand", "reserved", "version"),
                           (b.id, b.location_id, b.quantity, 0, 0))
        self.t.columns["inventory.batch"] = (
            "id", "product_id", "lot_number", "manufacture_date", "expiry_date", "supplier_id", "status", "unit_cost",
            "received_at", "hold_reason", "version")
        self.t.rows["inventory.batch"].sort(key=lambda r: r[0])
        self.verify()

    def verify(self) -> None:
        ledger: dict[tuple[int, int], int] = defaultdict(int)
        cols = self.t.columns["inventory.stock_movement"]
        b_col, l_col, q_col = cols.index("batch_id"), cols.index("location_id"), cols.index("quantity")
        for row in self.t.rows["inventory.stock_movement"]:
            ledger[(row[b_col], row[l_col])] += row[q_col]
        for _, batch_id, location_id, on_hand, _, _ in self.t.rows["inventory.stock_balance"]:
            if ledger[(batch_id, location_id)] != on_hand or on_hand < 0:
                raise AssertionError(f"ledger mismatch for batch {batch_id}")

        gr_cols = self.t.columns["inventory.goods_receipt"]
        gr_id_col, gr_po_col = gr_cols.index("id"), gr_cols.index("purchase_order_id")
        receipt_to_po = {row[gr_id_col]: row[gr_po_col] for row in self.t.rows["inventory.goods_receipt"]
                         if row[gr_po_col] is not None}

        grl_cols = self.t.columns["inventory.goods_receipt_line"]
        grl_r_col, grl_p_col, grl_q_col = (
            grl_cols.index("receipt_id"), grl_cols.index("product_id"), grl_cols.index("quantity"))
        gr_by_po: dict[int, int] = defaultdict(int)
        gr_by_po_product: dict[tuple[int, int], int] = defaultdict(int)
        for row in self.t.rows["inventory.goods_receipt_line"]:
            po_id = receipt_to_po.get(row[grl_r_col])
            if po_id is not None:
                gr_by_po[po_id] += row[grl_q_col]
                gr_by_po_product[(po_id, row[grl_p_col])] += row[grl_q_col]

        pol_cols = self.t.columns["purchasing.purchase_order_line"]
        pol_po_col, pol_p_col, pol_rec_col = (
            pol_cols.index("purchase_order_id"), pol_cols.index("product_id"), pol_cols.index("received_quantity"))
        pol_by_po: dict[int, int] = defaultdict(int)
        for row in self.t.rows["purchasing.purchase_order_line"]:
            po_id, pid, rec_qty = row[pol_po_col], row[pol_p_col], row[pol_rec_col]
            pol_by_po[po_id] += rec_qty
            if rec_qty != gr_by_po_product.get((po_id, pid), 0):
                raise AssertionError(
                    f"received_quantity mismatch on PO {po_id} product {pid}: {rec_qty} != "
                    f"{gr_by_po_product.get((po_id, pid), 0)}")

        po_cols = self.t.columns["purchasing.purchase_order"]
        po_id_col, po_status_col = po_cols.index("id"), po_cols.index("status")
        for row in self.t.rows["purchasing.purchase_order"]:
            po_id, status = row[po_id_col], row[po_status_col]
            if status in ("RECEIVED", "PARTIALLY_RECEIVED"):
                if pol_by_po[po_id] != gr_by_po[po_id] or pol_by_po[po_id] <= 0:
                    raise AssertionError(
                        f"PO {po_id} ({status}) received sum mismatch: lines={pol_by_po[po_id]}, "
                        f"receipts={gr_by_po[po_id]}")
            elif pol_by_po[po_id] != 0 or gr_by_po[po_id] != 0:
                raise AssertionError(f"PO {po_id} ({status}) should have 0 received quantity")


# ---------------------------------------------------------------- SQL output

def copy_value(value: object) -> str:
    if value is None:
        return r"\N"
    if isinstance(value, bool):
        return "t" if value else "f"
    if isinstance(value, (date, datetime)):
        return value.isoformat()
    text = str(value)
    return text.replace("\\", "\\\\").replace("\t", "\\t").replace("\n", "\\n").replace("\r", "\\r")


TABLE_ORDER = (
    "catalog.category", "catalog.product", "catalog.product_unit", "purchasing.supplier",
    "purchasing.supplier_product", "inventory.warehouse", "inventory.zone", "inventory.location",
    "purchasing.purchase_order", "purchasing.purchase_order_line", "purchasing.purchase_order_event",
    "inventory.batch", "inventory.goods_receipt", "inventory.goods_receipt_line", "inventory.goods_issue",
    "inventory.goods_issue_line", "inventory.issue_allocation", "inventory.disposal", "inventory.disposal_line",
    "inventory.stock_movement", "inventory.stock_balance",
)

CODE_SEQUENCES = {"PN": "inventory.goods_receipt_code_seq", "PX": "inventory.goods_issue_code_seq",
                  "HUY": "inventory.disposal_code_seq", "DMH": "purchasing.purchase_order_code_seq"}


def to_sql(sim: Simulation, reset: bool) -> str:
    parts = ["\\set ON_ERROR_STOP on", "BEGIN;"]
    if reset:
        parts.append(TRUNCATE_SQL)
    for table in TABLE_ORDER:
        columns = sim.t.columns[table]
        parts.append(f"COPY {table} ({', '.join(columns)}) FROM STDIN;")
        parts.extend("\t".join(copy_value(v) for v in row) for row in sim.t.rows[table])
        parts.append("\\.")
    for table in SERIAL_TABLES:
        parts.append(f"SELECT setval(pg_get_serial_sequence('{table}', 'id'), "
                     f"(SELECT coalesce(max(id), 0) + 1 FROM {table}), false);")
    for prefix, sequence in CODE_SEQUENCES.items():
        parts.append(f"SELECT setval('{sequence}', {sim.codes[prefix] + 1}, false);")
    parts.append("COMMIT;")
    return "\n".join(parts) + "\n"


# ---------------------------------------------------------------- loading

def psql(container: str, args: list[str], stdin: bytes | None = None) -> str:
    result = subprocess.run(["docker", "exec", "-i", container, "psql", "-U", "pharmawms", "-d", "pharmawms", *args],
                            input=stdin, capture_output=True, check=False)
    if result.returncode != 0:
        raise SystemExit(result.stderr.decode("utf-8", errors="replace"))
    return result.stdout.decode("utf-8")


def demo_users(container: str) -> dict[str, int]:
    output = psql(container, ["-tAF", ",", "-c", "SELECT username, id FROM iam.app_user"])
    users = {name: int(user_id) for name, user_id in (line.split(",") for line in output.split() if line)}
    missing = {"thukho", "muahang", "duocsi"} - users.keys()
    if missing:
        raise SystemExit(f"Demo users missing ({missing}); start the backend once with DEMO_ENABLED=true.")
    return users


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--days", type=int, default=730)
    parser.add_argument("--seed", type=int, default=2026)
    parser.add_argument("--today", type=date.fromisoformat, default=None,
                        help="reference today date (YYYY-MM-DD) for deterministic simulation")
    parser.add_argument("--reset", action="store_true", help="truncate business tables before loading")
    parser.add_argument("--container", default="pharmawms-postgres-1")
    parser.add_argument("--redis-container", default="pharmawms-redis-1")
    parser.add_argument("--output", type=Path, help="write SQL to this file instead of loading")
    args = parser.parse_args()

    today = args.today if args.today is not None else date.today()
    users = demo_users(args.container) if not args.output else {"thukho": 3, "muahang": 4, "duocsi": 2}
    sim = Simulation(args.seed, args.days, today, users)
    sim.run()
    sql = to_sql(sim, args.reset)
    summary = {table: len(rows) for table, rows in sim.t.rows.items()}
    print(f"Simulated {args.days} days: " + ", ".join(f"{t.split('.')[1]}={n}" for t, n in summary.items()))

    if args.output:
        args.output.write_text(sql, encoding="utf-8")
        print(f"Wrote {args.output}")
        return 0
    if not args.reset and psql(args.container, ["-tAc", "SELECT count(*) FROM catalog.product"]).strip() != "0":
        raise SystemExit("Database already has products; re-run with --reset to replace business data.")
    psql(args.container, ["-q"], sql.encode("utf-8"))
    if args.reset:
        subprocess.run(["docker", "exec", args.redis_container, "redis-cli", "FLUSHDB"], check=False,
                       capture_output=True)
    print("Loaded into PostgreSQL.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
