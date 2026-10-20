import numpy as np
import pytest

from app.evaluation import BASELINE_NAMES, wape
from app.features import build_panel
from app.model import TrainingSettings, predict, train
from tests.synthetic import synthetic_history

HORIZON = 28


@pytest.fixture(scope="module")
def trained():
    history, products = synthetic_history()
    panel = build_panel(history, products, end=max(history["day"]))
    return panel, train(panel, TrainingSettings(horizon=HORIZON, origin_step=3, threads=2))


def test_backtest_reports_model_and_all_baselines(trained):
    _, model = trained
    overall = model.backtest["overall"]
    assert len(model.backtest["folds"]) == 4
    for name in ("model", *BASELINE_NAMES):
        assert 0 <= overall[name]["wape"] < 1


def test_model_beats_every_baseline(trained):
    _, model = trained
    overall = model.backtest["overall"]
    for name in BASELINE_NAMES:
        assert overall["model"]["wape"] < overall[name]["wape"], name
    assert overall["wape_improvement_vs_best_baseline"] > 0.1


def test_forecast_per_product_with_uncertainty_and_explanation(trained):
    panel, model = trained
    forecasts = predict(model.booster, panel, HORIZON, model.residual_std_by_product, model.global_relative_rmse)
    assert [f.product_id for f in forecasts] == list(panel.product_ids)
    for forecast in forecasts:
        assert forecast.quantity >= 0
        assert forecast.baseline_quantity > 0
        assert forecast.daily_error_std > 0
        assert 1 <= len(forecast.explanation) <= 5
        assert {"feature", "label", "contribution", "effect_percent"} <= forecast.explanation[0].keys()


def test_forecast_is_close_to_recent_demand_level(trained):
    panel, model = trained
    forecasts = predict(model.booster, panel, HORIZON, model.residual_std_by_product, model.global_relative_rmse)
    predicted = np.array([f.quantity for f in forecasts])
    recent = panel.quantities[:, -HORIZON:].sum(axis=1)
    assert wape(recent, predicted) < 0.5


def test_seasonal_shap_driver_merges_sin_and_cos_and_reconciles_baseline(trained):
    import math
    from app.features import FEATURE_COLUMNS, make_features
    from app.model import _explain

    panel, model = trained
    # Construct a contribution row where season_sin and season_cos are top contributors
    origin = np.array([panel.day_count - 1], dtype=np.int64)
    features = make_features(panel, origin, HORIZON)
    matrix = features[list(FEATURE_COLUMNS)]
    row_values = matrix.iloc[0]

    contrib = np.zeros(len(FEATURE_COLUMNS) + 1, dtype=float)
    sin_idx = FEATURE_COLUMNS.index("season_sin")
    cos_idx = FEATURE_COLUMNS.index("season_cos")
    contrib[sin_idx] = 0.12
    contrib[cos_idx] = 0.08
    contrib[-1] = -0.05  # TreeSHAP base value

    items = _explain(row_values, contrib)
    season_items = [item for item in items if item["feature"] == "season"]
    assert len(season_items) == 1
    assert season_items[0]["label"] == "Mùa vụ (chu kỳ năm)"
    assert season_items[0]["value"] is None
    assert math.isclose(season_items[0]["contribution"], 0.20, rel_tol=1e-6)
    assert all(item["feature"] not in ("season_sin", "season_cos") for item in items)

    # Verify full reconciliation between predict() baseline_quantity, SHAP contributions, and quantity
    forecasts = predict(model.booster, panel, HORIZON, model.residual_std_by_product, model.global_relative_rmse)
    all_contribs = model.booster.predict(matrix, pred_contrib=True)
    for idx, f in enumerate(forecasts):
        total_feature_contrib = float(all_contribs[idx, :-1].sum())
        reconstructed = f.baseline_quantity * math.exp(total_feature_contrib)
        assert math.isclose(reconstructed, f.quantity, rel_tol=1e-6)


def test_registry_auto_reloads_when_current_pointer_changes_and_bootstraps_seed(trained, tmp_path):
    from app.registry import CURRENT_POINTER, ModelRegistry

    _, model = trained
    reg_dir = tmp_path / "registry"
    registry = ModelRegistry(reg_dir)
    v1 = registry.save(model, {"history_points": 100})
    assert registry.current() is not None
    assert registry.current().version == v1

    # Simulate an external process writing a new model version to disk and updating current.txt
    v2 = "20261019T999999999999Z"
    import shutil
    shutil.copytree(reg_dir / v1, reg_dir / v2)
    (reg_dir / CURRENT_POINTER).write_text(v2, encoding="utf-8")

    reloaded = registry.current()
    assert reloaded is not None
    assert reloaded.version == v2

    # Verify seed_directory bootstrap on a fresh empty directory
    fresh_dir = tmp_path / "fresh_models"
    seeded_registry = ModelRegistry(fresh_dir, seed_directory=reg_dir)
    seeded = seeded_registry.current()
    assert seeded is not None
    assert seeded.version == v2

    # Corrupt/empty current.txt returns None instead of raising FileNotFoundError
    (fresh_dir / CURRENT_POINTER).write_text("non_existent_version", encoding="utf-8")
    assert seeded_registry.current() is None
    (fresh_dir / CURRENT_POINTER).write_text("   ", encoding="utf-8")
    assert seeded_registry.current() is None


def test_train_rejects_all_zero_demand():
    from datetime import date
    import pandas as pd

    products = pd.DataFrame([(1, "KS")], columns=["product_id", "category"])
    empty_history = pd.DataFrame(columns=["product_id", "day", "quantity"])
    panel = build_panel(empty_history, products, end=date(2026, 10, 11), start=date(2026, 1, 1))
    with pytest.raises(ValueError, match="all zero"):
        train(panel, TrainingSettings(horizon=HORIZON, origin_step=7, threads=1))
