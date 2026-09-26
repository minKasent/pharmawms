"""API contract shared with the Spring backend (JSON uses camelCase)."""

from __future__ import annotations

from datetime import date, datetime
from enum import StrEnum

from pydantic import BaseModel, ConfigDict, Field, model_validator
from pydantic.alias_generators import to_camel

MAX_HORIZON_DAYS = 91


class ApiModel(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True, frozen=True)


class DemandPoint(ApiModel):
    product_id: int = Field(ge=1)
    day: date
    quantity: float = Field(ge=0)


class ProductInfo(ApiModel):
    product_id: int = Field(ge=1)
    category: str | None = Field(default=None, max_length=100)


class DemandDataset(ApiModel):
    """Demand history up to and including ``as_of_date``. Days without a point mean zero demand."""

    as_of_date: date
    horizon_days: int = Field(ge=1, le=MAX_HORIZON_DAYS)
    products: list[ProductInfo] = Field(min_length=1)
    history: list[DemandPoint]

    @model_validator(mode="after")
    def history_not_in_future(self) -> DemandDataset:
        if any(point.day > self.as_of_date for point in self.history):
            raise ValueError("history contains days after asOfDate")
        if len({product.product_id for product in self.products}) != len(self.products):
            raise ValueError("products contains duplicate productId")
        return self


class TrainRequest(DemandDataset):
    pass


class ForecastRequest(DemandDataset):
    pass


class JobStatus(StrEnum):
    QUEUED = "QUEUED"
    RUNNING = "RUNNING"
    SUCCEEDED = "SUCCEEDED"
    FAILED = "FAILED"


class TrainingJob(ApiModel):
    job_id: str
    status: JobStatus
    submitted_at: datetime
    finished_at: datetime | None = None
    model_version: str | None = None
    error: str | None = None


class ExplanationItem(ApiModel):
    feature: str
    label: str
    value: float | None
    contribution: float
    effect_percent: float


class ProductForecast(ApiModel):
    product_id: int
    horizon_days: int
    quantity: float
    baseline_quantity: float = Field(description="Recent demand level the explanation effects are relative to")
    daily_error_std: float
    explanation: list[ExplanationItem]


class ForecastResponse(ApiModel):
    model_version: str
    as_of_date: date
    horizon_days: int
    forecasts: list[ProductForecast]


class ModelInfo(ApiModel):
    model_version: str
    trained_at: datetime
    as_of_date: date
    horizon_days: int
    training_rows: int
    product_count: int
    backtest: dict[str, object]
    feature_importance: list[dict[str, object]]
