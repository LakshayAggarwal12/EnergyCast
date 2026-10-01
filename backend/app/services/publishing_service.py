"""Publishing: an admin marks one trained model per dataset as the model users forecast with."""
from __future__ import annotations

from pathlib import Path
from typing import Any

import pandas as pd
from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.data.preprocessing import load_processed
from app.database.models import (
    ROLE_ADMIN, Dataset, DatasetStatus, ModelRecord, ModelStatus, TrainingRun, User,
)
from app.features.engineering import FeaturePlan
from app.ml.forecasting import ForecastError, generate_forecast
from app.schemas.forecast import AvailableDataset, PublishedModelSummary
from app.services.model_store import ArtifactError, load_bundle

UNPROCESSABLE = status.HTTP_422_UNPROCESSABLE_CONTENT


def published_model(db: Session, dataset_id: int) -> ModelRecord | None:
    return db.scalar(
        select(ModelRecord).where(ModelRecord.dataset_id == dataset_id, ModelRecord.status == ModelStatus.PUBLISHED)
    )


def publish_model(db: Session, model_id: int) -> ModelRecord:
    model = db.get(ModelRecord, model_id)
    if model is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Model not found.")
    # serialise publish/unpublish per dataset
    dataset = db.execute(select(Dataset).where(Dataset.id == model.dataset_id).with_for_update()).scalar_one()
    db.refresh(model)

    if model.status == ModelStatus.PUBLISHED:
        return model  # idempotent
    if model.status != ModelStatus.TRAINED:
        raise HTTPException(status.HTTP_409_CONFLICT, "Only successfully trained models can be published.")
    test_metrics = (model.metrics or {}).get("test") or {}
    if test_metrics.get("mae") is None:
        raise HTTPException(status.HTTP_409_CONFLICT, "This model has no held-out test evaluation and cannot be published.")
    if not dataset.processed_path or not Path(dataset.processed_path).exists():
        raise HTTPException(status.HTTP_409_CONFLICT, "The dataset's processed data is missing; process the dataset again.")

    # Publish only models that demonstrably work: run a real forecast from the latest data first.
    try:
        bundle = load_bundle(model.artifact_path)
        frame = load_processed(Path(dataset.processed_path))
        plan = FeaturePlan.from_dict(bundle["feature_plan"])
        generate_forecast(bundle, frame, horizon=plan.horizon)
    except ArtifactError as exc:
        raise HTTPException(status.HTTP_409_CONFLICT, str(exc))
    except ForecastError as exc:
        raise HTTPException(UNPROCESSABLE, f"The model failed a test forecast and was not published: {exc}")

    for other in db.scalars(
        select(ModelRecord).where(ModelRecord.dataset_id == dataset.id, ModelRecord.status == ModelStatus.PUBLISHED)
    ):
        other.status = ModelStatus.TRAINED
    model.status = ModelStatus.PUBLISHED
    dataset.status = DatasetStatus.PUBLISHED
    db.commit()
    db.refresh(model)
    return model


def unpublish_dataset(db: Session, dataset_id: int) -> Dataset:
    dataset = db.execute(select(Dataset).where(Dataset.id == dataset_id).with_for_update()).scalar_one_or_none()
    if dataset is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Dataset not found.")
    if dataset.status != DatasetStatus.PUBLISHED:
        raise HTTPException(status.HTTP_409_CONFLICT, "This dataset is not published.")
    for model in db.scalars(
        select(ModelRecord).where(ModelRecord.dataset_id == dataset.id, ModelRecord.status == ModelStatus.PUBLISHED)
    ):
        model.status = ModelStatus.TRAINED
    dataset.status = DatasetStatus.PROCESSED
    db.commit()
    db.refresh(dataset)
    return dataset


def _summary(model: ModelRecord) -> PublishedModelSummary:
    return PublishedModelSummary(
        id=model.id, model_name=model.model_name, category=model.category, version=model.version,
        test_metrics=(model.metrics or {}).get("test"),
    )


def available_datasets(db: Session, user: User) -> list[AvailableDataset]:
    stmt = select(Dataset).order_by(Dataset.created_at.desc(), Dataset.id.desc())
    if user.role != ROLE_ADMIN:
        stmt = stmt.where(Dataset.status == DatasetStatus.PUBLISHED)
    datasets = list(db.scalars(stmt))
    published = {
        m.dataset_id: m
        for m in db.scalars(
            select(ModelRecord).where(
                ModelRecord.dataset_id.in_([d.id for d in datasets] or [0]), ModelRecord.status == ModelStatus.PUBLISHED
            )
        )
    }
    out = []
    for d in datasets:
        model = published.get(d.id)
        out.append(AvailableDataset(
            id=d.id, name=d.name, energy_type=d.energy_type, status=d.status,
            frequency=(d.config.get("derived") or {}).get("modeling_frequency") or d.frequency,
            target_column=d.target_column, start_timestamp=d.start_timestamp, end_timestamp=d.end_timestamp,
            published_model=_summary(model) if model else None,
        ))
    return out


def _steps_text(steps: int, freq_minutes: int) -> str:
    minutes = steps * freq_minutes
    return f"{minutes // 1440} d" if minutes % 1440 == 0 and minutes >= 1440 else f"{minutes / 60:g} h"


def forecast_info(db: Session, dataset: Dataset) -> dict[str, Any]:
    """Everything the forecast form needs about a published dataset/model."""
    model = published_model(db, dataset.id)
    if dataset.status != DatasetStatus.PUBLISHED or model is None:
        raise HTTPException(status.HTTP_409_CONFLICT, "Forecasting is unavailable: no model has been published for this dataset.")
    run: TrainingRun = model.run
    plan = FeaturePlan.from_dict(run.config["plan"])
    target = run.config["target"]
    step = plan.freq_minutes

    try:
        frame = load_processed(Path(dataset.processed_path))
    except Exception:
        raise HTTPException(status.HTTP_409_CONFLICT, "The dataset's processed data is unavailable.")
    last_obs = pd.Timestamp(frame[target].last_valid_index())
    test_start = pd.Timestamp(run.split["test"]["start"])
    last_origin = last_obs - pd.Timedelta(minutes=step)

    groups: list[dict[str, Any]] = []
    if model.category == "feature_ml":
        if plan.use_calendar:
            groups.append({"name": "calendar", "display_name": "Calendar", "detail": "hour, weekday, month, season, weekend", "required": True, "selectable": False})
        if plan.lags:
            groups.append({"name": "lags", "display_name": "Recent consumption", "detail": "values from " + ", ".join(_steps_text(l, step) for l in plan.lags) + " earlier", "required": True, "selectable": False})
        if plan.rolling_windows:
            groups.append({"name": "rolling", "display_name": "Rolling averages", "detail": "mean and variability over " + ", ".join(_steps_text(w, step) for w in plan.rolling_windows), "required": True, "selectable": False})
        for col in plan.exogenous:
            groups.append({"name": col, "display_name": col, "detail": f"lagged by {_steps_text(plan.horizon, step)}", "required": False, "selectable": True})

    return {
        "dataset": {"id": dataset.id, "name": dataset.name, "energy_type": dataset.energy_type, "target_column": target},
        "model": {"id": model.id, "name": model.model_name, "category": model.category, "version": model.version,
                  "metrics": model.metrics},
        "horizon": {"max_steps": plan.horizon, "step_minutes": step},
        "data": {"start": str(frame.index[0]), "last_observation": str(last_obs), "steps": int(len(frame))},
        "backtest": {
            "min_origin": str(test_start),
            "max_origin": str(last_origin) if last_origin >= test_start else None,
        },
        "features": {
            "uses_features": model.category == "feature_ml",
            "groups": groups,
            "defaults": [g["name"] for g in groups],
        },
    }
