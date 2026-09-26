"""Forecast accuracy metrics and naive baselines the model must beat."""

from __future__ import annotations

import math

import numpy as np

from app.features import DAYS_PER_YEAR, DemandPanel, _WindowSums

BASELINE_NAMES: tuple[str, ...] = ("naive", "seasonal_naive", "moving_average_91")
MOVING_AVERAGE_DAYS = 91


def wape(actual: np.ndarray, forecast: np.ndarray) -> float:
    """Weighted absolute percentage error: sum|e| / sum|y|. Robust to many zero days."""
    denominator = np.abs(actual).sum()
    return float(np.abs(actual - forecast).sum() / denominator) if denominator > 0 else float("nan")


def mae(actual: np.ndarray, forecast: np.ndarray) -> float:
    return float(np.mean(np.abs(actual - forecast)))


def rmse(actual: np.ndarray, forecast: np.ndarray) -> float:
    return float(np.sqrt(np.mean((actual - forecast) ** 2)))


def bias(actual: np.ndarray, forecast: np.ndarray) -> float:
    """Positive = over-forecasting on average (relative to total demand)."""
    denominator = np.abs(actual).sum()
    return float((forecast - actual).sum() / denominator) if denominator > 0 else float("nan")


def _scalar_mase(actual: np.ndarray, forecast: np.ndarray, mase_scale: float | np.ndarray, fallback_array: np.ndarray) -> float:
    scalar = float("nan")
    raw_scalar = np.asarray(mase_scale, dtype=float)
    if raw_scalar.ndim == 0 and math.isfinite(float(raw_scalar)) and float(raw_scalar) > 0:
        scalar = float(raw_scalar)
    else:
        pos = fallback_array[np.isfinite(fallback_array) & (fallback_array > 0)]
        if len(pos) > 0:
            scalar = float(np.mean(pos))
    return float(mae(actual, forecast) / scalar) if math.isfinite(scalar) and scalar > 0 else float("nan")


def mase(
    actual: np.ndarray,
    forecast: np.ndarray,
    mase_scale: float | np.ndarray = float("nan"),
    scale_by_product: np.ndarray | None = None,
) -> float:
    """Mean absolute scaled error. Supports per-product scaling on 2D/flattened panels and scalar fallback."""
    scale_source = scale_by_product if scale_by_product is not None else mase_scale
    scale = np.asarray(scale_source, dtype=float)
    if scale.ndim == 0:
        scalar = float(scale)
        return float(mae(actual, forecast) / scalar) if math.isfinite(scalar) and scalar > 0 else float("nan")

    act = np.asarray(actual, dtype=float)
    fct = np.asarray(forecast, dtype=float)
    if act.ndim == 2 and scale.ndim == 1 and len(scale) == act.shape[0]:
        scale = np.broadcast_to(scale[:, None], act.shape)
    elif act.ndim == 1 and scale.ndim == 1 and len(scale) > 0 and len(scale) != len(act):
        if len(act) % len(scale) == 0:
            scale = np.repeat(scale, len(act) // len(scale))
        else:
            return _scalar_mase(act, fct, mase_scale, scale)

    if scale.shape != act.shape:
        return _scalar_mase(act, fct, mase_scale, scale)

    valid = np.isfinite(scale) & (scale > 0) & np.isfinite(act) & np.isfinite(fct)
    if not np.any(valid):
        return _scalar_mase(act, fct, mase_scale, scale)
    return float(np.mean(np.abs(act[valid] - fct[valid]) / scale[valid]))


def all_metrics(
    actual: np.ndarray,
    forecast: np.ndarray,
    mase_scale: float | np.ndarray = float("nan"),
    scale_by_product: np.ndarray | None = None,
) -> dict[str, float]:
    error = mae(actual, forecast)
    return {
        "wape": wape(actual, forecast),
        "mae": error,
        "rmse": rmse(actual, forecast),
        "mase": mase(actual, forecast, mase_scale=mase_scale, scale_by_product=scale_by_product),
        "bias": bias(actual, forecast),
    }


def baseline_forecasts(panel: DemandPanel, origin_indices: np.ndarray, horizon: int) -> dict[str, np.ndarray]:
    """Baseline H-day totals at each origin, flattened in (product, origin) order.

    * naive: the last H days repeat.
    * seasonal_naive: the same window last year (falls back to naive when unavailable).
    * moving_average_91: the last 91-day daily mean times H (what a spreadsheet planner would use).
    """
    origins = np.asarray(origin_indices, dtype=np.int64)
    end = np.broadcast_to(origins[None, :], (panel.quantities.shape[0], len(origins)))
    sums = _WindowSums(panel.quantities)
    naive = sums.total(end, horizon)
    seasonal = sums.total(end + horizon - DAYS_PER_YEAR, horizon)
    seasonal = np.where(np.isnan(seasonal), naive, seasonal)
    moving_average = sums.total(end, MOVING_AVERAGE_DAYS) / MOVING_AVERAGE_DAYS * horizon
    return {
        "naive": np.nan_to_num(naive.ravel()),
        "seasonal_naive": np.nan_to_num(seasonal.ravel()),
        "moving_average_91": np.nan_to_num(moving_average.ravel()),
    }
