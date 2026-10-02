"""Forecast generation from a saved model bundle and the processed history.

Every model was trained and validated for *direct* forecasts of at most H steps ahead (H = the feature plan's
horizon). A forecast issued at time `origin` therefore only needs observations at or before `origin`:
lags, rolling windows and lagged exogenous features are all >= H steps old for every step in 1..H.
The history is cut at `origin` before anything is computed, so later data can never influence a forecast.
"""
from __future__ import annotations

import warnings
from dataclasses import dataclass
from datetime import datetime
from typing import Any

import numpy as np
import pandas as pd

from app.features.engineering import FeaturePlan, build_features
from app.utils.frequency import minutes_to_alias


class ForecastError(ValueError):
    """A forecast cannot be produced (bad request or unusable recent data)."""


@dataclass
class ForecastResult:
    origin: pd.Timestamp
    predictions: pd.Series  # indexed by the future timestamps


def resolve_origin(frame: pd.DataFrame, target: str, origin: datetime | pd.Timestamp | None, freq_minutes: int) -> pd.Timestamp:
    """Default: the last timestamp with an observed target. Explicit origins must lie on the data grid."""
    y = frame[target]
    if origin is None:
        last = y.last_valid_index()
        if last is None:
            raise ForecastError("The dataset has no observed target values.")
        return pd.Timestamp(last)
    ts = pd.Timestamp(origin)
    if ts not in frame.index:
        raise ForecastError(
            f"Forecast origin {ts} is not a timestamp on the dataset's {minutes_to_alias(freq_minutes)} grid "
            f"({frame.index[0]} to {frame.index[-1]})."
        )
    if pd.isna(y.loc[ts]):
        raise ForecastError(f"There is no observation at {ts}, so a forecast cannot start there.")
    return ts


def _baseline(payload: dict[str, Any], y: pd.Series, future: pd.DatetimeIndex, step: pd.Timedelta, horizon: int) -> np.ndarray:
    kind = payload["type"]
    if kind == "naive":
        return np.full(len(future), float(y.iloc[-1]))
    if kind == "seasonal_naive":
        lag = int(payload["lag_steps"])
        if lag < horizon:
            raise ForecastError("Seasonal lag is shorter than the requested horizon.")
        return y.reindex(future - lag * step).to_numpy(dtype="float64")
    if kind == "moving_average":
        window = int(payload["window"])
        ma = y.rolling(window, min_periods=max(1, window // 2)).mean()
        return np.full(len(future), float(ma.iloc[-1]))
    raise ForecastError(f"Unsupported baseline '{kind}'.")


def _sarimax(payload: dict[str, Any], y: pd.Series, horizon: int) -> np.ndarray:
    """Re-apply the stored parameters (no re-estimation) to the most recent window, then forecast."""
    window = y.iloc[-int(payload["fit_window_steps"]):].to_numpy(dtype="float64")
    if np.isnan(window).all():
        raise ForecastError("There are no recent observations to forecast from.")
    from statsmodels.tsa.statespace.sarimax import SARIMAX  # imported on demand: keeps API start-up memory low

    model = SARIMAX(
        window, order=tuple(payload["order"]), seasonal_order=tuple(payload["seasonal_order"]),
        trend=payload["trend"], enforce_stationarity=False, enforce_invertibility=False,
    )
    with warnings.catch_warnings():
        warnings.simplefilter("ignore")
        result = model.filter(np.asarray(payload["params"], dtype="float64"), low_memory=True)  # smooth() kept ~1 GB of Kalman history
        return np.asarray(result.forecast(steps=horizon), dtype="float64")


def _tabular(
    bundle: dict[str, Any],
    plan: FeaturePlan,
    hist: pd.DataFrame,
    target: str,
    future: pd.DatetimeIndex,
    muted_exogenous: list[str] | None = None,
) -> np.ndarray:
    cols = [target] + list(plan.exogenous)
    needed = max([*plan.lags, *plan.rolling_windows, 0]) + plan.horizon + 24
    tail = hist[cols].iloc[-needed:]
    blank = pd.DataFrame(np.nan, index=future, columns=cols)
    features = build_features(pd.concat([tail, blank]), target, plan)
    columns = list(bundle["feature_columns"])
    absent = [c for c in columns if c not in features.columns]
    if absent:
        raise ForecastError(f"The model expects features that cannot be built: {', '.join(absent)}.")
    rows = features.loc[future, columns].copy()
    for col in muted_exogenous or []:
        feat = f"{col}_lag_{plan.horizon}"
        if feat not in rows.columns:
            continue
        hist_feat = features.reindex(hist.index)[feat].dropna()
        fill = float(hist_feat.mean()) if len(hist_feat) else 0.0
        rows[feat] = fill
    bad = rows.columns[rows.isna().any()].tolist()
    if bad:
        raise ForecastError(
            "Recent observations contain gaps, so these model inputs are missing: " + ", ".join(bad) + "."
        )
    return np.asarray(bundle["artifact"]["estimator"].predict(rows), dtype="float64")


def generate_forecast(
    bundle: dict[str, Any],
    frame: pd.DataFrame,
    horizon: int,
    origin: datetime | pd.Timestamp | None = None,
    muted_exogenous: list[str] | None = None,
) -> ForecastResult:
    plan = FeaturePlan.from_dict(bundle["feature_plan"])
    target = bundle["target"]
    if not 1 <= horizon <= plan.horizon:
        raise ForecastError(
            f"Horizon must be between 1 and {plan.horizon} steps: the models were trained and validated for "
            f"{plan.horizon}-step-ahead forecasts."
        )
    origin_ts = resolve_origin(frame, target, origin, plan.freq_minutes)
    step = pd.Timedelta(minutes=plan.freq_minutes)
    hist = frame.loc[:origin_ts]  # nothing after the origin is ever visible
    future = pd.date_range(origin_ts + step, periods=horizon, freq=minutes_to_alias(plan.freq_minutes))

    payload = bundle["artifact"]
    kind = payload["kind"]
    if kind == "baseline":
        values = _baseline(payload, hist[target], future, step, horizon)
    elif kind == "sarimax":
        values = _sarimax(payload, hist[target], horizon)
    elif kind in ("sklearn", "xgboost"):
        values = _tabular(bundle, plan, hist, target, future, muted_exogenous)
    else:
        raise ForecastError(f"Unsupported model kind '{kind}'.")

    preds = pd.Series(values, index=future, name="predicted")
    if len(preds) != horizon or not np.isfinite(preds.to_numpy()).all():
        raise ForecastError("The model could not produce a complete forecast: recent observations contain gaps.")
    return ForecastResult(origin=origin_ts, predictions=preds)
