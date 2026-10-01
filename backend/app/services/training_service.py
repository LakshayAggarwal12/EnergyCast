"""Training runs: create (validate + snapshot config), execute in the background, persist models + artifacts."""
from __future__ import annotations

import sys
import traceback
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import joblib
import numpy as np
import pandas as pd
import sklearn
import statsmodels
import xgboost
from fastapi import HTTPException, status
from sqlalchemy import func, select, update
from sqlalchemy.orm import Session

from app.config import get_settings
from app.data.preprocessing import load_processed
from app.database.models import Dataset, DatasetStatus, ModelRecord, ModelStatus, RunStatus, TrainingRun
from app.database.session import SessionLocal
from app.features.engineering import FeaturePlan, default_lags_and_windows
from app.ml.training import TrainingConfig, available_specs, train_and_evaluate
from app.utils.frequency import default_horizon
from app.services.storage import upload_file_to_db, download_file_from_db


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


def build_training_config(dataset: Dataset, models: list[str] | None, tune: bool = True) -> TrainingConfig:
    derived = dataset.config["derived"]
    freq_minutes = int(derived["modeling_minutes"])
    horizon = int(dataset.config.get("forecast_horizon_steps") or default_horizon(freq_minutes))
    enabled = {f.name for f in dataset.features if f.enabled}
    lags, windows = default_lags_and_windows(freq_minutes, horizon)
    exogenous = [c for c in dataset.config.get("exogenous_columns", []) if c in enabled]
    plan = FeaturePlan(
        horizon=horizon,
        freq_minutes=freq_minutes,
        lags=lags if "target_lags" in enabled else [],
        rolling_windows=windows if "target_rolling" in enabled else [],
        use_calendar="calendar" in enabled,
        exogenous=exogenous,
    )
    if not (plan.lags or plan.rolling_windows or plan.use_calendar or plan.exogenous):
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, "All feature groups are disabled; enable at least one.")
    if models:
        spd = 1440 // freq_minutes if freq_minutes < 1440 else 1
        unknown = [m for m in models if m not in available_specs(spd, freq_minutes)]
        if unknown:
            raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, f"Unknown model(s): {', '.join(unknown)}.")
    return TrainingConfig(
        target=dataset.config["target_column"], plan=plan,
        train_ratio=float(dataset.config.get("train_ratio", 0.70)),
        val_ratio=float(dataset.config.get("val_ratio", 0.15)),
        models=list(dict.fromkeys(models)) if models else None,
        tune=tune,
    )


def create_run(db: Session, dataset: Dataset, user_id: int, models: list[str] | None, tune: bool = True) -> TrainingRun:
    if dataset.status not in (DatasetStatus.PROCESSED, DatasetStatus.PUBLISHED) or not dataset.processed_path or not Path(dataset.processed_path).exists():
        raise HTTPException(status.HTTP_409_CONFLICT, "The dataset must be validated and processed before training.")
    if db.scalar(select(TrainingRun.id).where(TrainingRun.dataset_id == dataset.id, TrainingRun.status.in_(RunStatus.ACTIVE)).limit(1)):
        raise HTTPException(status.HTTP_409_CONFLICT, "A training run is already in progress for this dataset.")
    cfg = build_training_config(dataset, models, tune)
    version = (db.scalar(select(func.max(TrainingRun.version)).where(TrainingRun.dataset_id == dataset.id)) or 0) + 1
    run = TrainingRun(
        dataset_id=dataset.id, version=version, status=RunStatus.QUEUED, stage="queued",
        config=cfg.to_dict(), created_by=user_id,
    )
    db.add(run)
    db.commit()
    db.refresh(run)
    return run


def _set_stage(run_id: int, stage: str) -> None:
    with SessionLocal() as db:
        db.execute(update(TrainingRun).where(TrainingRun.id == run_id).values(stage=stage[:200]))
        db.commit()


def _save_artifact(dir_: Path, outcome, cfg: TrainingConfig, feature_columns: list[str], trained_range: dict) -> str:
    dir_.mkdir(parents=True, exist_ok=True)
    path = dir_ / f"{outcome.name}.joblib"
    bundle = {
        "model_name": outcome.name,
        "category": outcome.category,
        "artifact": outcome.artifact,
        "target": cfg.target,
        "feature_plan": cfg.plan.to_dict(),
        "feature_columns": feature_columns,
        "trained_range": trained_range,
        "created_at": _utcnow().isoformat(),
        "libraries": {
            "python": sys.version.split()[0], "pandas": pd.__version__, "numpy": np.__version__,
            "scikit-learn": sklearn.__version__, "xgboost": xgboost.__version__, "statsmodels": statsmodels.__version__,
        },
    }
    joblib.dump(bundle, path, compress=3)
    return str(path)


def execute_run(run_id: int) -> None:
    """Background task: owns its DB sessions (the request session is closed by then)."""
    settings = get_settings()
    with SessionLocal() as db:
        run = db.get(TrainingRun, run_id)
        if run is None or run.status != RunStatus.QUEUED:
            return
        dataset = db.get(Dataset, run.dataset_id)
        run.status, run.stage, run.started_at = RunStatus.RUNNING, "loading processed data", _utcnow()
        db.commit()
        try:
            cfg = TrainingConfig.from_dict(run.config)
            download_file_from_db(db, "datasets", Path(dataset.processed_path).name, dataset.processed_path)
            frame = load_processed(Path(dataset.processed_path))
            output = train_and_evaluate(frame, cfg, progress=lambda msg: _set_stage(run_id, msg))

            _set_stage(run_id, "saving models")
            artifact_dir = settings.MODEL_STORAGE_PATH / f"dataset_{dataset.id}" / f"v{run.version}"
            trained_range = output.split["train"]
            for outcome in output.outcomes:
                artifact_path = None
                if outcome.status == ModelStatus.TRAINED:
                    artifact_path = _save_artifact(artifact_dir, outcome, cfg, output.feature_columns, trained_range)
                    # Upload model artifact
                    unique_name = f"dataset_{dataset.id}_v{run.version}_{outcome.name}.joblib"
                    upload_file_to_db(db, "models", artifact_path, unique_name)
                db.add(ModelRecord(
                    dataset_id=dataset.id, run_id=run.id, model_name=outcome.name, category=outcome.category,
                    version=run.version, metrics=outcome.metrics, params=outcome.params, artifact_path=artifact_path,
                    status=outcome.status, error_message=outcome.error, training_seconds=round(outcome.seconds, 3),
                ))
            run.split = output.split
            run.summary = {**output.summary, "feature_columns": output.feature_columns}
            run.status, run.stage, run.finished_at = RunStatus.COMPLETED, "completed", _utcnow()
            db.commit()
        except Exception as exc:
            db.rollback()
            traceback.print_exc()
            run = db.get(TrainingRun, run_id)
            run.status, run.stage, run.finished_at = RunStatus.FAILED, "failed", _utcnow()
            run.error_message = f"{type(exc).__name__}: {exc}"[:1000]
            db.commit()


def mark_interrupted_runs() -> int:
    """On startup: runs left queued/running by a previous process can never finish."""
    with SessionLocal() as db:
        result = db.execute(
            update(TrainingRun).where(TrainingRun.status.in_(RunStatus.ACTIVE)).values(
                status=RunStatus.FAILED, stage="failed", finished_at=_utcnow(),
                error_message="Interrupted: the server restarted while this run was in progress.",
            )
        )
        db.commit()
        return result.rowcount or 0


def model_comparison(db: Session, dataset_id: int) -> dict[str, Any]:
    from app.ml.evaluation import best_on_validation
    from app.schemas.training import ModelOut, TrainingRunOut

    runs = list(db.scalars(select(TrainingRun).where(TrainingRun.dataset_id == dataset_id).order_by(TrainingRun.version.desc()).limit(20)))
    latest = runs[0] if runs else None
    models: list[ModelRecord] = list(latest.models) if latest else []
    outs = [ModelOut.model_validate(m).model_dump() for m in models]

    def key(m: dict[str, Any]) -> float:
        v = ((m.get("metrics") or {}).get("validation") or {}).get("mae")
        return v if v is not None else float("inf")

    outs.sort(key=key)
    published = db.scalar(select(ModelRecord).where(ModelRecord.dataset_id == dataset_id, ModelRecord.status == ModelStatus.PUBLISHED))
    return {
        "published_model": ModelOut.model_validate(published).model_dump() if published else None,
        "dataset_id": dataset_id,
        "runs": [TrainingRunOut.model_validate(r).model_dump() for r in runs],
        "latest_run": TrainingRunOut.model_validate(latest).model_dump() if latest else None,
        "latest_models": outs,
        "best_on_validation": best_on_validation(outs),
    }
