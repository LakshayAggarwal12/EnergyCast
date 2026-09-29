"""ARIMA / SARIMA via statsmodels. Parameters are fitted once on (the tail of) the training period, then the
model walks forward block by block: forecast H steps, absorb the realised values, repeat (no re-estimation)."""
from __future__ import annotations

import warnings

import numpy as np
import pandas as pd
from statsmodels.tsa.statespace.sarimax import SARIMAX

from app.ml.base import ModelFit, ModelSpec, TrainingContext


def _walk_forward(ctx: TrainingContext, order, seasonal_order, trend, name: str) -> ModelFit:
    train_y = ctx.y[ctx.y.index < ctx.split.train_end]
    window = train_y.iloc[-ctx.arima_fit_window :]
    endog = window.to_numpy(dtype="float64")
    if np.isnan(endog).all():
        raise ValueError("The training window contains no observations.")

    model = SARIMAX(
        endog, order=order, seasonal_order=seasonal_order, trend=trend,
        enforce_stationarity=False, enforce_invertibility=False,
    )
    with warnings.catch_warnings():
        warnings.simplefilter("ignore")
        fitted = model.fit(disp=False, maxiter=100)

    y_eval = ctx.y.reindex(ctx.eval_index).to_numpy(dtype="float64")
    preds = np.full(len(y_eval), np.nan)
    current = fitted
    h = ctx.horizon
    with warnings.catch_warnings():
        warnings.simplefilter("ignore")
        for start in range(0, len(y_eval), h):
            stop = min(start + h, len(y_eval))
            preds[start:stop] = np.asarray(current.forecast(steps=stop - start))
            if stop < len(y_eval):
                current = current.extend(y_eval[start:stop])

    converged = fitted.mle_retvals.get("converged") if fitted.mle_retvals else None
    spec = {
        "order": list(order),
        "seasonal_order": list(seasonal_order),
        "trend": trend,
        "params": [float(p) for p in fitted.params],
        "fit_window_steps": int(len(endog)),
        "last_fit_timestamp": str(window.index[-1]),
    }
    return ModelFit(
        pd.Series(preds, index=ctx.eval_index),
        {"kind": "sarimax", **spec},
        {
            "order": list(order),
            "seasonal_order": list(seasonal_order),
            "fit_window_steps": int(len(endog)),
            "aic": float(fitted.aic),
            "converged": None if converged is None else bool(converged),
            "forecast_protocol": f"refit-free walk-forward, {h}-step blocks",
        },
    )


def arima(ctx: TrainingContext) -> ModelFit:
    return _walk_forward(ctx, (2, 0, 1), (0, 0, 0, 0), "c", "arima")


def sarima(ctx: TrainingContext) -> ModelFit:
    return _walk_forward(ctx, (1, 0, 1), (0, 1, 1, ctx.seasonal_period), None, "sarima")


def classical_specs() -> list[ModelSpec]:
    return [
        ModelSpec("arima", "classical", "ARIMA(2,0,1) with constant", arima),
        ModelSpec("sarima", "classical", "SARIMA(1,0,1)(0,1,1)[daily season]", sarima),
    ]
