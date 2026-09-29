"""Dataset validation: structure, timestamps, dtypes, duplicates, ordering, frequency,
missing values and basic data quality. Produces a JSON-serialisable report; does not modify data."""
from __future__ import annotations

from pathlib import Path
from typing import Any

import numpy as np
import pandas as pd
from pandas.api.types import is_numeric_dtype

from app.data.loader import CsvFormatError, CsvMeta, read_csv_frame
from app.data.timestamps import TimestampError, parse_timestamps
from app.utils.frequency import (
    FrequencyError,
    check_supported,
    default_horizon,
    freq_to_minutes,
    minutes_to_alias,
    resolve_modeling_minutes,
    steps_per_day,
)

MIN_OBSERVATIONS = 1000        # raw rows
MIN_HISTORY_DAYS = 120         # required history after resampling
BAD_TIMESTAMP_ERROR_PCT = 0.1  # above this share of unparseable timestamps the dataset is rejected
BAD_VALUE_ERROR_PCT = 5.0      # above this share of non-numeric target tokens the dataset is rejected


class _Report:
    def __init__(self) -> None:
        self.errors: list[dict[str, Any]] = []
        self.warnings: list[dict[str, Any]] = []
        self.checks: dict[str, Any] = {}
        self.derived: dict[str, Any] = {}

    def error(self, code: str, message: str, **details: Any) -> None:
        self.errors.append({"code": code, "message": message, **details})

    def warn(self, code: str, message: str, **details: Any) -> None:
        self.warnings.append({"code": code, "message": message, **details})

    def to_dict(self) -> dict[str, Any]:
        return {
            "passed": not self.errors,
            "errors": self.errors,
            "warnings": self.warnings,
            "checks": self.checks,
            "derived": self.derived,
        }


def _run_lengths(mask: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    """Start indices and lengths of consecutive True runs."""
    padded = np.concatenate(([0], mask.astype(np.int8), [0]))
    diff = np.diff(padded)
    starts = np.where(diff == 1)[0]
    ends = np.where(diff == -1)[0]
    return starts, ends - starts


def validate_dataset(path: Path, config: dict[str, Any]) -> dict[str, Any]:
    rep = _Report()
    ts_cols: list[str] = config.get("timestamp_columns") or []
    target: str | None = config.get("target_column")
    exogenous: list[str] = config.get("exogenous_columns") or []

    # ---- load -----------------------------------------------------------------
    try:
        meta = CsvMeta.from_dict(config["csv_meta"])
        df = read_csv_frame(path, meta, na_values=config.get("na_values") or ["?"])
    except CsvFormatError as exc:
        rep.error("unreadable_file", str(exc))
        return rep.to_dict()
    rep.checks["rows"] = int(len(df))
    rep.checks["columns"] = list(df.columns)
    rep.checks["header_present"] = meta.has_header

    # ---- required columns --------------------------------------------------------
    if not ts_cols:
        rep.error(
            "missing_timestamp",
            "No timestamp column is configured or detectable. A time-series dataset needs a parseable "
            "date/time column (or separate date and time columns); this file has none, so it cannot be "
            "used for forecasting." + ("" if meta.has_header else " The file also has no header row."),
        )
    if not target:
        rep.error("missing_target", "No target (energy consumption) column is configured.")
    required = [c for c in ts_cols + ([target] if target else []) + exogenous]
    absent = [c for c in required if c not in df.columns]
    if absent:
        rep.error("columns_not_found", f"Configured column(s) not found in the file: {', '.join(absent)}.", columns=absent)
    if rep.errors:
        return rep.to_dict()

    # ---- timestamps --------------------------------------------------------------
    try:
        ts, fmt = parse_timestamps(df, ts_cols, config.get("datetime_format"))
    except TimestampError as exc:
        rep.error("bad_timestamps", str(exc))
        return rep.to_dict()
    bad_ts = int(ts.isna().sum())
    bad_pct = 100.0 * bad_ts / max(len(ts), 1)
    rep.checks["timestamp"] = {
        "columns": ts_cols,
        "format": fmt,
        "unparseable": bad_ts,
        "unparseable_pct": round(bad_pct, 4),
    }
    rep.derived["datetime_format"] = fmt
    if bad_ts and bad_pct > BAD_TIMESTAMP_ERROR_PCT:
        rep.error("bad_timestamps", f"{bad_ts} timestamps ({bad_pct:.2f}%) could not be parsed with format {fmt}.")
        return rep.to_dict()
    if bad_ts:
        rep.warn("bad_timestamps", f"{bad_ts} rows have unparseable timestamps and will be dropped in preprocessing.")

    # ---- data types -----------------------------------------------------------------
    numeric: dict[str, pd.Series] = {}
    dtype_report: dict[str, Any] = {}
    for col in [target] + exogenous:
        series = df[col]
        if is_numeric_dtype(series):
            numeric[col] = series.astype("float64")
            dtype_report[col] = {"dtype": str(series.dtype), "non_numeric_tokens": 0}
            continue
        coerced = pd.to_numeric(series, errors="coerce")
        bad_mask = coerced.isna() & series.notna()
        n_bad = int(bad_mask.sum())
        pct = 100.0 * n_bad / max(len(series), 1)
        dtype_report[col] = {
            "dtype": str(series.dtype),
            "non_numeric_tokens": n_bad,
            "examples": [str(v) for v in series[bad_mask].unique()[:5]],
        }
        numeric[col] = coerced.astype("float64")
        if n_bad and (col != target or pct > BAD_VALUE_ERROR_PCT):
            rep.error(
                "non_numeric_values",
                f"Column '{col}' contains {n_bad} non-numeric values (e.g. {dtype_report[col]['examples']}).",
                column=col,
            )
        elif n_bad:
            rep.warn("non_numeric_values", f"Target has {n_bad} non-numeric values; treated as missing.", column=col)
    rep.checks["dtypes"] = dtype_report
    if rep.errors:
        return rep.to_dict()

    y = numeric[target]  # type: ignore[index]
    valid_ts = ts.notna()

    # ---- ordering + duplicates ---------------------------------------------------------
    vts = ts[valid_ts]
    out_of_order = int((vts.diff().dropna() < pd.Timedelta(0)).sum())
    dup_count = int(vts.duplicated().sum())
    rep.checks["ordering"] = {"chronological": out_of_order == 0, "out_of_order_steps": out_of_order}
    rep.checks["duplicates"] = {
        "duplicate_timestamps": dup_count,
        "duplicate_rows": int(df.loc[valid_ts].duplicated().sum()),
    }
    if out_of_order:
        rep.warn("not_chronological", f"{out_of_order} rows are out of chronological order; they will be sorted.")
    if dup_count:
        rep.warn("duplicate_timestamps", f"{dup_count} duplicate timestamps; numeric values will be averaged per timestamp.")
    if dup_count > 0.5 * len(vts):
        rep.error("duplicate_timestamps", "More than half of the timestamps are duplicates.")

    # ---- frequency -------------------------------------------------------------------------
    unique_ts = pd.DatetimeIndex(np.sort(vts.unique()))
    if len(unique_ts) < 3:
        rep.error("insufficient_observations", "Fewer than 3 distinct timestamps.")
        return rep.to_dict()
    deltas = pd.Series(np.diff(unique_ts.to_numpy()))
    mode_delta = pd.Timedelta(deltas.value_counts().idxmax())
    regular_fraction = float((deltas == mode_delta).mean())
    native_minutes = int(round(mode_delta.total_seconds() / 60))
    try:
        if mode_delta.total_seconds() % 60 != 0:
            raise FrequencyError("Sampling intervals below one minute or not a whole number of minutes are not supported.")
        check_supported(native_minutes)
    except FrequencyError as exc:
        rep.error("unsupported_frequency", str(exc), inferred_seconds=mode_delta.total_seconds())
        return rep.to_dict()
    native_alias = minutes_to_alias(native_minutes)

    gap_mask = (deltas > mode_delta).to_numpy()
    gap_steps = (deltas[gap_mask] / mode_delta - 1).round().astype(int)
    largest_gap = pd.Timedelta(deltas.max())
    rep.checks["frequency"] = {
        "inferred": native_alias,
        "regular_fraction": round(regular_fraction, 6),
        "gaps": int(gap_mask.sum()),
        "missing_timestamps_in_gaps": int(gap_steps.sum()),
        "largest_gap": str(largest_gap),
    }
    if regular_fraction < 0.5:
        rep.error("irregular_frequency", f"Timestamps are too irregular ({regular_fraction:.0%} share the most common interval).")
        return rep.to_dict()
    if regular_fraction < 0.99:
        rep.warn("irregular_frequency", f"Only {regular_fraction:.1%} of intervals equal {native_alias}; the rest will be treated as gaps.")
    if config.get("frequency"):
        try:
            configured = freq_to_minutes(config["frequency"])
        except FrequencyError as exc:
            rep.error("invalid_frequency", str(exc))
            return rep.to_dict()
        if configured != native_minutes:
            rep.error(
                "frequency_mismatch",
                f"Configured frequency {minutes_to_alias(configured)} does not match the inferred {native_alias}.",
            )
            return rep.to_dict()

    try:
        modeling_minutes = resolve_modeling_minutes(native_minutes, config.get("modeling_frequency"))
    except FrequencyError as exc:
        rep.error("invalid_modeling_frequency", str(exc))
        return rep.to_dict()

    # ---- missing values (on the full native grid, so absent rows count as missing) ---------------
    frame_y = pd.Series(y[valid_ts].to_numpy(), index=pd.DatetimeIndex(vts.to_numpy()))
    if dup_count:
        frame_y = frame_y.groupby(level=0).mean()
    frame_y = frame_y.sort_index()
    grid = pd.date_range(frame_y.index[0], frame_y.index[-1], freq=f"{native_minutes}min")
    on_grid = frame_y.reindex(grid)
    missing_mask = on_grid.isna().to_numpy()
    starts, lengths = _run_lengths(missing_mask)
    column_missing = {
        col: {"missing": int(numeric[col].isna().sum()), "missing_pct": round(float(numeric[col].isna().mean()) * 100, 4)}
        for col in [target] + exogenous
    }
    rep.checks["missing_values"] = {
        "per_column": column_missing,
        "rows_with_all_measurements_missing": int(pd.concat(numeric, axis=1).isna().all(axis=1).sum()),
        "target_missing_on_full_grid": int(missing_mask.sum()),
        "target_missing_pct_on_full_grid": round(float(missing_mask.mean()) * 100, 4),
        "target_missing_runs": int(len(lengths)),
        "longest_missing_run_steps": int(lengths.max()) if len(lengths) else 0,
        "longest_missing_run_start": str(grid[starts[lengths.argmax()]]) if len(lengths) else None,
    }
    if missing_mask.mean() > 0.5:
        rep.error("target_mostly_missing", "More than half of the target values are missing.")
    elif missing_mask.any():
        rep.warn(
            "missing_target",
            f"{int(missing_mask.sum())} target observations are missing ({missing_mask.mean():.2%}); "
            "short gaps are interpolated and long gaps stay missing (excluded from training/scoring).",
        )

    # ---- target quality (reported, never silently removed) --------------------------------------------
    observed = frame_y.dropna()
    if observed.empty or observed.nunique() <= 1:
        rep.error("constant_target", "The target column is empty or constant.")
        return rep.to_dict()
    q1, q3 = observed.quantile(0.25), observed.quantile(0.75)
    iqr = q3 - q1
    upper = q3 + 3 * iqr
    extreme = observed[observed > upper]
    rep.checks["target_quality"] = {
        "column": target,
        "min": float(observed.min()),
        "max": float(observed.max()),
        "mean": float(observed.mean()),
        "std": float(observed.std()),
        "negative_values": int((observed < 0).sum()),
        "zero_values": int((observed == 0).sum()),
        "extreme_high_values_3xIQR": int(len(extreme)),
        "extreme_high_threshold": float(upper),
        "largest_values": [float(v) for v in observed.nlargest(5).tolist()],
    }
    if (observed < 0).any():
        rep.warn("negative_target", f"{int((observed < 0).sum())} negative target values; energy consumption is normally non-negative.")
    if len(extreme):
        rep.warn("extreme_values", f"{len(extreme)} extreme high values (> 3×IQR fence) detected; kept, not removed.")

    # ---- sufficiency -------------------------------------------------------------------------------------
    span_days = (frame_y.index[-1] - frame_y.index[0]).total_seconds() / 86400
    modeling_steps = int(span_days * 1440 / modeling_minutes) + 1
    min_steps = MIN_HISTORY_DAYS * steps_per_day(modeling_minutes)
    rep.checks["sufficiency"] = {
        "rows": int(len(df)),
        "span_days": round(span_days, 2),
        "estimated_modeling_steps": modeling_steps,
        "required_modeling_steps": min_steps,
    }
    if len(df) < MIN_OBSERVATIONS:
        rep.error("insufficient_observations", f"{len(df)} rows; at least {MIN_OBSERVATIONS} are required.")
    elif modeling_steps < min_steps:
        rep.error(
            "insufficient_history",
            f"About {modeling_steps} modeling steps after resampling; at least {min_steps} ({MIN_HISTORY_DAYS} days) are required.",
        )

    rep.checks["time_range"] = {"start": str(frame_y.index[0]), "end": str(frame_y.index[-1])}
    rep.derived.update(
        {
            "native_minutes": native_minutes,
            "native_frequency": native_alias,
            "modeling_minutes": modeling_minutes,
            "modeling_frequency": minutes_to_alias(modeling_minutes),
            "steps_per_day": steps_per_day(modeling_minutes),
            "default_horizon_steps": default_horizon(modeling_minutes),
            "start": str(frame_y.index[0]),
            "end": str(frame_y.index[-1]),
            "rows": int(len(df)),
        }
    )
    return rep.to_dict()
