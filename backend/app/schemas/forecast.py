from __future__ import annotations

from datetime import datetime
from typing import Any

from pydantic import BaseModel, Field, field_validator


class ForecastRequest(BaseModel):
    dataset_id: int
    horizon: int = Field(ge=1, le=1000, description="Number of steps ahead (at the dataset's modeling frequency).")
    origin: datetime | None = Field(
        default=None,
        description="Optional backtest start inside the model's held-out test period; omit to forecast from the latest data.",
    )
    enabled_features: list[str] | None = Field(
        default=None,
        description="Feature groups/exogenous columns to use. Required groups cannot be omitted; omitted exogenous are held at their historical mean.",
    )

    @field_validator("origin")
    @classmethod
    def _naive(cls, v: datetime | None) -> datetime | None:
        if v is not None and v.tzinfo is not None:
            raise ValueError("origin must not include a timezone: dataset timestamps are naive local time.")
        return v


class ModelRef(BaseModel):
    id: int
    name: str
    category: str
    version: int


class ForecastPoint(BaseModel):
    timestamp: datetime
    predicted: float
    actual: float | None = None


class HistoryPoint(BaseModel):
    timestamp: datetime
    value: float | None


class ForecastMetricsOut(BaseModel):
    n: int
    mae: float | None
    rmse: float | None
    mape: float | None
    r2: float | None


class ForecastDetail(BaseModel):
    id: int
    dataset_id: int
    dataset_name: str
    target_column: str | None
    model: ModelRef | None
    horizon: int
    step_minutes: int
    origin: datetime
    is_backtest: bool
    created_at: datetime
    values: list[ForecastPoint]
    history: list[HistoryPoint]
    metrics: ForecastMetricsOut | None
    enabled_features: list[str] | None = None


class ForecastSummary(BaseModel):
    id: int
    dataset_id: int
    dataset_name: str
    model_name: str | None
    horizon: int
    step_minutes: int
    origin: datetime | None
    is_backtest: bool
    backtest_mae: float | None
    created_at: datetime
    user_name: str | None = None   # admins only
    user_email: str | None = None  # admins only


class PublishedModelSummary(BaseModel):
    id: int
    model_name: str
    category: str
    version: int
    test_metrics: dict[str, Any] | None


class AvailableDataset(BaseModel):
    id: int
    name: str
    energy_type: str
    status: str
    frequency: str | None
    target_column: str | None
    start_timestamp: datetime | None
    end_timestamp: datetime | None
    published_model: PublishedModelSummary | None
