"""Schema inspection performed at upload time (first rows only) and a suggested configuration."""
from __future__ import annotations

from pathlib import Path
from typing import Any

import pandas as pd
from pandas.api.types import is_numeric_dtype

from app.data.loader import CsvMeta, count_data_rows, read_csv_frame
from app.data.timestamps import detect_timestamp_layout

SAMPLE_ROWS = 20000
TARGET_KEYWORDS = ["consumption", "load", "energy", "kwh", "active_power", "power", "usage", "demand"]


def _suggest_target(numeric_cols: list[str]) -> str | None:
    lowered = {c: c.lower() for c in numeric_cols}
    for keyword in TARGET_KEYWORDS:
        for col, low in lowered.items():
            if keyword in low:
                return col
    return None


def build_profile(path: Path, meta: CsvMeta, na_values: list[str]) -> dict[str, Any]:
    sample = read_csv_frame(path, meta, na_values=na_values, nrows=SAMPLE_ROWS)
    total_rows = count_data_rows(path, meta)
    numeric_cols = [c for c in sample.columns if is_numeric_dtype(sample[c])]

    columns = []
    for col in sample.columns:
        series = sample[col]
        columns.append(
            {
                "name": col,
                "kind": "numeric" if col in numeric_cols else "text",
                "null_pct_in_sample": round(float(series.isna().mean()) * 100, 3),
                "examples": [str(v) for v in series.dropna().head(3).tolist()],
            }
        )

    layout = detect_timestamp_layout(sample)
    ts_cols = layout["columns"]
    target = _suggest_target([c for c in numeric_cols if c not in ts_cols])
    exogenous = [c for c in numeric_cols if c not in ts_cols and c != target] if target else []

    return {
        "csv": meta.to_dict(),
        "total_rows": total_rows,
        "sample_rows": len(sample),
        "columns": columns,
        "timestamp_detection": layout,
        "suggested_config": {
            "timestamp_columns": ts_cols,
            "datetime_format": layout["format"],
            "target_column": target,
            "exogenous_columns": exogenous,
            "na_values": na_values,
        },
    }
