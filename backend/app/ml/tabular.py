"""Feature-based ML models: Linear Regression, Random Forest, XGBoost."""
from __future__ import annotations

import numpy as np
import pandas as pd
from sklearn.linear_model import LinearRegression

from app.ml.base import ModelFit, ModelSpec, TrainingContext
from app.ml.tuning import fit_random_forest, random_forest_grid, search_sklearn, search_xgboost


def _predict_eval(ctx: TrainingContext, model) -> pd.Series:
    X_eval = ctx.X.loc[ctx.eval_index]
    ok = X_eval.notna().all(axis=1).to_numpy()
    preds = np.full(len(X_eval), np.nan)
    if ok.any():
        preds[ok] = model.predict(X_eval[ok])
    return pd.Series(preds, index=ctx.eval_index)


def _top_importances(columns: list[str], values, k: int = 10) -> dict[str, float]:
    order = np.argsort(values)[::-1][:k]
    return {columns[i]: float(values[i]) for i in order}


def _artifact(kind: str, model, ctx: TrainingContext) -> dict:
    return {"kind": kind, "estimator": model, "feature_columns": list(ctx.X.columns)}


def linear_regression(ctx: TrainingContext) -> ModelFit:
    model = LinearRegression()
    model.fit(ctx.X[ctx.train_rows], ctx.y[ctx.train_rows])
    coefs = dict(zip(ctx.X.columns, model.coef_))
    top = dict(sorted(coefs.items(), key=lambda kv: abs(kv[1]), reverse=True)[:10])
    return ModelFit(_predict_eval(ctx, model), _artifact("sklearn", model, ctx),
                    {"n_train_rows": int(ctx.train_rows.sum()), "largest_coefficients": {k: float(v) for k, v in top.items()}})


def random_forest(ctx: TrainingContext) -> ModelFit:
    grid = random_forest_grid(ctx.random_state)
    if ctx.tune:
        model, params, tried = search_sklearn(ctx, fit_random_forest, grid)
    else:
        params = grid[-1]
        model = fit_random_forest(params)
        model.fit(ctx.X[ctx.train_rows], ctx.y[ctx.train_rows])
        tried = None
    recorded = {k: (None if v is None else v) for k, v in params.items() if k != "random_state"}
    recorded["n_train_rows"] = int(ctx.train_rows.sum())
    recorded["top_feature_importances"] = _top_importances(list(ctx.X.columns), model.feature_importances_)
    if tried is not None:
        recorded["search"] = {"criterion": "validation_mae", "tried": tried}
    return ModelFit(_predict_eval(ctx, model), _artifact("sklearn", model, ctx), recorded)


def xgboost_model(ctx: TrainingContext) -> ModelFit:
    """Candidate configs (and early stopping) use the validation period only; the test period is never touched."""
    if ctx.tune:
        model, params, tried = search_xgboost(ctx)
    else:
        from app.ml.tuning import fit_xgboost
        params = {"max_depth": 6, "learning_rate": 0.05, "min_child_weight": 3, "random_state": ctx.random_state}
        model = fit_xgboost(ctx, params)
        tried = None
    recorded = {
        "learning_rate": params["learning_rate"], "max_depth": params["max_depth"],
        "min_child_weight": params["min_child_weight"],
        "best_iteration": int(model.best_iteration),
        "early_stopping": "validation MAE, 40 rounds",
        "n_train_rows": int(ctx.train_rows.sum()),
        "top_feature_importances": _top_importances(list(ctx.X.columns), model.feature_importances_),
    }
    if tried is not None:
        recorded["search"] = {"criterion": "validation_mae", "tried": tried}
    return ModelFit(_predict_eval(ctx, model), _artifact("xgboost", model, ctx), recorded)


def tabular_specs() -> list[ModelSpec]:
    return [
        ModelSpec("linear_regression", "feature_ml", "Linear Regression on engineered features", linear_regression),
        ModelSpec("random_forest", "feature_ml", "Random Forest with validation MAE search", random_forest),
        ModelSpec("xgboost", "feature_ml", "XGBoost with validation MAE search and early stopping", xgboost_model),
    ]
