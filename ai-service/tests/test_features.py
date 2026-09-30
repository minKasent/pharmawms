from datetime import timedelta

import numpy as np
import pandas as pd
import pytest

from app.features import FEATURE_COLUMNS, build_panel, make_features, make_targets, training_origins
from tests.synthetic import synthetic_history

HORIZON = 28


@pytest.fixture(scope="module")
def data():
    history, products = synthetic_history()
    end = max(history["day"])
    return history, products, end


def test_features_do_not_depend_on_future_demand(data):
    """The core no-leakage guarantee: features at origin t are identical whether or not the
    panel contains days after t."""
    history, products, end = data
    full = build_panel(history, products, end=end)
    origin = full.day_count - 1 - 60
    origin_day = full.day_at(origin)

    truncated_history = history[history["day"] <= origin_day]
    truncated = build_panel(truncated_history, products, end=origin_day, start=full.start)

    with_future = make_features(full, np.array([origin]), HORIZON)
    without_future = make_features(truncated, np.array([origin]), HORIZON)
    pd.testing.assert_frame_equal(with_future, without_future)


def test_changing_future_demand_does_not_change_features(data):
    history, products, end = data
    panel = build_panel(history, products, end=end)
    origin = panel.day_count - 1 - 40
    before = make_features(panel, np.array([origin]), HORIZON)
    panel.quantities[:, origin + 1:] *= 10
    after = make_features(panel, np.array([origin]), HORIZON)
    pd.testing.assert_frame_equal(before, after)


def test_target_is_sum_of_following_horizon_days(data):
    history, products, end = data
    panel = build_panel(history, products, end=end)
    origin = 200
    targets = make_targets(panel, np.array([origin]), HORIZON)
    expected = panel.quantities[:, origin + 1: origin + 1 + HORIZON].sum(axis=1)
    np.testing.assert_allclose(targets, expected)


def test_target_is_missing_when_window_is_not_fully_observed(data):
    history, products, end = data
    panel = build_panel(history, products, end=end)
    targets = make_targets(panel, np.array([panel.day_count - HORIZON]), HORIZON)
    assert np.isnan(targets).all()


def test_rolling_sum_matches_direct_computation(data):
    history, products, end = data
    panel = build_panel(history, products, end=end)
    origin = 300
    features = make_features(panel, np.array([origin]), HORIZON)
    expected = panel.quantities[:, origin - 27: origin + 1].sum(axis=1)
    np.testing.assert_allclose(features["sum_28"].to_numpy(), expected)


def test_missing_days_are_zero_and_products_without_demand_are_kept(data):
    history, products, end = data
    extra = pd.concat([products, pd.DataFrame([(999, "NEW")], columns=["product_id", "category"])])
    panel = build_panel(history, extra, end=end)
    assert 999 in panel.product_ids
    row = list(panel.product_ids).index(999)
    assert panel.quantities[row].sum() == 0


def test_training_origins_have_full_history_and_observed_targets(data):
    history, products, end = data
    panel = build_panel(history, products, end=end)
    origins = training_origins(panel, HORIZON, step=7)
    assert origins.min() >= 90
    assert origins.max() == panel.day_count - 1 - HORIZON
    assert not np.isnan(make_targets(panel, origins, HORIZON)).any()


def test_feature_columns_are_complete(data):
    history, products, end = data
    panel = build_panel(history, products, end=end - timedelta(days=0))
    features = make_features(panel, np.array([panel.day_count - 1]), HORIZON)
    assert list(features.columns) == ["product_id", "origin", *FEATURE_COLUMNS]


def test_baseline_level_preserves_sum_28_when_sum_91_is_nan():
    from app.features import baseline_level

    df = pd.DataFrame({"sum_28": [280.0, np.nan], "sum_91": [np.nan, np.nan]})
    levels = baseline_level(df, horizon=28)
    assert np.isclose(levels[0], 280.0)
    assert levels[1] > 0
