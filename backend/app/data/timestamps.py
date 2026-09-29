"""Timestamp detection and parsing (single datetime column, or separate date + time columns)."""
from __future__ import annotations

import numpy as np
import pandas as pd
from pandas.api.types import is_numeric_dtype

ISO = "ISO8601"
DATETIME_FORMATS = [
    ISO,
    "%d/%m/%Y %H:%M:%S", "%d/%m/%Y %H:%M",
    "%m/%d/%Y %H:%M:%S", "%m/%d/%Y %H:%M",
    "%Y/%m/%d %H:%M:%S", "%Y/%m/%d %H:%M",
    "%d-%m-%Y %H:%M:%S", "%d-%m-%Y %H:%M",
    "%d.%m.%Y %H:%M:%S", "%d.%m.%Y %H:%M",
]
DATE_FORMATS = ["%Y-%m-%d", "%d/%m/%Y", "%m/%d/%Y", "%Y/%m/%d", "%d-%m-%Y", "%m-%d-%Y", "%d.%m.%Y"]
TIME_FORMATS = ["%H:%M:%S", "%H:%M"]
MATCH_RATE = 0.999
SAMPLE_SIZE = 5000


class TimestampError(ValueError):
    """Timestamps are missing, ambiguous, or cannot be parsed."""


def _parse(values: pd.Series, fmt: str) -> pd.Series:
    if fmt == ISO:
        return pd.to_datetime(values, format="ISO8601", errors="coerce", utc=True).dt.tz_localize(None)
    return pd.to_datetime(values, format=fmt, errors="coerce")


def _matching_formats(values: pd.Series, formats: list[str]) -> list[str]:
    if values.empty:
        return []
    return [f for f in formats if _parse(values, f).notna().mean() >= MATCH_RATE]


def _is_ambiguous(values: pd.Series, formats: list[str]) -> bool:
    if len(formats) < 2:
        return False
    parsed = [_parse(values, f) for f in formats]
    return any(not parsed[0].equals(p) for p in parsed[1:])


def _sample(series: pd.Series) -> pd.Series:
    clean = series.dropna().astype(str).str.strip()
    if len(clean) <= SAMPLE_SIZE:
        return clean
    return clean.iloc[:: len(clean) // SAMPLE_SIZE][:SAMPLE_SIZE]  # strided: spans the whole file


def detect_timestamp_layout(df: pd.DataFrame) -> dict:
    """Find timestamp column(s). Returns {'columns': [...], 'format': str|None, 'ambiguous': bool}."""
    datetime_cols, date_cols, time_cols = [], [], []
    for col in df.columns:
        if is_numeric_dtype(df[col]):
            continue
        s = _sample(df[col])
        if s.empty:
            continue
        if _matching_formats(s, TIME_FORMATS):
            time_cols.append(col)
        elif s.str.contains(":").all() and _matching_formats(s, DATETIME_FORMATS):
            datetime_cols.append(col)
        elif _matching_formats(s, DATE_FORMATS):
            date_cols.append(col)

    if datetime_cols:
        cols = [datetime_cols[0]]
        formats = DATETIME_FORMATS
    elif date_cols and time_cols:
        cols = [date_cols[0], time_cols[0]]
        formats = DATETIME_FORMATS
    elif date_cols:
        cols = [date_cols[0]]
        formats = DATE_FORMATS
    else:
        return {"columns": [], "format": None, "ambiguous": False}

    text = _combine(df, cols)
    sample = _sample(text)
    matches = _matching_formats(sample, formats)
    if not matches:
        return {"columns": cols, "format": None, "ambiguous": False}
    return {"columns": cols, "format": matches[0], "ambiguous": _is_ambiguous(sample, matches)}


def _combine(df: pd.DataFrame, columns: list[str]) -> pd.Series:
    if len(columns) == 1:
        return df[columns[0]].astype("string").str.strip()
    return df[columns[0]].astype("string").str.strip() + " " + df[columns[1]].astype("string").str.strip()


def detect_format(df: pd.DataFrame, columns: list[str]) -> str:
    """Resolve the datetime format for the given column(s) from a strided sample of the whole file."""
    sample = _sample(_combine(df, columns))
    matches = _matching_formats(sample, DATETIME_FORMATS + DATE_FORMATS)
    if not matches:
        raise TimestampError(
            f"Could not recognise a timestamp format in column(s) {', '.join(columns)}. "
            "Provide datetime_format explicitly (for example %d/%m/%Y %H:%M:%S)."
        )
    if _is_ambiguous(sample, matches):
        raise TimestampError(
            f"The timestamp format in {', '.join(columns)} is ambiguous (day/month order cannot be determined). "
            "Provide datetime_format explicitly."
        )
    return matches[0]


def parse_timestamps(df: pd.DataFrame, columns: list[str], fmt: str | None = None) -> tuple[pd.Series, str]:
    """Parse to naive datetimes. Unparseable values become NaT. Returns (timestamps, resolved_format)."""
    for col in columns:
        if col not in df.columns:
            raise TimestampError(f"Timestamp column '{col}' was not found in the file.")
        if is_numeric_dtype(df[col]):
            raise TimestampError(
                f"Column '{col}' is numeric, not a date/time. Numeric timestamps are not supported."
            )
    fmt = fmt or detect_format(df, columns)
    ts = _parse(_combine(df, columns), fmt)
    return pd.Series(ts.to_numpy(), index=df.index), fmt
