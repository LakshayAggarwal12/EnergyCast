"""Time-series feature engineering.

Forecast strategy (phase 1): *direct* multi-step forecasting with horizon H (in steps). Forecasts are issued
once per block of H steps (for hourly data: every midnight, 24 hours ahead). Every feature used for the value
at time t therefore only depends on observations at or before t - H, i.e. information that is available when
the forecast is issued. Calendar features are safe because they are known in advance.
"""
from __future__ import annotations

from dataclasses import asdict, dataclass, field
from typing import Any

import numpy as np
import pandas as pd

from app.utils.frequency import MINUTES_PER_DAY, steps_per_day


@dataclass(frozen=True)
class FeaturePlan:
    horizon: int
    freq_minutes: int
    lags: list[int] = field(default_factory=list)
    rolling_windows: list[int] = field(default_factory=list)
    use_calendar: bool = True
    exogenous: list[str] = field(default_factory=list)  # lagged by `horizon`

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> "FeaturePlan":
        return cls(**data)


def default_lags_and_windows(freq_minutes: int, horizon: int) -> tuple[list[int], list[int]]:
    """Frequency-aware defaults. For hourly data with H=24: lags 24/48/168/336, windows 24/168."""
    if freq_minutes < MINUTES_PER_DAY:
        spd = steps_per_day(freq_minutes)
        candidates = [spd, 2 * spd, 7 * spd, 14 * spd]
        windows = [spd, 7 * spd]
    else:
        candidates = [7, 14, 28, 364]
        windows = [7, 28]
    lags = sorted({lag for lag in candidates if lag >= horizon})
    return lags, sorted({w for w in windows if w >= 2})


def _season(month: pd.Index) -> np.ndarray:
    """Meteorological seasons, northern hemisphere: 0=winter(DJF) 1=spring 2=summer 3=autumn."""
    return ((np.asarray(month) % 12) // 3).astype(int)


def calendar_features(index: pd.DatetimeIndex, freq_minutes: int) -> pd.DataFrame:
    out = pd.DataFrame(index=index)
    if freq_minutes < MINUTES_PER_DAY:
        out["hour"] = index.hour
        out["hour_sin"] = np.sin(2 * np.pi * index.hour / 24)
        out["hour_cos"] = np.cos(2 * np.pi * index.hour / 24)
    out["day_of_week"] = index.dayofweek
    out["dow_sin"] = np.sin(2 * np.pi * index.dayofweek / 7)
    out["dow_cos"] = np.cos(2 * np.pi * index.dayofweek / 7)
    out["day_of_month"] = index.day
    out["month"] = index.month
    out["month_sin"] = np.sin(2 * np.pi * (index.month - 1) / 12)
    out["month_cos"] = np.cos(2 * np.pi * (index.month - 1) / 12)
    out["season"] = _season(index.month)
    out["is_weekend"] = (index.dayofweek >= 5).astype(int)
    return out


def build_features(frame: pd.DataFrame, target: str, plan: FeaturePlan) -> pd.DataFrame:
    """Feature matrix aligned to `frame.index` (which must be a complete regular grid)."""
    bad = [lag for lag in plan.lags if lag < plan.horizon]
    if bad:
        raise ValueError(f"Lags {bad} are shorter than the forecast horizon {plan.horizon} and would leak future data.")
    y = frame[target]
    parts: list[pd.DataFrame] = []
    if plan.use_calendar:
        parts.append(calendar_features(frame.index, plan.freq_minutes))
    if plan.lags:
        parts.append(pd.DataFrame({f"lag_{lag}": y.shift(lag) for lag in plan.lags}))
    if plan.rolling_windows:
        base = y.shift(plan.horizon)  # only data available at forecast time
        cols: dict[str, pd.Series] = {}
        for w in plan.rolling_windows:
            roll = base.rolling(w, min_periods=w)
            cols[f"roll_mean_{w}"] = roll.mean()
            cols[f"roll_std_{w}"] = roll.std()
        parts.append(pd.DataFrame(cols))
    if plan.exogenous:
        parts.append(pd.DataFrame({f"{c}_lag_{plan.horizon}": frame[c].shift(plan.horizon) for c in plan.exogenous}))
    if not parts:
        raise ValueError("The feature plan produces no features.")
    return pd.concat(parts, axis=1).astype("float64")
