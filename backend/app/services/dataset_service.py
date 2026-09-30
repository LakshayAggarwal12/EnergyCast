"""Dataset lifecycle: upload -> inspect -> configure -> validate -> process -> delete."""
from __future__ import annotations

import hashlib
import re
import shutil
import uuid
from pathlib import Path

import pandas as pd
from fastapi import HTTPException, UploadFile, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.config import get_settings
from app.data.loader import CsvFormatError, sniff_csv
from app.data.preprocessing import PreprocessingError, preprocess_dataset, save_processed
from app.data.profile import build_profile
from app.data.validator import validate_dataset
from app.database.models import Dataset, DatasetStatus, Feature, RunStatus, TrainingRun, User
from app.features.engineering import default_lags_and_windows
from app.schemas.dataset import DatasetConfigIn, FeatureToggle
from app.utils.frequency import FrequencyError, freq_to_minutes, minutes_to_alias

UPLOAD_CHUNK = 1024 * 1024
ENGINEERED_FEATURES = [
    ("calendar", "Calendar (hour, weekday, month, season, weekend)", "calendar"),
    ("target_lags", "Target lags (>= forecast horizon)", "lag"),
    ("target_rolling", "Rolling mean / std of target", "rolling"),
]


def _safe_display_name(filename: str | None) -> str:
    name = Path(filename or "upload.csv").name  # strips any client-supplied directory parts
    name = re.sub(r"[^\w.\- ()]", "_", name)
    return name[:255] or "upload.csv"


def _get_dataset(db: Session, dataset_id: int) -> Dataset:
    dataset = db.get(Dataset, dataset_id)
    if dataset is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Dataset not found.")
    return dataset


def get_dataset_or_404(db: Session, dataset_id: int) -> Dataset:
    return _get_dataset(db, dataset_id)


def _has_active_run(db: Session, dataset_id: int) -> bool:
    return db.scalar(
        select(TrainingRun.id).where(TrainingRun.dataset_id == dataset_id, TrainingRun.status.in_(RunStatus.ACTIVE)).limit(1)
    ) is not None


def _guard_no_active_run(db: Session, dataset: Dataset) -> None:
    if _has_active_run(db, dataset.id):
        raise HTTPException(status.HTTP_409_CONFLICT, "A training run is in progress for this dataset.")


def _guard_not_published(dataset: Dataset) -> None:
    if dataset.status == DatasetStatus.PUBLISHED:
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            "This dataset is published. Unpublish it before changing its configuration, re-validating, re-processing or deleting it.",
        )


def _remove_file(path: str | None) -> None:
    if path:
        Path(path).unlink(missing_ok=True)


# ---------------------------------------------------------------------------------------------------
def register_upload(db: Session, admin: User, upload: UploadFile, name: str, energy_type: str) -> Dataset:
    settings = get_settings()
    filename = upload.filename or ""
    if not filename.lower().endswith(".csv"):
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, "Only .csv files are supported.")
    if not name.strip() or not energy_type.strip():
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, "name and energy_type are required.")

    settings.ensure_storage_dirs()
    dest = settings.raw_dir / f"{uuid.uuid4().hex}.csv"  # server-generated name: no path traversal possible
    digest = hashlib.sha256()
    size = 0
    try:
        with open(dest, "wb") as out:
            while chunk := upload.file.read(UPLOAD_CHUNK):
                size += len(chunk)
                if size > settings.max_upload_bytes:
                    raise HTTPException(
                        status.HTTP_413_CONTENT_TOO_LARGE, f"File exceeds the {settings.MAX_UPLOAD_MB} MB upload limit."
                    )
                digest.update(chunk)
                out.write(chunk)
        if size == 0:
            raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, "The uploaded file is empty.")
        na_values = ["?"]
        meta = sniff_csv(dest)
        profile = build_profile(dest, meta, na_values)
    except CsvFormatError as exc:
        dest.unlink(missing_ok=True)
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, str(exc))
    except Exception:
        dest.unlink(missing_ok=True)
        raise

    dataset = Dataset(
        name=name.strip(), energy_type=energy_type.strip(), original_filename=_safe_display_name(filename),
        file_path=str(dest), file_size_bytes=size, sha256=digest.hexdigest(), status=DatasetStatus.UPLOADED,
        config={"csv_meta": meta.to_dict()}, schema_profile=profile, uploaded_by=admin.id,
    )
    db.add(dataset)
    db.commit()
    db.refresh(dataset)
    return dataset


def _sync_features(dataset: Dataset, exogenous: list[str]) -> None:
    """Feature rows = engineered groups + one row per exogenous column. Existing enabled flags are kept."""
    existing = {f.name: f for f in dataset.features}
    wanted: list[tuple[str, str, str]] = list(ENGINEERED_FEATURES) + [
        (c, f"{c} (lagged by the forecast horizon)", "exogenous") for c in exogenous
    ]
    wanted_names = {w[0] for w in wanted}
    for feature in list(dataset.features):
        if feature.name not in wanted_names:
            dataset.features.remove(feature)
    for name, display, ftype in wanted:
        if name not in existing:
            dataset.features.append(Feature(name=name, display_name=display, feature_type=ftype, enabled=True))


def apply_config(db: Session, dataset: Dataset, cfg: DatasetConfigIn) -> Dataset:
    _guard_not_published(dataset)
    _guard_no_active_run(db, dataset)
    columns = [c["name"] for c in (dataset.schema_profile or {}).get("columns", [])]
    referenced = cfg.timestamp_columns + [cfg.target_column] + cfg.exogenous_columns
    missing = [c for c in referenced if c not in columns]
    if missing:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, f"Unknown column(s): {', '.join(missing)}.")

    native_alias = None
    try:
        if cfg.frequency:
            native_alias = minutes_to_alias(freq_to_minutes(cfg.frequency))
        if cfg.modeling_frequency:
            freq_to_minutes(cfg.modeling_frequency)
    except FrequencyError as exc:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, str(exc))

    if cfg.name:
        dataset.name = cfg.name
    if cfg.energy_type:
        dataset.energy_type = cfg.energy_type
    dataset.timestamp_column = ",".join(cfg.timestamp_columns)
    dataset.target_column = cfg.target_column
    dataset.frequency = native_alias
    dataset.config = {
        "csv_meta": dataset.config["csv_meta"],
        "timestamp_columns": cfg.timestamp_columns,
        "datetime_format": cfg.datetime_format,
        "target_column": cfg.target_column,
        "exogenous_columns": cfg.exogenous_columns,
        "frequency": native_alias,
        "modeling_frequency": cfg.modeling_frequency,
        "forecast_horizon_steps": cfg.forecast_horizon_steps,
        "na_values": cfg.na_values,
        "max_interpolation_steps": cfg.max_interpolation_steps,
        "min_valid_fraction": cfg.min_valid_fraction,
        "train_ratio": cfg.train_ratio,
        "val_ratio": cfg.val_ratio,
    }
    # a configuration change invalidates everything derived from the previous one
    _remove_file(dataset.processed_path)
    dataset.processed_path = None
    dataset.validation_report = None
    dataset.preprocessing_report = None
    dataset.row_count = dataset.start_timestamp = dataset.end_timestamp = None
    dataset.status = DatasetStatus.CONFIGURED
    _sync_features(dataset, cfg.exogenous_columns)
    db.commit()
    db.refresh(dataset)
    return dataset


def update_features(db: Session, dataset: Dataset, toggles: list[FeatureToggle]) -> Dataset:
    _guard_no_active_run(db, dataset)
    by_name = {f.name: f for f in dataset.features}
    unknown = [t.name for t in toggles if t.name not in by_name]
    if unknown:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, f"Unknown feature(s): {', '.join(unknown)}.")
    for t in toggles:
        by_name[t.name].enabled = t.enabled
    db.commit()
    db.refresh(dataset)
    return dataset


def run_validation(db: Session, dataset: Dataset) -> Dataset:
    _guard_not_published(dataset)
    _guard_no_active_run(db, dataset)
    config = dataset.config
    if not config.get("timestamp_columns"):
        # Not configured yet. If the upload inspection found usable timestamp + target columns, the admin must
        # confirm them first. If it did not, the file cannot be configured meaningfully: reject it with the reasons.
        suggested = (dataset.schema_profile or {}).get("suggested_config", {})
        if suggested.get("timestamp_columns") and suggested.get("target_column"):
            raise HTTPException(
                status.HTTP_409_CONFLICT, "Configure the dataset (timestamp and target columns) before validating."
            )
        config = {**config, **{k: v for k, v in suggested.items() if k != "datetime_format"}}
    report = validate_dataset(Path(dataset.file_path), config)
    derived = report.get("derived") or {}
    dataset.validation_report = report
    dataset.preprocessing_report = None
    _remove_file(dataset.processed_path)
    dataset.processed_path = None
    if report["passed"]:
        dataset.status = DatasetStatus.VALIDATED
        dataset.config = {**dataset.config, "derived": derived}
        dataset.frequency = derived.get("native_frequency")
        dataset.row_count = derived.get("rows")
        dataset.start_timestamp = pd.Timestamp(derived["start"]).to_pydatetime() if derived.get("start") else None
        dataset.end_timestamp = pd.Timestamp(derived["end"]).to_pydatetime() if derived.get("end") else None
    else:
        dataset.status = DatasetStatus.REJECTED
        dataset.config = {k: v for k, v in dataset.config.items() if k != "derived"}
    db.commit()
    db.refresh(dataset)
    return dataset


def run_processing(db: Session, dataset: Dataset) -> Dataset:
    _guard_not_published(dataset)
    if dataset.status not in (DatasetStatus.VALIDATED, DatasetStatus.PROCESSED):
        raise HTTPException(status.HTTP_409_CONFLICT, "Only validated datasets can be processed. Validate the dataset first.")
    _guard_no_active_run(db, dataset)
    settings = get_settings()
    settings.ensure_storage_dirs()
    try:
        frame, report = preprocess_dataset(Path(dataset.file_path), dataset.config)
    except (PreprocessingError, CsvFormatError, ValueError) as exc:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, f"Preprocessing failed: {exc}")
    out_path = settings.processed_dir / f"dataset_{dataset.id}.parquet"
    save_processed(frame, out_path)
    dataset.processed_path = str(out_path)
    dataset.preprocessing_report = report
    dataset.status = DatasetStatus.PROCESSED
    db.commit()
    db.refresh(dataset)
    return dataset


def delete_dataset(db: Session, dataset: Dataset) -> None:
    _guard_not_published(dataset)
    _guard_no_active_run(db, dataset)
    settings = get_settings()
    _remove_file(dataset.file_path)
    _remove_file(dataset.processed_path)
    shutil.rmtree(settings.MODEL_STORAGE_PATH / f"dataset_{dataset.id}", ignore_errors=True)
    db.delete(dataset)
    db.commit()


def list_datasets(db: Session, only_status: str | None = None) -> list[Dataset]:
    stmt = select(Dataset).order_by(Dataset.created_at.desc(), Dataset.id.desc())
    if only_status:
        stmt = stmt.where(Dataset.status == only_status)
    return list(db.scalars(stmt))


def feature_defaults_for(dataset: Dataset) -> tuple[list[int], list[int]]:
    """Convenience for the training service."""
    derived = dataset.config["derived"]
    horizon = dataset.config.get("forecast_horizon_steps") or derived["default_horizon_steps"]
    return default_lags_and_windows(derived["modeling_minutes"], horizon)
