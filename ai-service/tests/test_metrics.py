import math

import numpy as np

from app.evaluation import all_metrics, bias, mae, rmse, wape


def test_point_metrics():
    actual = np.array([10.0, 0.0, 20.0])
    forecast = np.array([12.0, 1.0, 15.0])
    assert mae(actual, forecast) == (2 + 1 + 5) / 3
    assert wape(actual, forecast) == 8 / 30
    assert math.isclose(rmse(actual, forecast), math.sqrt((4 + 1 + 25) / 3))
    assert bias(actual, forecast) == (2 + 1 - 5) / 30


def test_wape_is_nan_when_there_is_no_demand():
    assert math.isnan(wape(np.zeros(3), np.ones(3)))


def test_mase_scales_by_naive_error():
    actual = np.array([10.0, 20.0])
    metrics = all_metrics(actual, actual + 2, mase_scale=4.0)
    assert metrics["mase"] == 0.5


def test_mase_per_product_scale_free_prevents_fast_mover_dominance():
    # Product 0 is a fast mover (scale=100, error=50 -> scaled=0.5)
    # Product 1 is a slow mover (scale=2, error=3 -> scaled=1.5)
    # Mean scale-free MASE across both products and 2 origins = (0.5 + 0.5 + 1.5 + 1.5) / 4 = 1.0
    actual_2d = np.array([[1000.0, 1000.0], [10.0, 10.0]])
    forecast_2d = np.array([[1050.0, 950.0], [13.0, 7.0]])
    scale_by_product = np.array([100.0, 2.0])

    metrics_2d = all_metrics(actual_2d, forecast_2d, scale_by_product=scale_by_product)
    assert math.isclose(metrics_2d["mase"], 1.0)

    # Flattened (product, origin) 1D array with per-product scale array
    metrics_flat = all_metrics(actual_2d.ravel(), forecast_2d.ravel(), scale_by_product=scale_by_product)
    assert math.isclose(metrics_flat["mase"], 1.0)


def test_mase_falls_back_gracefully_on_non_broadcastable_or_zero_scales():
    actual = np.array([10.0, 20.0, 30.0])
    forecast = np.array([12.0, 22.0, 32.0])
    # Non-divisible length (3 vs 2) falls back to scalar mase_scale
    metrics = all_metrics(actual, forecast, mase_scale=4.0, scale_by_product=np.array([2.0, 4.0]))
    assert math.isclose(metrics["mase"], 0.5)
    # All-zero scale array with NaN scalar returns NaN cleanly
    metrics_zero = all_metrics(actual, forecast, mase_scale=float("nan"), scale_by_product=np.zeros(3))
    assert math.isnan(metrics_zero["mase"])
