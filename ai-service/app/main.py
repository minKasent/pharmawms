"""HTTP API of the forecasting service. Internal only: every /v1 call needs X-Internal-Api-Key."""

from __future__ import annotations

import logging
import secrets
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from typing import Annotated

from fastapi import Depends, FastAPI, Header, HTTPException, Request, status
from fastapi.responses import JSONResponse
from pydantic.alias_generators import to_camel

from app.config import Settings, get_settings
from app.features import FEATURE_LABELS_VI
from app.registry import ModelRegistry
from app.schemas import ForecastRequest, ForecastResponse, ModelInfo, TrainingJob, TrainRequest
from app.service import ForecastingService, HorizonMismatchError, ModelNotTrainedError

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s - %(message)s")


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    settings = get_settings()
    app.state.service = ForecastingService(
        settings, ModelRegistry(settings.model_dir, seed_directory=settings.seed_model_dir)
    )
    yield
    app.state.service.shutdown()


app = FastAPI(title="PharmaWMS Forecasting Service", version="1.0.0", lifespan=lifespan)


def service(request: Request) -> ForecastingService:
    return request.app.state.service


def require_api_key(
    settings: Annotated[Settings, Depends(get_settings)],
    x_internal_api_key: Annotated[str | None, Header()] = None,
) -> None:
    if x_internal_api_key is None or not secrets.compare_digest(x_internal_api_key, settings.api_key):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="invalid internal api key")


Service = Annotated[ForecastingService, Depends(service)]
Authorized = Depends(require_api_key)


def problem(status_code: int, code: str, detail: str) -> JSONResponse:
    return JSONResponse(status_code=status_code, media_type="application/problem+json",
                        content={"status": status_code, "code": code, "detail": detail})


@app.exception_handler(ModelNotTrainedError)
async def model_not_trained(_: Request, __: ModelNotTrainedError) -> JSONResponse:
    return problem(status.HTTP_409_CONFLICT, "MODEL_NOT_TRAINED", "No model has been trained yet")


@app.exception_handler(HorizonMismatchError)
async def horizon_mismatch(_: Request, error: HorizonMismatchError) -> JSONResponse:
    return problem(status.HTTP_422_UNPROCESSABLE_CONTENT, "HORIZON_MISMATCH", str(error))


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "UP"}


@app.post("/v1/models:train", status_code=status.HTTP_202_ACCEPTED, dependencies=[Authorized],
          response_model=TrainingJob, response_model_by_alias=True)
def train_model(request: TrainRequest, forecasting: Service) -> TrainingJob:
    return forecasting.submit_training(request)


@app.get("/v1/models/jobs/{job_id}", dependencies=[Authorized], response_model=TrainingJob,
         response_model_by_alias=True)
def training_job(job_id: str, forecasting: Service) -> TrainingJob:
    job = forecasting.job(job_id)
    if job is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="unknown job")
    return job


@app.get("/v1/models/current", dependencies=[Authorized], response_model=ModelInfo, response_model_by_alias=True)
def current_model(forecasting: Service) -> ModelInfo:
    model = forecasting.current_model()
    if model is None:
        raise ModelNotTrainedError()
    metadata = model.metadata
    return ModelInfo(
        model_version=model.version,
        trained_at=metadata["trained_at"],
        as_of_date=metadata["as_of_date"],
        horizon_days=metadata["horizon_days"],
        training_rows=metadata["training_rows"],
        product_count=metadata["product_count"],
        backtest=camelize(metadata["backtest"]),
        feature_importance=camelize(current_labels(metadata["feature_importance"])),
    )


def current_labels(importance: list[dict[str, object]]) -> list[dict[str, object]]:
    """Labels are presentation only, so models trained before a wording change show the new text."""
    return [{**item, "label": FEATURE_LABELS_VI.get(str(item["feature"]), item["label"])} for item in importance]


@app.post("/v1/forecasts:batch", dependencies=[Authorized], response_model=ForecastResponse,
          response_model_by_alias=True)
def forecast(request: ForecastRequest, forecasting: Service) -> ForecastResponse:
    return forecasting.forecast(request)


def camelize(value: object) -> object:
    if isinstance(value, dict):
        return {to_camel(str(key)): camelize(item) for key, item in value.items()}
    if isinstance(value, list):
        return [camelize(item) for item in value]
    if isinstance(value, float) and (value != value or value == float("inf") or value == float("-inf")):
        return None
    return value
