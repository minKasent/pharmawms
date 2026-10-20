"""Application service: turns API datasets into panels and runs training / forecasting."""

from __future__ import annotations

import logging
import threading
import uuid
from concurrent.futures import ThreadPoolExecutor
from datetime import UTC, date, datetime, timedelta

import pandas as pd

from app.config import Settings
from app.features import DemandPanel, build_panel
from app.model import TrainingSettings, predict, train
from app.registry import LoadedModel, ModelRegistry
from app.schemas import (
    DemandDataset,
    ExplanationItem,
    ForecastResponse,
    JobStatus,
    ProductForecast,
    TrainingJob,
)

log = logging.getLogger(__name__)

# Features look back at most one year plus one horizon; older history is not needed to forecast.
FORECAST_LOOKBACK_DAYS = 364 + 91 + 1
MAX_JOBS = 50


class ModelNotTrainedError(Exception):
    pass


class HorizonMismatchError(Exception):
    pass


def to_panel(dataset: DemandDataset, start: date | None = None,
             category_vocabulary: tuple[str, ...] | None = None) -> DemandPanel:
    history = pd.DataFrame(
        [(p.product_id, p.day, p.quantity) for p in dataset.history],
        columns=["product_id", "day", "quantity"],
    )
    products = pd.DataFrame([(p.product_id, p.category) for p in dataset.products], columns=["product_id", "category"])
    return build_panel(history, products, end=dataset.as_of_date, start=start,
                       category_vocabulary=category_vocabulary)


class ForecastingService:
    def __init__(self, settings: Settings, registry: ModelRegistry) -> None:
        self._settings = settings
        self._registry = registry
        self._executor = ThreadPoolExecutor(max_workers=1, thread_name_prefix="training")
        self._jobs: dict[str, TrainingJob] = {}
        self._lock = threading.Lock()

    def submit_training(self, dataset: DemandDataset) -> TrainingJob:
        job = TrainingJob(job_id=uuid.uuid4().hex, status=JobStatus.QUEUED, submitted_at=datetime.now(UTC))
        self._store(job)
        self._executor.submit(self._run_training, job.job_id, dataset)
        return job

    def current_model(self) -> LoadedModel | None:
        return self._registry.current()

    def job(self, job_id: str) -> TrainingJob | None:
        with self._lock:
            return self._jobs.get(job_id)

    def forecast(self, dataset: DemandDataset) -> ForecastResponse:
        model = self._registry.current()
        if model is None:
            raise ModelNotTrainedError()
        if model.horizon != dataset.horizon_days:
            raise HorizonMismatchError(f"model horizon is {model.horizon} days, request asked {dataset.horizon_days}")
        lookback_start = dataset.as_of_date - timedelta(days=FORECAST_LOOKBACK_DAYS - 1)
        panel = to_panel(dataset, start=lookback_start, category_vocabulary=model.category_vocabulary)
        forecasts = predict(model.booster, panel, model.horizon, model.residual_std_by_product,
                            model.global_relative_rmse)
        return ForecastResponse(
            model_version=model.version,
            as_of_date=dataset.as_of_date,
            horizon_days=model.horizon,
            forecasts=[
                ProductForecast(
                    product_id=f.product_id,
                    horizon_days=model.horizon,
                    quantity=round(f.quantity, 2),
                    baseline_quantity=round(f.baseline_quantity, 2),
                    daily_error_std=round(f.daily_error_std, 4),
                    explanation=[ExplanationItem.model_validate(item) for item in f.explanation],
                )
                for f in forecasts
            ],
        )

    def shutdown(self) -> None:
        self._executor.shutdown(wait=False, cancel_futures=True)

    def _run_training(self, job_id: str, dataset: DemandDataset) -> None:
        self._update(job_id, status=JobStatus.RUNNING)
        try:
            settings = TrainingSettings(
                horizon=dataset.horizon_days,
                origin_step=self._settings.training_origin_step_days,
                seed=self._settings.random_seed,
                threads=self._settings.training_threads,
            )
            trained = train(to_panel(dataset), settings)
            version = self._registry.save(trained, {"history_points": len(dataset.history)})
            overall = trained.backtest.get("overall", {})
            log.info("Trained model %s: backtest %s", version, overall.get("model"))
            self._update(job_id, status=JobStatus.SUCCEEDED, model_version=version, finished_at=datetime.now(UTC))
        except Exception as error:  # noqa: BLE001 - a failed job must be reported, never crash the worker
            log.exception("Training job %s failed", job_id)
            self._update(job_id, status=JobStatus.FAILED, error=str(error)[:500], finished_at=datetime.now(UTC))

    def _store(self, job: TrainingJob) -> None:
        with self._lock:
            self._jobs[job.job_id] = job
            self._evict_old_jobs()

    def _update(self, job_id: str, **changes: object) -> None:
        with self._lock:
            if job_id in self._jobs:
                self._jobs[job_id] = self._jobs[job_id].model_copy(update=changes)
            self._evict_old_jobs()

    def _evict_old_jobs(self) -> None:
        if len(self._jobs) <= MAX_JOBS:
            return
        terminal = [
            jid for jid, job in self._jobs.items() if job.status in (JobStatus.SUCCEEDED, JobStatus.FAILED)
        ]
        for jid in terminal:
            if len(self._jobs) <= MAX_JOBS:
                break
            del self._jobs[jid]
        while len(self._jobs) > MAX_JOBS:
            oldest = next(iter(self._jobs))
            del self._jobs[oldest]
