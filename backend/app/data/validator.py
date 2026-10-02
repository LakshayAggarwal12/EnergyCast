"""Dataset validation: structure, timestamps, dtypes, duplicates, ordering, frequency,
missing values and basic data quality. Produces a JSON-serialisable report; does not modify data.

Memory-safe: the CSV is read in chunks of ~100k rows and only two compact arrays are kept for the whole file
(timestamps as int64 and the target as float64: about 32 MB for 2 million rows). Parsing the file into one
DataFrame, as before, needed ~800 MB, which exceeds a 512 MB free-tier instance."""
from __future__ import annotations

from pathlib import Path
from typing import Any

import numpy as np
import pandas as pd
from pandas.api.types import is_numeric_dtype

from app.data.loader import CsvFormatError, CsvMeta, count_data_rows, iter_csv_chunks, sample_rows
from app.data.timestamps import TimestampError, detect_format, parse_timestamps
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


def _ns(ts: pd.Series) -> np.ndarray:
    return ts.to_numpy(dtype="datetime64[ns]")


def _scan(path: Path, meta: CsvMeta, na_values: list[str], ts_cols: list[str], fmt: str, target: str, exogenous: list[str], capacity: int) -> dict[str, Any]:
    """One streaming pass: collects the timestamp and target arrays plus per-column quality counters."""
    cols = [target] + exogenous
    stats = {c: {"nan": 0, "bad": 0, "examples": [], "dtypes": [], "numeric": True} for c in cols}
    ts_buf = np.empty(max(capacity, 1), dtype="datetime64[ns]")   # filled in place: no list-of-chunks + concatenate spike
    y_buf = np.empty(max(capacity, 1), dtype="float64")
    rows = bad_ts = dup_rows = all_missing = 0
    for chunk in iter_csv_chunks(path, meta, na_values):
        n_chunk = len(chunk)
        if rows + n_chunk > len(ts_buf):                          # line count was an underestimate: grow
            grow = max(n_chunk, len(ts_buf) // 4)
            ts_buf = np.concatenate([ts_buf, np.empty(grow, dtype="datetime64[ns]")])
            y_buf = np.concatenate([y_buf, np.empty(grow, dtype="float64")])
        rows += n_chunk
        ts, _ = parse_timestamps(chunk, ts_cols, fmt)
        bad_ts += int(ts.isna().sum())
        numeric: dict[str, pd.Series] = {}
        for col in cols:
            series, st = chunk[col], stats[col]
            st["dtypes"].append((str(series.dtype), is_numeric_dtype(series)))
            if is_numeric_dtype(series):
                vals = series.astype("float64")
            else:
                st["numeric"] = False
                coerced = pd.to_numeric(series, errors="coerce")
                bad = coerced.isna() & series.notna()
                st["bad"] += int(bad.sum())
                for v in series[bad].unique()[:5]:
                    if len(st["examples"]) < 5 and str(v) not in st["examples"]:
                        st["examples"].append(str(v))
                vals = coerced.astype("float64")
            st["nan"] += int(vals.isna().sum())
            numeric[col] = vals
        all_missing += int(pd.concat(numeric, axis=1).isna().all(axis=1).sum())
        valid = ts.notna().to_numpy()
        dup_rows += int(chunk.loc[valid].duplicated().sum())  # consecutive-row duplicates within a chunk
        ts_buf[rows - n_chunk: rows] = _ns(ts)
        y_buf[rows - n_chunk: rows] = numeric[target].to_numpy(dtype="float64")
        del chunk, numeric, ts
    return {
        "rows": rows, "bad_ts": bad_ts, "dup_rows": dup_rows, "all_missing": all_missing, "stats": stats,
        "ts": ts_buf[:rows], "y": y_buf[:rows],
    }


def _dtype_name(st: dict[str, Any]) -> str:
    names = [n for n, numeric in st["dtypes"] if not numeric] or [n for n, _ in st["dtypes"]]
    if not st["dtypes"]:
        return "float64"
    return names[0] if not st["numeric"] else ("float64" if any("float" in n for n in names) else names[0])


def validate_dataset(path: Path, config: dict[str, Any]) -> dict[str, Any]:
    rep = _Report()
    ts_cols: list[str] = config.get("timestamp_columns") or []
    target: str | None = config.get("target_column")
    exogenous: list[str] = config.get("exogenous_columns") or []

    # ---- format ------------------------------------------------------------------------
    try:
        meta = CsvMeta.from_dict(config["csv_meta"])
        na_values = config.get("na_values") or ["?"]
        rep.checks["rows"] = count_data_rows(path, meta)  # refined below once every row has been parsed
    except (CsvFormatError, KeyError) as exc:
        rep.error("unreadable_file", str(exc))
        return rep.to_dict()
    rep.checks["columns"] = list(meta.columns)
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
    absent = [c for c in required if c not in meta.columns]
    if absent:
        rep.error("columns_not_found", f"Configured column(s) not found in the file: {', '.join(absent)}.", columns=absent)
    if rep.errors:
        return rep.to_dict()

    # ---- timestamp format (from a sample spread over the whole file) -----------------------------
    try:
        sample = sample_rows(path, meta, na_values)
        fmt = config.get("datetime_format")
        _, fmt = parse_timestamps(sample, ts_cols, fmt)
        del sample
        scan = _scan(path, meta, na_values, ts_cols, fmt, target, exogenous, int(rep.checks["rows"]))  # type: ignore[arg-type]
    except CsvFormatError as exc:
        rep.error("unreadable_file", str(exc))
        return rep.to_dict()
    except TimestampError as exc:
        rep.error("bad_timestamps", str(exc))
        return rep.to_dict()

    n_rows, ts_all, y_all, stats = scan["rows"], scan["ts"], scan["y"], scan["stats"]
    rep.checks["rows"] = int(n_rows)
    if n_rows == 0:
        rep.error("insufficient_observations", "The file contains no data rows.")
        return rep.to_dict()

    # ---- timestamps --------------------------------------------------------------
    bad_ts = scan["bad_ts"]
    bad_pct = 100.0 * bad_ts / max(n_rows, 1)
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
    dtype_report: dict[str, Any] = {}
    for col in [target] + exogenous:
        st = stats[col]
        if st["numeric"]:
            dtype_report[col] = {"dtype": _dtype_name(st), "non_numeric_tokens": 0}
            continue
        n_bad = st["bad"]
        pct = 100.0 * n_bad / max(n_rows, 1)
        dtype_report[col] = {"dtype": _dtype_name(st), "non_numeric_tokens": n_bad, "examples": list(st["examples"])}
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

    valid_ts = ~np.isnat(ts_all)

    # ---- ordering + duplicates ---------------------------------------------------------
    if valid_ts.all():
        vts, yv = ts_all, y_all                      # no copy in the common case
    else:
        vts, yv = ts_all[valid_ts], y_all[valid_ts]
    del valid_ts
    vi = vts.view("int64")
    step_back = np.diff(vi)
    out_of_order = int((step_back < 0).sum())
    if out_of_order == 0:
        keep = np.empty(len(vi), dtype=bool)         # already sorted: unique = drop equal neighbours
        keep[0] = True
        keep[1:] = step_back != 0
        unique_i = vi[keep]
        del keep
    else:
        unique_i = np.unique(vi)
    del step_back
    dup_count = int(len(vi) - len(unique_i))
    rep.checks["ordering"] = {"chronological": out_of_order == 0, "out_of_order_steps": out_of_order}
    rep.checks["duplicates"] = {"duplicate_timestamps": dup_count, "duplicate_rows": int(scan["dup_rows"])}
    if out_of_order:
        rep.warn("not_chronological", f"{out_of_order} rows are out of chronological order; they will be sorted.")
    if dup_count:
        rep.warn("duplicate_timestamps", f"{dup_count} duplicate timestamps; numeric values will be averaged per timestamp.")
    if dup_count > 0.5 * len(vi):
        rep.error("duplicate_timestamps", "More than half of the timestamps are duplicates.")

    # ---- frequency -------------------------------------------------------------------------
    if len(unique_i) < 3:
        rep.error("insufficient_observations", "Fewer than 3 distinct timestamps.")
        return rep.to_dict()
    deltas = pd.Series(np.diff(unique_i).astype("timedelta64[ns]"))
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
    del deltas
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
    first_i, last_i = int(unique_i[0]), int(unique_i[-1])
    del unique_i
    step_ns = int(mode_delta.value)
    n_grid = (last_i - first_i) // step_ns + 1
    offsets = vi - first_i
    on_grid = (offsets % step_ns) == 0                    # off-grid timestamps do not land on the native grid
    if on_grid.all():
        pos, values = offsets // step_ns, yv
    else:
        pos, values = offsets[on_grid] // step_ns, yv[on_grid]
    del offsets, on_grid
    if dup_count == 0:
        grid_vals = np.full(n_grid, np.nan)
        grid_vals[pos] = values                           # each slot is hit at most once
    else:
        seen = ~np.isnan(values)
        sums = np.bincount(pos[seen], weights=values[seen], minlength=n_grid)
        counts = np.bincount(pos[seen], minlength=n_grid)
        grid_vals = np.full(n_grid, np.nan)
        present = counts > 0
        grid_vals[present] = sums[present] / counts[present]   # duplicates are averaged, as in preprocessing
        del seen, sums, counts, present
    del pos, values, yv, vts, vi, ts_all, y_all, scan["ts"], scan["y"]
    missing_mask = np.isnan(grid_vals)
    starts, lengths = _run_lengths(missing_mask)
    column_missing = {
        col: {"missing": int(stats[col]["nan"]), "missing_pct": round(float(stats[col]["nan"] / n_rows) * 100, 4)}
        for col in [target] + exogenous
    }

    def at(i: int) -> str:
        return str(pd.Timestamp(first_i + int(i) * step_ns))

    rep.checks["missing_values"] = {
        "per_column": column_missing,
        "rows_with_all_measurements_missing": int(scan["all_missing"]),
        "target_missing_on_full_grid": int(missing_mask.sum()),
        "target_missing_pct_on_full_grid": round(float(missing_mask.mean()) * 100, 4),
        "target_missing_runs": int(len(lengths)),
        "longest_missing_run_steps": int(lengths.max()) if len(lengths) else 0,
        "longest_missing_run_start": at(starts[lengths.argmax()]) if len(lengths) else None,
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
    observed = grid_vals[~missing_mask]
    del grid_vals
    if observed.size == 0 or np.unique(observed).size <= 1:
        rep.error("constant_target", "The target column is empty or constant.")
        return rep.to_dict()
    q1, q3 = np.quantile(observed, [0.25, 0.75])
    iqr = q3 - q1
    upper = q3 + 3 * iqr
    n_extreme = int((observed > upper).sum())
    rep.checks["target_quality"] = {
        "column": target,
        "min": float(observed.min()),
        "max": float(observed.max()),
        "mean": float(observed.mean()),
        "std": float(observed.std(ddof=1)),
        "negative_values": int((observed < 0).sum()),
        "zero_values": int((observed == 0).sum()),
        "extreme_high_values_3xIQR": n_extreme,
        "extreme_high_threshold": float(upper),
        "largest_values": [float(v) for v in np.sort(observed)[-5:][::-1]],
    }
    if (observed < 0).any():
        rep.warn("negative_target", f"{int((observed < 0).sum())} negative target values; energy consumption is normally non-negative.")
    if n_extreme:
        rep.warn("extreme_values", f"{n_extreme} extreme high values (> 3×IQR fence) detected; kept, not removed.")
    del observed

    # ---- sufficiency -------------------------------------------------------------------------------------
    span_days = (last_i - first_i) / 1e9 / 86400
    modeling_steps = int(span_days * 1440 / modeling_minutes) + 1
    min_steps = MIN_HISTORY_DAYS * steps_per_day(modeling_minutes)
    rep.checks["sufficiency"] = {
        "rows": int(n_rows),
        "span_days": round(span_days, 2),
        "estimated_modeling_steps": modeling_steps,
        "required_modeling_steps": min_steps,
    }
    if n_rows < MIN_OBSERVATIONS:
        rep.error("insufficient_observations", f"{n_rows} rows; at least {MIN_OBSERVATIONS} are required.")
    elif modeling_steps < min_steps:
        rep.error(
            "insufficient_history",
            f"About {modeling_steps} modeling steps after resampling; at least {min_steps} ({MIN_HISTORY_DAYS} days) are required.",
        )

    first, last = str(pd.Timestamp(first_i)), str(pd.Timestamp(last_i))
    rep.checks["time_range"] = {"start": first, "end": last}
    rep.derived.update(
        {
            "native_minutes": native_minutes,
            "native_frequency": native_alias,
            "modeling_minutes": modeling_minutes,
            "modeling_frequency": minutes_to_alias(modeling_minutes),
            "steps_per_day": steps_per_day(modeling_minutes),
            "default_horizon_steps": default_horizon(modeling_minutes),
            "start": first,
            "end": last,
            "rows": int(n_rows),
        }
    )
    return rep.to_dict()
