"""Cleaning and resampling with Pandas/NumPy. Every step is counted in a report; nothing is dropped silently.

Memory-safe: the CSV is streamed in chunks and aggregated into per-bin sums and counts as it is read, so the
full-resolution table (2 million rows for minute data) is never held in memory. The result is identical to
resampling the whole file at once."""
from __future__ import annotations

from pathlib import Path
from typing import Any

import numpy as np
import pandas as pd

from app.data.loader import CsvMeta, iter_csv_chunks, sample_rows
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


def _stream_to_modeling_grid(
    path: Path, config: dict[str, Any], derived: dict[str, Any], columns: list[str],
    native_minutes: int, modeling_minutes: int, min_valid_fraction: float,
) -> tuple[pd.DataFrame, int, int, bool, int]:
    """Read the CSV in chunks and return (modeling-grid frame, raw rows, unparseable timestamps, was_sorted,
    duplicate timestamps averaged). Duplicate timestamps are averaged when they are adjacent (always the case in
    chronologically ordered files, including across chunk boundaries)."""
    meta = CsvMeta.from_dict(config["csv_meta"])
    na_values = config.get("na_values") or ["?"]
    ts_cols: list[str] = config["timestamp_columns"]
    fmt = derived.get("datetime_format")
    if not fmt:
        _, fmt = parse_timestamps(sample_rows(path, meta, na_values), ts_cols, None)

    same = modeling_minutes == native_minutes
    alias = minutes_to_alias(modeling_minutes)
    per_bin = max(modeling_minutes // native_minutes, 1)

    acc_sum: pd.DataFrame | None = None
    acc_cnt: pd.DataFrame | None = None
    kept: list[pd.DataFrame] = []              # only used when no aggregation is needed (native == modeling)
    rows_raw = bad_ts = dups = 0
    was_sorted = True
    prev_max: pd.Timestamp | None = None
    carry: pd.DataFrame | None = None

    def fold(part: pd.DataFrame) -> None:
        nonlocal acc_sum, acc_cnt, dups
        if part.empty:
            return
        dup_mask = part.index.duplicated()
        if dup_mask.any():
            dups += int(dup_mask.sum())
            part = part.groupby(level=0).mean()
        if same:
            kept.append(part)
            return
        grouped = part.groupby(part.index.floor(alias))
        s_, c_ = grouped.sum(), grouped.count()
        acc_sum = s_ if acc_sum is None else acc_sum.add(s_, fill_value=0.0)
        acc_cnt = c_ if acc_cnt is None else acc_cnt.add(c_, fill_value=0)

    for chunk in iter_csv_chunks(path, meta, na_values):
        rows_raw += len(chunk)
        ts, _ = parse_timestamps(chunk, ts_cols, fmt)
        vals = pd.DataFrame({c: pd.to_numeric(chunk[c], errors="coerce").astype("float64") for c in columns})
        vals.index = pd.DatetimeIndex(ts.to_numpy(), name="timestamp")
        del chunk, ts
        ok = vals.index.notna()
        bad_ts += int((~ok).sum())
        part = vals[ok]
        del vals
        if len(part):
            idx = part.index
            if not idx.is_monotonic_increasing or (prev_max is not None and idx[0] < prev_max):
                was_sorted = False
            prev_max = idx.max() if prev_max is None else max(prev_max, idx.max())
            if carry is not None:
                part, carry = pd.concat([carry, part]), None
            boundary = part.index == part.index[-1]      # rows sharing the last timestamp may continue in the next chunk
            carry, part = part[boundary], part[~boundary]
        fold(part)
    if carry is not None:
        fold(carry)

    if same:
        if not kept:
            raise PreprocessingError("The file contains no rows with a valid timestamp.")
        frame = pd.concat(kept)
        del kept
        cross = frame.index.duplicated()
        if cross.any():
            dups += int(cross.sum())
            frame = frame.groupby(level=0).mean()
        frame = frame.sort_index().asfreq(minutes_to_alias(native_minutes))
    else:
        if acc_sum is None or acc_cnt is None:
            raise PreprocessingError("The file contains no rows with a valid timestamp.")
        means = acc_sum / acc_cnt.where(acc_cnt > 0)
        coverage = acc_cnt / per_bin
        means = means.where(coverage >= min_valid_fraction).sort_index()
        frame = means.reindex(pd.date_range(means.index[0], means.index[-1], freq=alias))
    frame.index.name = "timestamp"
    return frame, rows_raw, bad_ts, was_sorted, dups


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

    columns = [target] + exogenous
    native_alias = minutes_to_alias(native_minutes)
    modeling_alias = minutes_to_alias(modeling_minutes)
    frame, rows_raw, bad_ts, was_sorted, dups = _stream_to_modeling_grid(
        path, config, derived, columns, native_minutes, modeling_minutes, min_valid_fraction
    )
    report: dict[str, Any] = {"rows_raw": rows_raw}
    report["dropped_unparseable_timestamps"] = bad_ts
    report["was_sorted"] = was_sorted
    report["duplicate_timestamps_averaged"] = dups
    if modeling_minutes == native_minutes:
        method = "reindexed to a complete regular grid (no aggregation)"
    else:
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
