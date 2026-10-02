"""ARIMA / SARIMA via statsmodels. Parameters are fitted once on (the tail of) the training period, then the
model walks forward block by block: forecast H steps, absorb the realised values, repeat (no re-estimation).

Memory-safe: a seasonal SARIMAX stores a full Kalman history (every state covariance for every observation), which
needed ~1.2 GB for a 180-day hourly window. Estimation therefore runs with `low_memory=True` (identical parameters
and AIC, ~10 MB), and the walk-forward is a single memory-conserving filter pass over [training window + evaluation
span] from which each block's forecast is projected. That is exactly what `extend()` computes block by block, and the
forecasts match it to the last bit (verified in tests/test_memory_safety.py).

When tuning is on, a small candidate set is scored with AIC on the training window only; the test period is
never used to pick an order."""
from __future__ import annotations

import warnings

import numpy as np
import pandas as pd

from app.ml.base import ModelFit, ModelSpec, TrainingContext
from app.ml.tuning import arima_candidates, sarima_candidates


def _train_window(ctx: TrainingContext) -> pd.Series:
    train_y = ctx.y[ctx.y.index < ctx.split.train_end]
    return train_y.iloc[-ctx.arima_fit_window :]


def _aic(window: pd.Series, order, seasonal_order, trend) -> float:
    from statsmodels.tsa.statespace.sarimax import SARIMAX

    endog = window.to_numpy(dtype="float64")
    if np.isnan(endog).all():
        raise ValueError("The training window contains no observations.")
    model = SARIMAX(
        endog, order=order, seasonal_order=seasonal_order, trend=trend,
        enforce_stationarity=False, enforce_invertibility=False,
    )
    with warnings.catch_warnings():
        warnings.simplefilter("ignore")
        fitted = model.fit(disp=False, maxiter=80, low_memory=True)
    return float(fitted.aic)


def light_walk_forward(order, seasonal_order, trend, params, train: np.ndarray, y_eval: np.ndarray, h: int) -> np.ndarray:
    """h-step forecasts issued at every block start, with the state updated by the realised values in between.
    One conserved-memory Kalman pass keeps only the predicted state means; each block is then projected forward
    with the model's own transition/design matrices."""
    from statsmodels.tsa.statespace.kalman_filter import MEMORY_CONSERVE, MEMORY_NO_PREDICTED_MEAN
    from statsmodels.tsa.statespace.sarimax import SARIMAX

    model = SARIMAX(
        np.concatenate([train, y_eval]), order=order, seasonal_order=seasonal_order, trend=trend,
        enforce_stationarity=False, enforce_invertibility=False,
    )
    model.ssm.set_conserve_memory(MEMORY_CONSERVE ^ MEMORY_NO_PREDICTED_MEAN)   # keep predicted state means only
    with warnings.catch_warnings():
        warnings.simplefilter("ignore")
        states = model.filter(np.asarray(params, dtype="float64")).filter_results.predicted_state  # (k_states, nobs + 1)

    def at_end(arr, base_ndim):  # system matrices are constant here; take the last time slice if they vary
        arr = np.asarray(arr)
        return arr[..., -1] if arr.ndim == base_ndim + 1 else arr

    ssm = model.ssm
    design, transition = at_end(ssm["design"], 2), at_end(ssm["transition"], 2)
    obs_intercept, state_intercept = at_end(ssm["obs_intercept"], 1), at_end(ssm["state_intercept"], 1)
    preds = np.full(len(y_eval), np.nan)
    for start in range(0, len(y_eval), h):
        state = states[:, len(train) + start].copy()
        for j in range(min(h, len(y_eval) - start)):
            preds[start + j] = (design @ state + obs_intercept)[0]
            state = transition @ state + state_intercept
    return preds


def _walk_forward(ctx: TrainingContext, order, seasonal_order, trend, name: str) -> ModelFit:
    from statsmodels.tsa.statespace.sarimax import SARIMAX

    window = _train_window(ctx)
    endog = window.to_numpy(dtype="float64")
    if np.isnan(endog).all():
        raise ValueError("The training window contains no observations.")

    model = SARIMAX(
        endog, order=order, seasonal_order=seasonal_order, trend=trend,
        enforce_stationarity=False, enforce_invertibility=False,
    )
    with warnings.catch_warnings():
        warnings.simplefilter("ignore")
        fitted = model.fit(disp=False, maxiter=100, low_memory=True)

    y_eval = ctx.y.reindex(ctx.eval_index).to_numpy(dtype="float64")
    h = ctx.horizon
    preds = light_walk_forward(order, seasonal_order, trend, fitted.params, endog, y_eval, h)

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


def _select_order(ctx: TrainingContext, candidates, fallback):
    if not ctx.tune:
        return fallback, None
    window = _train_window(ctx)
    tried = []
    best = None
    for order, seasonal_order, trend in candidates:
        row: dict = {"order": list(order), "seasonal_order": list(seasonal_order), "trend": trend}
        try:
            aic = _aic(window, order, seasonal_order, trend)
            row["aic"] = round(aic, 3)
            if best is None or aic < best[0]:
                best = (aic, order, seasonal_order, trend)
        except Exception as exc:
            row["error"] = f"{type(exc).__name__}: {exc}"[:180]
        tried.append(row)
    if best is None:
        order, seasonal_order, trend = fallback
        return (order, seasonal_order, trend), {"criterion": "aic", "tried": tried, "fallback": True}
    return (best[1], best[2], best[3]), {"criterion": "aic", "tried": tried, "fallback": False}


def arima(ctx: TrainingContext) -> ModelFit:
    chosen, search = _select_order(ctx, arima_candidates(), ((2, 0, 1), (0, 0, 0, 0), "c"))
    fit = _walk_forward(ctx, chosen[0], chosen[1], chosen[2], "arima")
    if search:
        fit.params["search"] = search
    return fit


def sarima(ctx: TrainingContext) -> ModelFit:
    chosen, search = _select_order(ctx, sarima_candidates(ctx.seasonal_period), ((1, 0, 1), (0, 1, 1, ctx.seasonal_period), None))
    fit = _walk_forward(ctx, chosen[0], chosen[1], chosen[2], "sarima")
    if search:
        fit.params["search"] = search
    return fit


def classical_specs() -> list[ModelSpec]:
    return [
        ModelSpec("arima", "classical", "ARIMA with AIC order search on the training window", arima),
        ModelSpec("sarima", "classical", "SARIMA with AIC seasonal-order search on the training window", sarima),
    ]
