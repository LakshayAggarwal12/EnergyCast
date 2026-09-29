"""Cleaning and resampling with Pandas/NumPy. Every step is counted in a report; nothing is dropped silently."""
from __future__ import annotations

from pathlib import Path
from typing import Any

import numpy as np
import pandas as pd

from app.data.loader import CsvMeta, read_csv_frame
from app.data.timestamps import parse_timestamps
from app.utils.frequency import minutes_to_alias

OBSERVED_COL = "target_observed"   # True where the target was really measured (not imputed / missing)
IMPUTED_COL = "target_imputed"     # True where a short gap was filled by interpolation


class PreprocessingError(ValueError):
    pass


def fill_short_gaps(series: pd.Series, max_len: int) -> pd.Series:
    """Time-interpolate only runs of missing values no longer than `max_len`; longer runs and
    leading/trailing gaps stay missing (they are never partially filled)."""
    isna = series.isna()
    if max_len <= 0 or not isna.any():
        return series
    run_id = (isna != isna.shift()).cumsum()
    run_len = isna.groupby(run_id).transform("size")
    short = isna & (run_len <= max_len)
    interpolated = series.interpolate(method="time", limit_area="inside")
    return series.where(~short, interpolated)


def resample_to_modeling_grid(
    frame: pd.DataFrame, native_minutes: int, modeling_minutes: int, min_valid_fraction: float
) -> pd.DataFrame:
    """Aggregate (mean) to the modeling frequency. A bin is kept only if at least `min_valid_fraction`
    of its native observations are valid; the result is on a complete regular grid."""
    alias = minutes_to_alias(modeling_minutes)
    per_bin = modeling_minutes // native_minutes
    grouped = frame.resample(alias)
    means = grouped.mean()
    counts = grouped.count()
    coverage = counts / per_bin
    return means.where(coverage >= min_valid_fraction)


def preprocess_dataset(path: Path, config: dict[str, Any]) -> tuple[pd.DataFrame, dict[str, Any]]:
    derived = config.get("derived")
    if not derived:
        raise PreprocessingError("The dataset must be validated before it can be processed.")
    ts_cols: list[str] = config["timestamp_columns"]
    target: str = config["target_column"]
    exogenous: list[str] = config.get("exogenous_columns") or []
    native_minutes = int(derived["native_minutes"])
    modeling_minutes = int(derived["modeling_minutes"])
    min_valid_fraction = float(config.get("min_valid_fraction", 0.5))
    max_interp = int(config.get("max_interpolation_steps", 6))

    df = read_csv_frame(path, CsvMeta.from_dict(config["csv_meta"]), na_values=config.get("na_values") or ["?"])
    rows_raw = int(len(df))
    ts, _ = parse_timestamps(df, ts_cols, derived.get("datetime_format"))

    columns = [target] + exogenous
    frame = pd.DataFrame({c: pd.to_numeric(df[c], errors="coerce").astype("float64") for c in columns})
    frame.index = pd.DatetimeIndex(ts.to_numpy(), name="timestamp")
    del df

    report: dict[str, Any] = {"rows_raw": rows_raw}
    bad_ts = int(frame.index.isna().sum())
    frame = frame[frame.index.notna()]
    report["dropped_unparseable_timestamps"] = bad_ts

    report["was_sorted"] = bool(frame.index.is_monotonic_increasing)
    frame = frame.sort_index()

    dups = int(frame.index.duplicated().sum())
    report["duplicate_timestamps_averaged"] = dups
    if dups:
        frame = frame.groupby(level=0).mean()

    native_alias = minutes_to_alias(native_minutes)
    modeling_alias = minutes_to_alias(modeling_minutes)
    if modeling_minutes == native_minutes:
        frame = frame.asfreq(native_alias)
        method = "reindexed to a complete regular grid (no aggregation)"
    else:
        frame = resample_to_modeling_grid(frame, native_minutes, modeling_minutes, min_valid_fraction)
        method = (
            f"mean over each {modeling_alias} bin; bins with < {min_valid_fraction:.0%} valid native "
            f"observations set to missing"
        )
    report.update(
        {
            "native_frequency": native_alias,
            "modeling_frequency": modeling_alias,
            "resampling": method,
            "steps_after_resampling": int(len(frame)),
            "start": str(frame.index[0]),
            "end": str(frame.index[-1]),
        }
    )

    observed = frame[target].notna()
    filled = pd.DataFrame({c: fill_short_gaps(frame[c], max_interp) for c in columns}, index=frame.index)
    imputed = filled[target].notna() & ~observed
    remaining = filled[target].isna().to_numpy()

    starts, lengths = (np.array([], dtype=int), np.array([], dtype=int))
    if remaining.any():
        padded = np.concatenate(([0], remaining.astype(np.int8), [0]))
        d = np.diff(padded)
        starts, ends = np.where(d == 1)[0], np.where(d == -1)[0]
        lengths = ends - starts

    valid = filled[target].dropna()
    q1, q3 = valid.quantile(0.25), valid.quantile(0.75)
    fence = q3 + 3 * (q3 - q1)
    report.update(
        {
            "target_missing_before_imputation": int((~observed).sum()),
            "short_gaps_interpolated_steps": int(imputed.sum()),
            "max_interpolation_steps": max_interp,
            "target_still_missing_steps": int(remaining.sum()),
            "target_still_missing_pct": round(float(remaining.mean()) * 100, 4),
            "long_gaps": int(len(lengths)),
            "longest_remaining_gap_steps": int(lengths.max()) if len(lengths) else 0,
            "longest_remaining_gap_start": str(filled.index[starts[lengths.argmax()]]) if len(lengths) else None,
            "extreme_high_values_kept": int((valid > fence).sum()),
            "outlier_policy": "reported, not removed",
            "target_summary": {
                "min": float(valid.min()),
                "max": float(valid.max()),
                "mean": float(valid.mean()),
                "std": float(valid.std()),
            },
            "columns": columns,
        }
    )

    out = filled.copy()
    out[OBSERVED_COL] = observed.to_numpy()
    out[IMPUTED_COL] = imputed.to_numpy()

    spd = 1440 // modeling_minutes if modeling_minutes < 1440 else 1
    if int(observed.sum()) < 120 * spd:
        raise PreprocessingError(
            f"Only {int(observed.sum())} valid modeling steps after cleaning; at least {120 * spd} are required."
        )
    return out, report


def save_processed(frame: pd.DataFrame, path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    frame.to_parquet(path, engine="pyarrow")


def load_processed(path: Path) -> pd.DataFrame:
    frame = pd.read_parquet(path, engine="pyarrow")
    frame.index = pd.DatetimeIndex(frame.index, name="timestamp")
    return frame
