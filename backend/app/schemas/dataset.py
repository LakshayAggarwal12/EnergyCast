from __future__ import annotations

from datetime import datetime
from typing import Any

from pydantic import BaseModel, ConfigDict, Field, model_validator


class FeatureOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    display_name: str
    feature_type: str
    enabled: bool


class FeatureToggle(BaseModel):
    name: str
    enabled: bool


class DatasetConfigIn(BaseModel):
    """Admin configuration of a dataset (product documentation, section 9.2)."""

    name: str | None = Field(default=None, min_length=1, max_length=200)
    energy_type: str | None = Field(default=None, min_length=1, max_length=80)
    timestamp_columns: list[str] = Field(min_length=1, max_length=2)
    datetime_format: str | None = None
    target_column: str = Field(min_length=1)
    exogenous_columns: list[str] = Field(default_factory=list)
    frequency: str | None = None            # native sampling frequency; inferred when omitted
    modeling_frequency: str | None = None   # defaults to hourly for sub-hourly data
    forecast_horizon_steps: int | None = Field(default=None, ge=1, le=1000)
    na_values: list[str] = Field(default_factory=lambda: ["?"])
    max_interpolation_steps: int = Field(default=6, ge=0, le=1000)
    min_valid_fraction: float = Field(default=0.5, gt=0, le=1)
    train_ratio: float = Field(default=0.70, gt=0.1, lt=0.9)
    val_ratio: float = Field(default=0.15, gt=0.05, lt=0.5)

    @model_validator(mode="after")
    def _consistent(self) -> "DatasetConfigIn":
        if self.target_column in self.timestamp_columns:
            raise ValueError("The target column cannot also be a timestamp column.")
        if self.target_column in self.exogenous_columns:
            raise ValueError("The target column cannot also be an exogenous feature.")
        if set(self.timestamp_columns) & set(self.exogenous_columns):
            raise ValueError("A timestamp column cannot also be an exogenous feature.")
        if len(set(self.exogenous_columns)) != len(self.exogenous_columns):
            raise ValueError("exogenous_columns contains duplicates.")
        if self.train_ratio + self.val_ratio >= 0.95:
            raise ValueError("train_ratio + val_ratio must leave at least 5% of the data for testing.")
        return self


class DatasetSummary(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    energy_type: str
    original_filename: str
    file_size_bytes: int
    status: str
    timestamp_column: str | None
    target_column: str | None
    frequency: str | None
    row_count: int | None
    start_timestamp: datetime | None
    end_timestamp: datetime | None
    created_at: datetime
    updated_at: datetime


class DatasetDetail(DatasetSummary):
    config: dict[str, Any]
    schema_profile: dict[str, Any] | None
    validation_report: dict[str, Any] | None
    preprocessing_report: dict[str, Any] | None
    features: list[FeatureOut]
