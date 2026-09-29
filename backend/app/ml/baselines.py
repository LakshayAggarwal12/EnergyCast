"""Baseline forecasters. They follow the same protocol as the ML models: forecasts are issued at the start of
each block of H steps using only data up to the block's origin (the step just before the block)."""
from __future__ import annotations

import math

import numpy as np
import pandas as pd

from app.ml.base import ModelFit, ModelSpec, TrainingContext


def block_origins(ctx: TrainingContext) -> pd.DatetimeIndex:
    """For each evaluation timestamp: the last timestamp observable when its forecast was issued."""
    step = pd.Timedelta(minutes=ctx.freq_minutes)
    block = ctx.horizon * step
    anchor = ctx.split.train_end
    k = ((ctx.eval_index - anchor) // block).to_numpy()
    return anchor + pd.to_timedelta(k * block.value, unit="ns") - step


def _series(values, ctx: TrainingContext) -> pd.Series:
    return pd.Series(np.asarray(values, dtype="float64"), index=ctx.eval_index)


def naive(ctx: TrainingContext) -> ModelFit:
    """Repeat the last observed value across the whole forecast block."""
    last = ctx.y.ffill()
    pred = _series(last.reindex(block_origins(ctx)).to_numpy(), ctx)
    return ModelFit(pred, {"kind": "baseline", "type": "naive"}, {"rule": "last observed value at forecast origin"})


def seasonal_naive_factory(period_steps: int):
    def fit_predict(ctx: TrainingContext) -> ModelFit:
        lag = math.ceil(ctx.horizon / period_steps) * period_steps  # smallest multiple of the period >= H
        pred = _series(ctx.y.shift(lag).reindex(ctx.eval_index).to_numpy(), ctx)
        return ModelFit(
            pred,
            {"kind": "baseline", "type": "seasonal_naive", "lag_steps": lag},
            {"season_steps": period_steps, "lag_steps": lag},
        )

    return fit_predict


def moving_average(ctx: TrainingContext) -> ModelFit:
    """Mean of the most recent window (one day, or one week for daily data) at the forecast origin, held flat."""
    window = ctx.steps_per_day if ctx.freq_minutes < 1440 else 7
    ma = ctx.y.rolling(window, min_periods=max(1, window // 2)).mean()
    pred = _series(ma.reindex(block_origins(ctx)).to_numpy(), ctx)
    return ModelFit(pred, {"kind": "baseline", "type": "moving_average", "window": window}, {"window_steps": window})


def baseline_specs(ctx_steps_per_day: int, freq_minutes: int) -> list[ModelSpec]:
    daily = ctx_steps_per_day if freq_minutes < 1440 else 1
    weekly = 7 * daily
    specs = [
        ModelSpec("naive", "baseline", "Last observed value carried forward", naive),
        ModelSpec("seasonal_naive", "baseline", "Same time of the previous day (weekly for daily data)", seasonal_naive_factory(daily)),
    ]
    if weekly != daily:
        specs.append(ModelSpec("seasonal_naive_weekly", "baseline", "Same time of the previous week", seasonal_naive_factory(weekly)))
    specs.append(ModelSpec("moving_average", "baseline", "Mean of the last day held flat", moving_average))
    return specs
