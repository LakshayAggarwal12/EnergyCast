"""Small validation-only hyperparameter searches. The test period is never used to pick settings."""
from __future__ import annotations

from typing import Any, Callable

import numpy as np
import pandas as pd
import xgboost as xgb
from sklearn.ensemble import RandomForestRegressor

from app.ml.base import TrainingContext
from app.ml.metrics import regression_metrics


def validation_mae(ctx: TrainingContext, preds: pd.Series) -> float:
    y = ctx.y[ctx.val_rows]
    p = preds.reindex(y.index)
    met = regression_metrics(y.to_numpy(), p.to_numpy())
    if met["mae"] is None:
        return float("inf")
    return float(met["mae"])


def _predict_matrix(model, ctx: TrainingContext, rows: pd.Series) -> pd.Series:
    X = ctx.X[rows]
    ok = X.notna().all(axis=1).to_numpy()
    out = np.full(int(rows.sum()), np.nan)
    if ok.any():
        out[ok] = model.predict(X[ok])
    return pd.Series(out, index=ctx.X.index[rows.to_numpy()])


def search_sklearn(
    ctx: TrainingContext,
    factory: Callable[[dict[str, Any]], Any],
    grid: list[dict[str, Any]],
) -> tuple[Any, dict[str, Any], list[dict[str, Any]]]:
    """Fit each candidate on train rows, score MAE on validation rows, return the winner."""
    tried: list[dict[str, Any]] = []
    best_model, best_params, best_mae = None, grid[0], float("inf")
    X_train, y_train = ctx.X[ctx.train_rows], ctx.y[ctx.train_rows]
    for params in grid:
        model = factory(params)
        model.fit(X_train, y_train)
        preds = _predict_matrix(model, ctx, ctx.val_rows)
        mae = validation_mae(ctx, preds)
        tried.append({**params, "validation_mae": None if mae == float("inf") else round(mae, 6)})
        if mae < best_mae:
            best_mae, best_model, best_params = mae, model, params
    if best_model is None:
        raise ValueError("Hyperparameter search did not produce a usable model.")
    return best_model, best_params, tried


def random_forest_grid(random_state: int) -> list[dict[str, Any]]:
    return [
        # bounded trees: an unlimited-depth 300-tree forest needs ~550 MB, more than a 512 MB instance has
        {"n_estimators": 150, "max_depth": 10, "min_samples_leaf": 3, "max_features": 0.5, "random_state": random_state},
        {"n_estimators": 150, "max_depth": 14, "min_samples_leaf": 5, "max_features": 0.5, "random_state": random_state},
    ]


def fit_random_forest(params: dict[str, Any]) -> RandomForestRegressor:
    return RandomForestRegressor(n_jobs=1, **params)


def xgboost_grid(random_state: int) -> list[dict[str, Any]]:
    return [
        {"max_depth": 4, "learning_rate": 0.08, "min_child_weight": 3, "random_state": random_state},
        {"max_depth": 6, "learning_rate": 0.05, "min_child_weight": 3, "random_state": random_state},
    ]


def fit_xgboost(ctx: TrainingContext, params: dict[str, Any]) -> xgb.XGBRegressor:
    model = xgb.XGBRegressor(
        n_estimators=600, subsample=0.8, colsample_bytree=0.8, objective="reg:squarederror",
        eval_metric="mae", early_stopping_rounds=40, tree_method="hist", n_jobs=1, **params,
    )
    model.fit(
        ctx.X[ctx.train_rows], ctx.y[ctx.train_rows],
        eval_set=[(ctx.X[ctx.val_rows], ctx.y[ctx.val_rows])], verbose=False,
    )
    return model


def search_xgboost(ctx: TrainingContext) -> tuple[xgb.XGBRegressor, dict[str, Any], list[dict[str, Any]]]:
    tried: list[dict[str, Any]] = []
    best_model, best_params, best_mae = None, xgboost_grid(ctx.random_state)[0], float("inf")
    for params in xgboost_grid(ctx.random_state):
        model = fit_xgboost(ctx, params)
        preds = _predict_matrix(model, ctx, ctx.val_rows)
        mae = validation_mae(ctx, preds)
        row = {**params, "best_iteration": int(model.best_iteration), "validation_mae": None if mae == float("inf") else round(mae, 6)}
        tried.append(row)
        if mae < best_mae:
            best_mae, best_model, best_params = mae, model, params
    if best_model is None:
        raise ValueError("XGBoost search did not produce a usable model.")
    return best_model, best_params, tried


def arima_candidates() -> list[tuple[tuple[int, int, int], tuple[int, int, int, int], str | None]]:
    return [
        ((1, 0, 1), (0, 0, 0, 0), "c"),
        ((2, 0, 1), (0, 0, 0, 0), "c"),
        ((1, 1, 1), (0, 0, 0, 0), "c"),
    ]


def sarima_candidates(season: int) -> list[tuple[tuple[int, int, int], tuple[int, int, int, int], str | None]]:
    s = max(int(season), 2)
    return [
        ((1, 0, 1), (0, 1, 1, s), None),
        ((0, 1, 1), (0, 1, 1, s), None),
    ]
