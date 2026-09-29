"""ORM models. Tables follow the product documentation (section 15); `training_runs`
is the one addition, needed to track long-running training status per dataset."""
from __future__ import annotations

from datetime import datetime
from typing import Any

from sqlalchemy import (
    BigInteger,
    Boolean,
    DateTime,
    Float,
    ForeignKey,
    Integer,
    String,
    Text,
    UniqueConstraint,
    func,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database.base import Base

ROLE_ADMIN = "admin"
ROLE_USER = "user"


class DatasetStatus:
    UPLOADED = "uploaded"      # stored + schema inspected, not yet configured
    CONFIGURED = "configured"  # admin chose timestamp/target/features
    VALIDATED = "validated"    # passed validation
    REJECTED = "rejected"      # failed validation (see validation_report)
    PROCESSED = "processed"    # cleaned + resampled, ready for training
    PUBLISHED = "published"    # reserved for the next phase (model publication)


class RunStatus:
    QUEUED = "queued"
    RUNNING = "running"
    COMPLETED = "completed"
    FAILED = "failed"

    ACTIVE = (QUEUED, RUNNING)


class ModelStatus:
    TRAINED = "trained"
    FAILED = "failed"


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(120))
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True)
    password_hash: Mapped[str] = mapped_column(String(255))
    role: Mapped[str] = mapped_column(String(20), default=ROLE_USER)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class Dataset(Base):
    __tablename__ = "datasets"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(200))
    energy_type: Mapped[str] = mapped_column(String(80))
    original_filename: Mapped[str] = mapped_column(String(255))
    file_path: Mapped[str] = mapped_column(String(500))  # server-side only, never returned by the API
    file_size_bytes: Mapped[int] = mapped_column(BigInteger)
    sha256: Mapped[str] = mapped_column(String(64))
    status: Mapped[str] = mapped_column(String(20), default=DatasetStatus.UPLOADED, index=True)
    timestamp_column: Mapped[str | None] = mapped_column(String(200), nullable=True)  # comma-joined if split over 2 columns
    target_column: Mapped[str | None] = mapped_column(String(200), nullable=True)
    frequency: Mapped[str | None] = mapped_column(String(20), nullable=True)  # native sampling frequency
    config: Mapped[dict[str, Any]] = mapped_column(JSONB, default=dict)
    schema_profile: Mapped[dict[str, Any] | None] = mapped_column(JSONB, nullable=True)
    validation_report: Mapped[dict[str, Any] | None] = mapped_column(JSONB, nullable=True)
    preprocessing_report: Mapped[dict[str, Any] | None] = mapped_column(JSONB, nullable=True)
    processed_path: Mapped[str | None] = mapped_column(String(500), nullable=True)
    row_count: Mapped[int | None] = mapped_column(BigInteger, nullable=True)
    start_timestamp: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    end_timestamp: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    uploaded_by: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    features: Mapped[list[Feature]] = relationship(
        back_populates="dataset", cascade="all, delete-orphan", order_by="Feature.id"
    )
    runs: Mapped[list[TrainingRun]] = relationship(
        back_populates="dataset", cascade="all, delete-orphan", order_by="TrainingRun.version"
    )
    models: Mapped[list[ModelRecord]] = relationship(back_populates="dataset", cascade="all, delete-orphan")


class Feature(Base):
    __tablename__ = "features"
    __table_args__ = (UniqueConstraint("dataset_id", "name", name="uq_feature_dataset_name"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    dataset_id: Mapped[int] = mapped_column(ForeignKey("datasets.id", ondelete="CASCADE"), index=True)
    name: Mapped[str] = mapped_column(String(200))
    display_name: Mapped[str] = mapped_column(String(200))
    feature_type: Mapped[str] = mapped_column(String(30))  # calendar | lag | rolling | exogenous
    enabled: Mapped[bool] = mapped_column(Boolean, default=True)

    dataset: Mapped[Dataset] = relationship(back_populates="features")


class TrainingRun(Base):
    __tablename__ = "training_runs"
    __table_args__ = (UniqueConstraint("dataset_id", "version", name="uq_run_dataset_version"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    dataset_id: Mapped[int] = mapped_column(ForeignKey("datasets.id", ondelete="CASCADE"), index=True)
    version: Mapped[int] = mapped_column(Integer)
    status: Mapped[str] = mapped_column(String(20), default=RunStatus.QUEUED, index=True)
    stage: Mapped[str | None] = mapped_column(String(200), nullable=True)
    config: Mapped[dict[str, Any]] = mapped_column(JSONB, default=dict)
    split: Mapped[dict[str, Any] | None] = mapped_column(JSONB, nullable=True)
    summary: Mapped[dict[str, Any] | None] = mapped_column(JSONB, nullable=True)
    error_message: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_by: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    finished_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    dataset: Mapped[Dataset] = relationship(back_populates="runs")
    models: Mapped[list[ModelRecord]] = relationship(back_populates="run", cascade="all, delete-orphan")


class ModelRecord(Base):
    __tablename__ = "models"

    id: Mapped[int] = mapped_column(primary_key=True)
    dataset_id: Mapped[int] = mapped_column(ForeignKey("datasets.id", ondelete="CASCADE"), index=True)
    run_id: Mapped[int] = mapped_column(ForeignKey("training_runs.id", ondelete="CASCADE"), index=True)
    model_name: Mapped[str] = mapped_column(String(80))
    category: Mapped[str] = mapped_column(String(40))  # baseline | classical | feature_ml
    version: Mapped[int] = mapped_column(Integer)
    metrics: Mapped[dict[str, Any] | None] = mapped_column(JSONB, nullable=True)
    params: Mapped[dict[str, Any] | None] = mapped_column(JSONB, nullable=True)
    artifact_path: Mapped[str | None] = mapped_column(String(500), nullable=True)  # server-side only
    status: Mapped[str] = mapped_column(String(20))
    error_message: Mapped[str | None] = mapped_column(Text, nullable=True)
    training_seconds: Mapped[float | None] = mapped_column(Float, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    dataset: Mapped[Dataset] = relationship(back_populates="models")
    run: Mapped[TrainingRun] = relationship(back_populates="models")


class Forecast(Base):
    """Reserved for the user-forecasting phase (documented schema, no endpoints yet)."""

    __tablename__ = "forecasts"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    dataset_id: Mapped[int] = mapped_column(ForeignKey("datasets.id", ondelete="CASCADE"), index=True)
    model_id: Mapped[int] = mapped_column(ForeignKey("models.id", ondelete="CASCADE"))
    horizon: Mapped[int] = mapped_column(Integer)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    values: Mapped[list[ForecastValue]] = relationship(cascade="all, delete-orphan")


class ForecastValue(Base):
    __tablename__ = "forecast_values"

    id: Mapped[int] = mapped_column(primary_key=True)
    forecast_id: Mapped[int] = mapped_column(ForeignKey("forecasts.id", ondelete="CASCADE"), index=True)
    timestamp: Mapped[datetime] = mapped_column(DateTime)
    predicted_value: Mapped[float] = mapped_column(Float)
    actual_value: Mapped[float | None] = mapped_column(Float, nullable=True)
