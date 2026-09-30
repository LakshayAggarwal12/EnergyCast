"""Creating, listing and reading forecasts."""
from __future__ import annotations

from pathlib import Path
from typing import Any

import numpy as np
import pandas as pd
from fastapi import HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.data.preprocessing import load_processed
from app.database.models import (
    ROLE_ADMIN, Dataset, DatasetStatus, Forecast, ForecastValue, ModelRecord, User,
)
from app.features.engineering import FeaturePlan
from app.ml.forecasting import ForecastError, generate_forecast
from app.ml.metrics import regression_metrics
from app.schemas.forecast import ForecastRequest
from app.services.model_store import ArtifactError, load_bundle
from app.services.publishing_service import published_model

UNPROCESSABLE = status.HTTP_422_UNPROCESSABLE_CONTENT
HISTORY_DAYS = 7


def _opt_float(v: Any) -> float | None:
    return None if v is None or (isinstance(v, float) and np.isnan(v)) else float(v)


def _step_minutes(dataset: Dataset, timestamps: list[pd.Timestamp] | None = None) -> int:
    derived = (dataset.config or {}).get("derived") or {}
    if derived.get("modeling_minutes"):
        return int(derived["modeling_minutes"])
    if timestamps and len(timestamps) > 1:
        return max(int((timestamps[1] - timestamps[0]).total_seconds() // 60), 1)
    return 60


def create_forecast(db: Session, user: User, req: ForecastRequest) -> dict[str, Any]:
    dataset = db.get(Dataset, req.dataset_id)
    if dataset is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Dataset not found.")
    model = published_model(db, dataset.id)
    if dataset.status != DatasetStatus.PUBLISHED or model is None:
        raise HTTPException(status.HTTP_409_CONFLICT, "Forecasting is unavailable: no model has been published for this dataset.")

    run = model.run
    plan = FeaturePlan.from_dict(run.config["plan"])
    if req.horizon > plan.horizon:
        raise HTTPException(UNPROCESSABLE, f"Horizon must be between 1 and {plan.horizon} steps for this model.")
    try:
        frame = load_processed(Path(dataset.processed_path))
        bundle = load_bundle(model.artifact_path)
    except ArtifactError as exc:
        raise HTTPException(status.HTTP_409_CONFLICT, f"Forecasting is temporarily unavailable: {exc}")
    except Exception:
        raise HTTPException(status.HTTP_409_CONFLICT, "Forecasting is temporarily unavailable: the dataset's processed data cannot be read.")

    target = bundle["target"]
    step = pd.Timedelta(minutes=plan.freq_minutes)
    if req.origin is not None:
        origin = pd.Timestamp(req.origin)
        test_start = pd.Timestamp(run.split["test"]["start"])
        last_valid = pd.Timestamp(frame[target].last_valid_index())
        if origin < test_start or origin >= last_valid:
            raise HTTPException(
                UNPROCESSABLE,
                f"A backtest must start inside the model's held-out test period: between {test_start} and "
                f"{last_valid - step} (earlier periods were used to train the model).",
            )
    try:
        result = generate_forecast(bundle, frame, req.horizon, req.origin)
    except ForecastError as exc:
        raise HTTPException(UNPROCESSABLE, str(exc))

    actuals = frame[target].reindex(result.predictions.index) if req.origin is not None else None
    forecast = Forecast(user_id=user.id, dataset_id=dataset.id, model_id=model.id, horizon=req.horizon)
    forecast.values = [
        ForecastValue(
            timestamp=ts.to_pydatetime(),
            predicted_value=float(pred),
            actual_value=_opt_float(actuals.loc[ts]) if actuals is not None else None,
        )
        for ts, pred in result.predictions.items()
    ]
    db.add(forecast)
    db.commit()
    db.refresh(forecast)
    return build_detail(db, forecast, dataset=dataset, model=model, frame=frame)


def build_detail(
    db: Session, forecast: Forecast, dataset: Dataset | None = None, model: ModelRecord | None = None,
    frame: pd.DataFrame | None = None,
) -> dict[str, Any]:
    dataset = dataset or db.get(Dataset, forecast.dataset_id)
    model = model or db.get(ModelRecord, forecast.model_id)
    values = sorted(forecast.values, key=lambda v: v.timestamp)
    stamps = [pd.Timestamp(v.timestamp) for v in values]
    step_minutes = _step_minutes(dataset, stamps)
    origin = stamps[0] - pd.Timedelta(minutes=step_minutes)
    is_backtest = any(v.actual_value is not None for v in values)

    metrics = None
    if is_backtest:
        pairs = [(v.actual_value, v.predicted_value) for v in values if v.actual_value is not None]
        metrics = regression_metrics([a for a, _ in pairs], [p for _, p in pairs])

    history: list[dict[str, Any]] = []
    target = dataset.target_column
    try:
        if frame is None and dataset.processed_path and Path(dataset.processed_path).exists():
            frame = load_processed(Path(dataset.processed_path))
        if frame is not None and target in frame.columns:
            per_day = 1440 // step_minutes if step_minutes < 1440 else 1
            past = frame[target].loc[:origin].iloc[-HISTORY_DAYS * per_day:]
            history = [{"timestamp": ts.to_pydatetime(), "value": _opt_float(v)} for ts, v in past.items()]
    except Exception:
        history = []  # the stored forecast is still returned; only the chart context is unavailable

    return {
        "id": forecast.id, "dataset_id": dataset.id, "dataset_name": dataset.name, "target_column": target,
        "model": {"id": model.id, "name": model.model_name, "category": model.category, "version": model.version} if model else None,
        "horizon": forecast.horizon, "step_minutes": step_minutes, "origin": origin.to_pydatetime(),
        "is_backtest": is_backtest, "created_at": forecast.created_at,
        "values": [{"timestamp": v.timestamp, "predicted": v.predicted_value, "actual": v.actual_value} for v in values],
        "history": history, "metrics": metrics,
    }


def get_forecast(db: Session, user: User, forecast_id: int) -> dict[str, Any]:
    forecast = db.get(Forecast, forecast_id)
    if forecast is None or (user.role != ROLE_ADMIN and forecast.user_id != user.id):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Forecast not found.")  # 404 also hides other users' ids
    return build_detail(db, forecast)


def list_forecasts(db: Session, user: User, limit: int, offset: int) -> list[dict[str, Any]]:
    stmt = (
        select(Forecast, Dataset, ModelRecord.model_name, User.name, User.email)
        .join(Dataset, Dataset.id == Forecast.dataset_id)
        .join(ModelRecord, ModelRecord.id == Forecast.model_id)
        .join(User, User.id == Forecast.user_id)
        .order_by(Forecast.created_at.desc(), Forecast.id.desc())
        .limit(limit).offset(offset)
    )
    if user.role != ROLE_ADMIN:
        stmt = stmt.where(Forecast.user_id == user.id)
    rows = db.execute(stmt).all()
    ids = [r[0].id for r in rows]
    agg = {}
    if ids:
        agg = {
            fid: (first, n_actual, mae)
            for fid, first, n_actual, mae in db.execute(
                select(
                    ForecastValue.forecast_id, func.min(ForecastValue.timestamp), func.count(ForecastValue.actual_value),
                    func.avg(func.abs(ForecastValue.predicted_value - ForecastValue.actual_value)),
                ).where(ForecastValue.forecast_id.in_(ids)).group_by(ForecastValue.forecast_id)
            )
        }
    out = []
    for forecast, dataset, model_name, user_name, user_email in rows:
        first, n_actual, mae = agg.get(forecast.id, (None, 0, None))
        step = _step_minutes(dataset)
        out.append({
            "id": forecast.id, "dataset_id": dataset.id, "dataset_name": dataset.name, "model_name": model_name,
            "horizon": forecast.horizon, "step_minutes": step,
            "origin": (pd.Timestamp(first) - pd.Timedelta(minutes=step)).to_pydatetime() if first else None,
            "is_backtest": bool(n_actual), "backtest_mae": float(mae) if mae is not None else None,
            "created_at": forecast.created_at,
            "user_name": user_name if user.role == ROLE_ADMIN else None,
            "user_email": user_email if user.role == ROLE_ADMIN else None,
        })
    return out
