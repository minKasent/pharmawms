"""Feature engineering for direct multi-day demand forecasting.

For a forecast origin day ``t`` (the last day whose demand is known) and horizon ``H``, the target
is the total demand over days ``t+1 .. t+H``. Every feature is computed from demand on days
``<= t`` plus calendar facts about the target window, which are known in advance. This is what
makes the model honest: it never sees the future it is asked to predict (see test_features.py).
"""

from __future__ import annotations

import warnings
from dataclasses import dataclass
from datetime import date, timedelta

import numpy as np
import pandas as pd

from app.calendar_vn import signed_days_to_nearest_tet, tet_days_in_window

ROLLING_WINDOWS = (7, 14, 28, 56, 91)
DAYS_PER_YEAR = 364  # 52 weeks: keeps the weekday aligned with last year
MIN_HISTORY_DAYS = 91
DAYS_SINCE_SALE_CAP = 365
MIN_DAILY_LEVEL = 0.05
MISSING_CATEGORY_CODE = -1  # LightGBM treats negative categorical values as missing

FEATURE_COLUMNS: tuple[str, ...] = (
    *(f"sum_{w}" for w in ROLLING_WINDOWS),
    "std_28",
    "zero_fraction_28",
    "days_since_last_demand",
    "trend_7_vs_28",
    "trend_28_vs_91",
    "last_year_same_window",
    "last_year_prev_28",
    "yoy_growth_28",
    "last_year_window_ratio",
    "month",
    "season_sin",
    "season_cos",
    "days_to_tet",
    "tet_days_in_window",
    "category",
)
CATEGORICAL_COLUMNS: tuple[str, ...] = ("category",)

FEATURE_LABELS_VI: dict[str, str] = {
    "sum_7": "Nhu cầu 7 ngày gần nhất",
    "sum_14": "Nhu cầu 14 ngày gần nhất",
    "sum_28": "Nhu cầu 28 ngày gần nhất",
    "sum_56": "Nhu cầu 56 ngày gần nhất",
    "sum_91": "Nhu cầu 91 ngày gần nhất",
    "std_28": "Độ biến động 28 ngày",
    "zero_fraction_28": "Tỷ lệ ngày không phát sinh (28 ngày)",
    "days_since_last_demand": "Số ngày từ lần xuất gần nhất",
    "trend_7_vs_28": "Xu hướng ngắn hạn (7 vs 28 ngày)",
    "trend_28_vs_91": "Xu hướng trung hạn (28 vs 91 ngày)",
    "last_year_same_window": "Cùng kỳ năm trước",
    "last_year_prev_28": "28 ngày trước cùng kỳ năm trước",
    "yoy_growth_28": "Tăng trưởng so với năm trước",
    "last_year_window_ratio": "Mùa vụ năm trước (kỳ tới so với 28 ngày trước đó)",
    "month": "Tháng",
    "season_sin": "Mùa vụ: trục xuân – thu",
    "season_cos": "Mùa vụ: trục đông – hè",
    "season": "Mùa vụ (chu kỳ năm)",
    "days_to_tet": "Khoảng cách tới Tết",
    "tet_days_in_window": "Số ngày nghỉ Tết trong kỳ dự báo",
    "category": "Nhóm thuốc",
}


@dataclass(frozen=True)
class DemandPanel:
    """Dense product x day demand matrix (missing days are zero demand)."""

    product_ids: np.ndarray  # shape (P,)
    start: date
    quantities: np.ndarray  # shape (P, D), float64
    categories: np.ndarray  # shape (P,), index into category_vocabulary or MISSING_CATEGORY_CODE
    category_vocabulary: tuple[str, ...]

    @property
    def day_count(self) -> int:
        return self.quantities.shape[1]

    def day_at(self, index: int) -> date:
        return self.start + timedelta(days=index)

    def index_of(self, day: date) -> int:
        return (day - self.start).days


def build_panel(history: pd.DataFrame, products: pd.DataFrame, end: date, start: date | None = None,
                category_vocabulary: tuple[str, ...] | None = None) -> DemandPanel:
    """Pivot ``history`` (product_id, day, quantity) into a dense matrix covering ``start..end``.

    ``products`` (product_id, category) defines the product universe, so products without any
    demand still get a row of zeros. Pass the trained model's ``category_vocabulary`` when
    forecasting so category codes match training; unknown categories become missing.
    """
    product_ids = np.sort(products["product_id"].to_numpy(dtype=np.int64))
    category_by_product = dict(zip(products["product_id"], products["category"], strict=True))
    if start is None:
        start = min(history["day"]) if len(history) else end
    day_count = (end - start).days + 1
    matrix = np.zeros((len(product_ids), max(day_count, 0)), dtype=np.float64)
    if len(history) and day_count > 0:
        row_of = {pid: i for i, pid in enumerate(product_ids)}
        rows = history["product_id"].map(row_of)
        cols = (pd.to_datetime(history["day"]) - pd.Timestamp(start)).dt.days
        mask = rows.notna() & (cols >= 0) & (cols < day_count)
        np.add.at(matrix, (rows[mask].astype(int).to_numpy(), cols[mask].to_numpy()),
                  history.loc[mask, "quantity"].to_numpy(dtype=np.float64))
    if category_vocabulary is None:
        category_vocabulary = tuple(sorted({c for c in category_by_product.values() if c}))
    code_of = {category: code for code, category in enumerate(category_vocabulary)}
    categories = np.array([code_of.get(category_by_product[pid], MISSING_CATEGORY_CODE) for pid in product_ids],
                          dtype=np.int64)
    return DemandPanel(product_ids=product_ids, start=start, quantities=matrix, categories=categories,
                       category_vocabulary=category_vocabulary)


class _WindowSums:
    """O(1) trailing-window aggregates via prefix sums."""

    def __init__(self, quantities: np.ndarray) -> None:
        zeros = np.zeros((quantities.shape[0], 1))
        self._sum = np.hstack([zeros, np.cumsum(quantities, axis=1)])
        self._sq = np.hstack([zeros, np.cumsum(quantities**2, axis=1)])
        self._zero = np.hstack([zeros, np.cumsum(quantities == 0, axis=1)])

    @staticmethod
    def _take(prefix: np.ndarray, end_index: np.ndarray, length: int) -> np.ndarray:
        """Sum over days ``end_index-length+1 .. end_index``; NaN where the window leaves the panel."""
        hi = end_index + 1
        lo = hi - length
        valid = (lo >= 0) & (hi < prefix.shape[1])
        result = np.full(end_index.shape, np.nan)
        rows = np.broadcast_to(np.arange(prefix.shape[0])[:, None], end_index.shape)
        result[valid] = prefix[rows[valid], hi[valid]] - prefix[rows[valid], lo[valid]]
        return result

    def total(self, end_index: np.ndarray, length: int) -> np.ndarray:
        return self._take(self._sum, end_index, length)

    def squares(self, end_index: np.ndarray, length: int) -> np.ndarray:
        return self._take(self._sq, end_index, length)

    def zeros(self, end_index: np.ndarray, length: int) -> np.ndarray:
        return self._take(self._zero, end_index, length)


def _days_since_last_demand(quantities: np.ndarray) -> np.ndarray:
    """For each (product, day): days since the most recent day with demand > 0, up to that day."""
    day_index = np.arange(quantities.shape[1])
    last_positive = np.where(quantities > 0, day_index[None, :], -1)
    last_positive = np.maximum.accumulate(last_positive, axis=1)
    since = day_index[None, :] - last_positive
    return np.where(last_positive < 0, DAYS_SINCE_SALE_CAP, np.minimum(since, DAYS_SINCE_SALE_CAP)).astype(float)


def _safe_ratio(numerator: np.ndarray, denominator: np.ndarray) -> np.ndarray:
    with np.errstate(divide="ignore", invalid="ignore"):
        ratio = numerator / denominator
    return np.where(np.isfinite(ratio), ratio, np.nan)


def make_features(panel: DemandPanel, origin_indices: np.ndarray, horizon: int) -> pd.DataFrame:
    """Feature rows for every product at every origin index (day index of ``t``).

    Returns one row per (product, origin) with columns ``product_id``, ``origin`` and
    :data:`FEATURE_COLUMNS`. Uses only demand on days ``<= origin``.
    """
    origins = np.asarray(origin_indices, dtype=np.int64)
    product_count = panel.quantities.shape[0]
    end = np.broadcast_to(origins[None, :], (product_count, len(origins)))
    sums = _WindowSums(panel.quantities)

    columns: dict[str, np.ndarray] = {}
    for window in ROLLING_WINDOWS:
        columns[f"sum_{window}"] = sums.total(end, window)
    n = 28
    mean_28 = columns["sum_28"] / n
    variance = (sums.squares(end, n) - n * mean_28**2) / (n - 1)
    columns["std_28"] = np.sqrt(np.clip(variance, 0, None))
    columns["zero_fraction_28"] = sums.zeros(end, n) / n
    since = _days_since_last_demand(panel.quantities)
    columns["days_since_last_demand"] = since[np.arange(product_count)[:, None], end]
    columns["trend_7_vs_28"] = _safe_ratio(columns["sum_7"] * 4, columns["sum_28"])
    columns["trend_28_vs_91"] = _safe_ratio(columns["sum_28"] * (91 / 28), columns["sum_91"])
    # Last year's days t+1-364 .. t+H-364 all lie in the past because H <= 364.
    columns["last_year_same_window"] = sums.total(end + horizon - DAYS_PER_YEAR, horizon)
    columns["last_year_prev_28"] = sums.total(end - DAYS_PER_YEAR, 28)
    columns["yoy_growth_28"] = _safe_ratio(columns["sum_28"], columns["last_year_prev_28"])
    # Scale-free: how last year's target window compared with the 28 days before it.
    columns["last_year_window_ratio"] = _safe_ratio(columns["last_year_same_window"] * (28 / horizon),
                                                    columns["last_year_prev_28"])

    first_target_ordinal = np.array([panel.day_at(int(o)).toordinal() + 1 for o in origins], dtype=np.int64)
    window_center = pd.to_datetime([date.fromordinal(int(o) + horizon // 2) for o in first_target_ordinal])
    day_of_year = window_center.dayofyear.to_numpy()
    calendar = {
        "month": pd.to_datetime([date.fromordinal(int(o)) for o in first_target_ordinal]).month.to_numpy(),
        "season_sin": np.sin(2 * np.pi * day_of_year / 365.25),
        "season_cos": np.cos(2 * np.pi * day_of_year / 365.25),
        "days_to_tet": signed_days_to_nearest_tet(first_target_ordinal),
        "tet_days_in_window": tet_days_in_window(first_target_ordinal, horizon),
    }
    for name, values in calendar.items():
        columns[name] = np.broadcast_to(np.asarray(values, dtype=float)[None, :], end.shape)
    columns["category"] = np.broadcast_to(panel.categories[:, None], end.shape)

    frame = pd.DataFrame({name: values.ravel() for name, values in columns.items()})
    frame.insert(0, "origin", np.broadcast_to(origins[None, :], end.shape).ravel())
    frame.insert(0, "product_id", np.broadcast_to(panel.product_ids[:, None], end.shape).ravel())
    frame["category"] = frame["category"].astype(np.int64)
    return frame[["product_id", "origin", *FEATURE_COLUMNS]]


def baseline_level(features: pd.DataFrame, horizon: int) -> np.ndarray:
    """Recent demand level over the horizon: mean of the 28- and 91-day daily rates, times H.

    Used as the model's offset (``init_score``), so the model learns multiplicative corrections
    (season, trend, Tết) that transfer across products of very different volume.
    """
    rate_28 = features["sum_28"].to_numpy(dtype=np.float64) / 28.0
    rate_91 = features["sum_91"].to_numpy(dtype=np.float64) / 91.0
    with warnings.catch_warnings():
        warnings.simplefilter("ignore", category=RuntimeWarning)
        daily = np.nanmean(np.vstack([rate_28, rate_91]), axis=0)
    return np.maximum(np.nan_to_num(daily, nan=0.0), MIN_DAILY_LEVEL) * horizon


def make_targets(panel: DemandPanel, origin_indices: np.ndarray, horizon: int) -> np.ndarray:
    """Total demand over ``origin+1 .. origin+horizon``, flattened like :func:`make_features`.

    NaN where the window extends past the last observed day.
    """
    origins = np.asarray(origin_indices, dtype=np.int64)
    product_count = panel.quantities.shape[0]
    end = np.broadcast_to(origins[None, :] + horizon, (product_count, len(origins)))
    totals = _WindowSums(panel.quantities).total(end, horizon)
    beyond = end >= panel.day_count
    totals[beyond] = np.nan
    return totals.ravel()


def training_origins(panel: DemandPanel, horizon: int, step: int, last_origin: int | None = None) -> np.ndarray:
    """Origins with enough history for features and a fully observed target window."""
    latest = panel.day_count - 1 - horizon if last_origin is None else min(last_origin, panel.day_count - 1 - horizon)
    if latest < MIN_HISTORY_DAYS - 1:
        return np.array([], dtype=np.int64)
    # Anchor on the latest origin so the most recent data is always used.
    return np.arange(latest, MIN_HISTORY_DAYS - 2, -step, dtype=np.int64)[::-1]
