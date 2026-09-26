"""Global LightGBM model: training, rolling-origin backtest, prediction and explanations."""

from __future__ import annotations

import math
from dataclasses import dataclass, field
from datetime import date

import lightgbm as lgb
import numpy as np
import pandas as pd

from app.evaluation import BASELINE_NAMES, all_metrics, baseline_forecasts, mae
from app.features import (
    CATEGORICAL_COLUMNS,
    FEATURE_COLUMNS,
    FEATURE_LABELS_VI,
    DemandPanel,
    baseline_level,
    make_features,
    make_targets,
    training_origins,
)

TWEEDIE_VARIANCE_POWER = 1.2
NUM_BOOST_ROUNDS = 400
BACKTEST_FOLDS = 4
BACKTEST_ORIGIN_STEP_DAYS = 7
TOP_EXPLANATION_FEATURES = 5
MIN_RESIDUALS_PER_PRODUCT = 3


def lightgbm_params(seed: int, threads: int) -> dict[str, object]:
    # Tweedie suits intermittent, non-negative, right-skewed pharmacy demand.
    return {
        "objective": "tweedie",
        "tweedie_variance_power": TWEEDIE_VARIANCE_POWER,
        "learning_rate": 0.05,
        "num_leaves": 31,
        "min_data_in_leaf": 20,
        "feature_fraction": 0.9,
        "bagging_fraction": 0.8,
        "bagging_freq": 1,
        "lambda_l2": 1.0,
        "seed": seed,
        "deterministic": True,
        "force_row_wise": True,
        "num_threads": threads,
        "verbosity": -1,
    }


@dataclass
class TrainingSettings:
    horizon: int
    origin_step: int = 3
    seed: int = 42
    threads: int = 2
    backtest_folds: int = BACKTEST_FOLDS


@dataclass
class TrainedModel:
    booster: lgb.Booster
    horizon: int
    as_of: date
    training_rows: int
    product_count: int
    backtest: dict[str, object]
    residual_std_by_product: dict[int, float]
    global_relative_rmse: float
    category_vocabulary: tuple[str, ...]
    feature_importance: list[dict[str, object]] = field(default_factory=list)


def _fit(features: pd.DataFrame, targets: np.ndarray, settings: TrainingSettings) -> lgb.Booster:
    dataset = lgb.Dataset(features[list(FEATURE_COLUMNS)], label=targets,
                          init_score=np.log(baseline_level(features, settings.horizon)),
                          categorical_feature=list(CATEGORICAL_COLUMNS), free_raw_data=False)
    return lgb.train(lightgbm_params(settings.seed, settings.threads), dataset, num_boost_round=NUM_BOOST_ROUNDS)


def _predict(booster: lgb.Booster, features: pd.DataFrame, horizon: int) -> np.ndarray:
    """Tweedie log link: forecast = level * exp(raw score). The booster never saw the offset."""
    raw = booster.predict(features[list(FEATURE_COLUMNS)], raw_score=True)
    return baseline_level(features, horizon) * np.exp(raw)


def _supervised_rows(panel: DemandPanel, origins: np.ndarray, horizon: int) -> tuple[pd.DataFrame, np.ndarray]:
    features = make_features(panel, origins, horizon)
    targets = make_targets(panel, origins, horizon)
    observed = ~np.isnan(targets)
    return features[observed].reset_index(drop=True), targets[observed]


def _mase_scale(panel: DemandPanel, origins: np.ndarray, horizon: int) -> float:
    """In-sample MAE of the naive forecast on training origins (Hyndman & Koehler, 2006)."""
    actual = make_targets(panel, origins, horizon)
    naive = baseline_forecasts(panel, origins, horizon)["naive"]
    observed = ~np.isnan(actual)
    return mae(actual[observed], naive[observed]) if observed.any() else float("nan")


def _mase_scale_by_product(panel: DemandPanel, origins: np.ndarray, horizon: int) -> np.ndarray:
    """Per-product in-sample naive MAE on training origins so fast movers do not dominate MASE."""
    n_products = len(panel.product_ids)
    n_origins = len(origins)
    if n_products == 0 or n_origins == 0:
        return np.full(n_products, np.nan)
    actual = make_targets(panel, origins, horizon).reshape(n_products, n_origins)
    naive = baseline_forecasts(panel, origins, horizon)["naive"].reshape(n_products, n_origins)
    abs_err = np.abs(actual - naive)
    with np.errstate(invalid="ignore"):
        per_product = np.nanmean(abs_err, axis=1)
    fallback = _mase_scale(panel, origins, horizon)
    return np.where(np.isfinite(per_product) & (per_product > 0), per_product, fallback)


def backtest(panel: DemandPanel, settings: TrainingSettings) -> tuple[dict[str, object], pd.DataFrame]:
    """Rolling-origin evaluation. Each fold trains only on rows whose target window ends on or
    before the fold cutoff, then forecasts the following origins — exactly as in production."""
    horizon = settings.horizon
    last_test_origin = panel.day_count - 1 - horizon
    origins_per_fold = max(1, horizon // BACKTEST_ORIGIN_STEP_DAYS)
    fold_span = origins_per_fold * BACKTEST_ORIGIN_STEP_DAYS

    folds: list[dict[str, object]] = []
    scales: list[float] = []
    residual_frames: list[pd.DataFrame] = []
    pooled: dict[str, list[np.ndarray]] = {
        "actual": [],
        "model": [],
        "scale": [],
        **{name: [] for name in BASELINE_NAMES},
    }
    for fold in range(settings.backtest_folds):
        cutoff = last_test_origin - (fold_span - BACKTEST_ORIGIN_STEP_DAYS) - (settings.backtest_folds - 1 - fold) * fold_span
        train_origins = training_origins(panel, horizon, settings.origin_step, last_origin=cutoff - horizon)
        if len(train_origins) == 0:
            continue
        test_origins = cutoff + BACKTEST_ORIGIN_STEP_DAYS * np.arange(origins_per_fold)
        train_x, train_y = _supervised_rows(panel, train_origins, horizon)
        if len(train_y) == 0 or train_y.sum() == 0:
            continue
        booster = _fit(train_x, train_y, settings)
        test_x = make_features(panel, test_origins, horizon)
        actual = make_targets(panel, test_origins, horizon)
        observed = ~np.isnan(actual)
        prediction = _predict(booster, test_x, horizon)
        baselines = baseline_forecasts(panel, test_origins, horizon)
        scale = _mase_scale(panel, train_origins, horizon)
        product_scales = _mase_scale_by_product(panel, train_origins, horizon)
        row_scales = np.repeat(product_scales, len(test_origins))[observed]
        scales.append(scale)

        y = actual[observed]
        fold_result: dict[str, object] = {
            "fold": fold + 1,
            "cutoff": panel.day_at(int(cutoff)).isoformat(),
            "train_rows": int(len(train_y)),
            "test_rows": int(observed.sum()),
            "model": all_metrics(y, prediction[observed], scale, scale_by_product=row_scales),
        }
        for name in BASELINE_NAMES:
            fold_result[name] = all_metrics(y, baselines[name][observed], scale, scale_by_product=row_scales)
            pooled[name].append(baselines[name][observed])
        pooled["actual"].append(y)
        pooled["model"].append(prediction[observed])
        pooled["scale"].append(row_scales)
        folds.append(fold_result)
        residual_frames.append(pd.DataFrame({
            "product_id": test_x["product_id"].to_numpy()[observed],
            "actual": y,
            "residual": y - prediction[observed],
        }))

    if not folds:
        return {"folds": [], "overall": {}}, pd.DataFrame(columns=["product_id", "actual", "residual"])
    actual_all = np.concatenate(pooled["actual"])
    scale_all = np.concatenate(pooled["scale"])
    mean_scale = float(np.nanmean(scales))
    overall = {"model": all_metrics(actual_all, np.concatenate(pooled["model"]), mean_scale, scale_by_product=scale_all)}
    for name in BASELINE_NAMES:
        overall[name] = all_metrics(actual_all, np.concatenate(pooled[name]), mean_scale, scale_by_product=scale_all)
    best_baseline = min(
        BASELINE_NAMES,
        key=lambda name: overall[name]["wape"] if math.isfinite(overall[name]["wape"]) else float("inf"),
    )
    best_wape = overall[best_baseline]["wape"]
    model_wape = overall["model"]["wape"]
    overall["best_baseline"] = best_baseline
    overall["wape_improvement_vs_best_baseline"] = (
        1 - model_wape / best_wape
        if best_wape and math.isfinite(best_wape) and math.isfinite(model_wape)
        else None
    )
    return {"folds": folds, "overall": overall}, pd.concat(residual_frames, ignore_index=True)


def train(panel: DemandPanel, settings: TrainingSettings) -> TrainedModel:
    report, residuals = backtest(panel, settings)

    origins = training_origins(panel, settings.horizon, settings.origin_step)
    features, targets = _supervised_rows(panel, origins, settings.horizon)
    if len(targets) == 0:
        raise ValueError("Not enough history to train: need at least 91 days plus the horizon.")
    if float(np.sum(targets)) <= 0:
        raise ValueError("Historical demand is all zero; cannot fit Tweedie model.")
    booster = _fit(features, targets, settings)

    residual_std: dict[int, float] = {}
    global_relative_rmse = 0.5
    if len(residuals):
        grouped = residuals.groupby("product_id")
        for product_id, group in grouped:
            if len(group) >= MIN_RESIDUALS_PER_PRODUCT:
                residual_std[int(product_id)] = float(np.sqrt(np.mean(group["residual"] ** 2)))
        mean_actual = residuals["actual"].mean()
        if mean_actual > 0:
            global_relative_rmse = float(np.sqrt(np.mean(residuals["residual"] ** 2)) / mean_actual)

    gains = booster.feature_importance(importance_type="gain")
    total_gain = gains.sum() or 1.0
    importance = sorted(
        ({"feature": name, "label": FEATURE_LABELS_VI[name], "share": float(gain / total_gain)}
         for name, gain in zip(FEATURE_COLUMNS, gains, strict=True)),
        key=lambda item: item["share"], reverse=True)

    return TrainedModel(
        booster=booster,
        horizon=settings.horizon,
        as_of=panel.day_at(panel.day_count - 1),
        training_rows=int(len(targets)),
        product_count=int(len(panel.product_ids)),
        backtest=report,
        residual_std_by_product=residual_std,
        global_relative_rmse=global_relative_rmse,
        category_vocabulary=panel.category_vocabulary,
        feature_importance=importance,
    )


@dataclass(frozen=True)
class Forecast:
    product_id: int
    quantity: float
    baseline_quantity: float
    daily_error_std: float
    explanation: list[dict[str, object]]


def predict(booster: lgb.Booster, panel: DemandPanel, horizon: int, residual_std_by_product: dict[int, float],
            global_relative_rmse: float) -> list[Forecast]:
    """Forecast total demand for the ``horizon`` days after the panel's last day, per product."""
    origin = np.array([panel.day_count - 1], dtype=np.int64)
    features = make_features(panel, origin, horizon)
    matrix = features[list(FEATURE_COLUMNS)]
    levels = baseline_level(features, horizon)
    prediction = _predict(booster, features, horizon)
    contributions = booster.predict(matrix, pred_contrib=True)

    forecasts: list[Forecast] = []
    for row, product_id in enumerate(features["product_id"].to_numpy()):
        quantity = float(prediction[row])
        c_base = float(contributions[row][-1])
        adjusted_baseline = float(levels[row] * math.exp(c_base))
        sigma_horizon = residual_std_by_product.get(int(product_id), global_relative_rmse * max(quantity, 1.0))
        forecasts.append(Forecast(
            product_id=int(product_id),
            quantity=quantity,
            baseline_quantity=adjusted_baseline,
            daily_error_std=float(sigma_horizon / math.sqrt(horizon)),
            explanation=_explain(matrix.iloc[row], contributions[row]),
        ))
    return forecasts


def _explain(values: pd.Series, contribution_row: np.ndarray) -> list[dict[str, object]]:
    """Top drivers. Contributions are additive in log space on top of the baseline level, so
    ``exp(c) - 1`` is each driver's multiplicative effect relative to that level."""
    by_feature: dict[str, dict[str, object]] = {}
    for name, contribution in zip(FEATURE_COLUMNS, contribution_row[:-1], strict=True):
        if name in ("season_sin", "season_cos"):
            key = "season"
            label = FEATURE_LABELS_VI.get("season", "Mùa vụ (chu kỳ năm)")
        else:
            key = name
            label = FEATURE_LABELS_VI[name]
        entry = by_feature.setdefault(key, {"feature": key, "label": label, "contribution": 0.0, "value": None})
        entry["contribution"] += float(contribution)
        if key not in ("season", "category"):
            value = values[name]
            if entry["value"] is None and not pd.isna(value):
                entry["value"] = round(float(value), 4)
    ranked = sorted(by_feature.values(), key=lambda item: abs(item["contribution"]), reverse=True)
    return [
        {**item, "effect_percent": round((math.exp(item["contribution"]) - 1) * 100, 1)}
        for item in ranked[:TOP_EXPLANATION_FEATURES]
    ]
