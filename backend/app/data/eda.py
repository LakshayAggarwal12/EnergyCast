"""Time-series EDA summaries for the admin UI (trend, seasonality, distribution, correlation, ACF)."""
from __future__ import annotations

from typing import Any

import numpy as np
import pandas as pd
from statsmodels.tsa.stattools import acf as sm_acf

from app.data.preprocessing import OBSERVED_COL


def _num(v: Any) -> float | None:
    if v is None:
        return None
    try:
        x = float(v)
    except (TypeError, ValueError):
        return None
    return None if not np.isfinite(x) else round(x, 6)


def _points(index: pd.DatetimeIndex, values: np.ndarray, max_points: int = 420) -> list[dict[str, Any]]:
    n = len(index)
    if n == 0:
        return []
    step = max(1, n // max_points)
    out = []
    for ts, val in zip(index[::step], values[::step]):
        out.append({"t": ts.isoformat(), "y": _num(val)})
    return out


def _hist(values: np.ndarray, bins: int = 24) -> dict[str, Any]:
    clean = values[np.isfinite(values)]
    if len(clean) < 2:
        return {"bins": [], "counts": []}
    counts, edges = np.histogram(clean, bins=bins)
    return {
        "bins": [_num(x) for x in edges],
        "counts": [int(c) for c in counts],
    }


def build_eda(frame: pd.DataFrame, target: str, exogenous: list[str] | None = None) -> dict[str, Any]:
    if target not in frame.columns:
        raise ValueError(f"Target column '{target}' is not in the processed dataset.")
    y = frame[target].astype("float64")
    observed = frame[OBSERVED_COL] if OBSERVED_COL in frame.columns else y.notna()
    series = y.where(observed.to_numpy())
    values = series.to_numpy(dtype="float64")
    idx = frame.index
    finite = values[np.isfinite(values)]
    if len(finite) < 48:
        raise ValueError("Not enough observed target values to compute EDA.")

    roll_win = min(24 * 7, max(24, len(series) // 20))
    rolling = series.rolling(roll_win, min_periods=max(8, roll_win // 4)).mean()

    x = np.arange(len(finite), dtype="float64")
    slope = float(np.polyfit(x, finite, 1)[0]) if len(finite) > 2 else 0.0

    hour = (
        series.groupby(idx.hour).mean()
        if getattr(idx, "freq", None) is not None or (len(idx) > 1 and (idx[1] - idx[0]) < pd.Timedelta(days=1))
        else pd.Series(dtype="float64")
    )
    if len(idx) > 1 and (idx[1] - idx[0]) >= pd.Timedelta(days=1):
        hour_profile = []
    else:
        hour_profile = [{"k": int(k), "y": _num(v)} for k, v in hour.items()]

    dow = series.groupby(idx.dayofweek).mean()
    month = series.groupby(idx.month).mean()

    nlags = int(min(168, max(24, len(finite) // 4)))
    acf_vals = sm_acf(finite, nlags=nlags, fft=True, missing="conservative")
    acf_points = [{"lag": int(i), "y": _num(v)} for i, v in enumerate(acf_vals)]

    cols = [target] + [c for c in (exogenous or []) if c in frame.columns and c != target]
    corr_cols = cols[:12]
    corr_frame = frame[corr_cols].apply(pd.to_numeric, errors="coerce")
    corr = corr_frame.corr()
    matrix = [[_num(corr.iat[i, j]) for j in range(len(corr_cols))] for i in range(len(corr_cols))]

    q = np.nanpercentile(finite, [5, 25, 50, 75, 95])
    return {
        "target": target,
        "n_rows": int(len(frame)),
        "n_observed": int(np.isfinite(values).sum()),
        "start": idx[0].isoformat(),
        "end": idx[-1].isoformat(),
        "trend": {
            "series": _points(idx, values),
            "rolling": _points(idx, rolling.to_numpy(dtype="float64")),
            "rolling_window": int(roll_win),
            "slope_per_step": _num(slope),
        },
        "seasonality": {
            "hour": hour_profile,
            "day_of_week": [{"k": int(k), "y": _num(v)} for k, v in dow.items()],
            "month": [{"k": int(k), "y": _num(v)} for k, v in month.items()],
        },
        "distribution": {
            **_hist(finite),
            "mean": _num(np.mean(finite)),
            "std": _num(np.std(finite)),
            "min": _num(np.min(finite)),
            "max": _num(np.max(finite)),
            "p5": _num(q[0]),
            "p25": _num(q[1]),
            "p50": _num(q[2]),
            "p75": _num(q[3]),
            "p95": _num(q[4]),
        },
        "correlation": {"columns": corr_cols, "matrix": matrix},
        "acf": {"points": acf_points, "nlags": nlags},
    }
