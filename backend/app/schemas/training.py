from __future__ import annotations

from datetime import datetime
from typing import Any

from pydantic import BaseModel, ConfigDict, Field


class TrainRequest(BaseModel):
    dataset_id: int
    models: list[str] | None = Field(default=None, description="Subset of models to train; all when omitted.")


class ModelOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    dataset_id: int
    run_id: int
    model_name: str
    category: str
    version: int
    status: str
    metrics: dict[str, Any] | None
    params: dict[str, Any] | None
    error_message: str | None
    training_seconds: float | None
    created_at: datetime


class TrainingRunOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    dataset_id: int
    version: int
    status: str
    stage: str | None
    config: dict[str, Any]
    split: dict[str, Any] | None
    summary: dict[str, Any] | None
    error_message: str | None
    created_at: datetime
    started_at: datetime | None
    finished_at: datetime | None


class TrainingRunDetail(TrainingRunOut):
    models: list[ModelOut]


class ModelComparison(BaseModel):
    dataset_id: int
    runs: list[TrainingRunOut]
    latest_run: TrainingRunOut | None
    latest_models: list[ModelOut]
    best_on_validation: dict[str, Any] | None
