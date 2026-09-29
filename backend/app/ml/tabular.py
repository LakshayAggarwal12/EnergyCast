"""Feature-based ML models: Linear Regression, Random Forest, XGBoost."""
from __future__ import annotations

import numpy as np
import pandas as pd
import xgboost as xgb
from sklearn.ensemble import RandomForestRegressor
from sklearn.linear_model import LinearRegression

from app.ml.base import ModelFit, ModelSpec, TrainingContext


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
    model = RandomForestRegressor(
        n_estimators=300, max_features=0.5, min_samples_leaf=2, n_jobs=-1, random_state=ctx.random_state
    )
    model.fit(ctx.X[ctx.train_rows], ctx.y[ctx.train_rows])
    return ModelFit(
        _predict_eval(ctx, model), _artifact("sklearn", model, ctx),
        {"n_estimators": 300, "max_features": 0.5, "min_samples_leaf": 2, "n_train_rows": int(ctx.train_rows.sum()),
         "top_feature_importances": _top_importances(list(ctx.X.columns), model.feature_importances_)},
    )


def xgboost_model(ctx: TrainingContext) -> ModelFit:
    """Early stopping uses the *validation* period only; the test period is never touched during fitting."""
    model = xgb.XGBRegressor(
        n_estimators=1000, learning_rate=0.05, max_depth=6, subsample=0.8, colsample_bytree=0.8,
        min_child_weight=3, objective="reg:squarederror", eval_metric="mae", early_stopping_rounds=50,
        tree_method="hist", n_jobs=-1, random_state=ctx.random_state,
    )
    model.fit(
        ctx.X[ctx.train_rows], ctx.y[ctx.train_rows],
        eval_set=[(ctx.X[ctx.val_rows], ctx.y[ctx.val_rows])], verbose=False,
    )
    return ModelFit(
        _predict_eval(ctx, model), _artifact("xgboost", model, ctx),
        {"learning_rate": 0.05, "max_depth": 6, "best_iteration": int(model.best_iteration),
         "early_stopping": "validation MAE, 50 rounds", "n_train_rows": int(ctx.train_rows.sum()),
         "top_feature_importances": _top_importances(list(ctx.X.columns), model.feature_importances_)},
    )


def tabular_specs() -> list[ModelSpec]:
    return [
        ModelSpec("linear_regression", "feature_ml", "Linear Regression on engineered features", linear_regression),
        ModelSpec("random_forest", "feature_ml", "Random Forest (300 trees)", random_forest),
        ModelSpec("xgboost", "feature_ml", "XGBoost with validation early stopping", xgboost_model),
    ]
