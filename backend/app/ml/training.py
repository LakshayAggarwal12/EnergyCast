"""Training orchestration (pure: DataFrame in, model outcomes out). Persistence lives in the service layer."""
from __future__ import annotations

import time
import traceback
from dataclasses import dataclass, field
from typing import Any, Callable

import numpy as np
import pandas as pd

from app.data.preprocessing import OBSERVED_COL
from app.features.engineering import FeaturePlan, build_features
from app.ml.base import ModelFit, ModelSpec, TrainingContext
from app.ml.baselines import baseline_specs
from app.ml.classical import classical_specs
from app.ml.evaluation import evaluate_models
from app.ml.splitting import SplitInfo, chronological_split
from app.ml.tabular import tabular_specs


@dataclass
class TrainingConfig:
    target: str
    plan: FeaturePlan
    train_ratio: float = 0.70
    val_ratio: float = 0.15
    models: list[str] | None = None
    arima_fit_days: int = 180
    random_state: int = 42

    def to_dict(self) -> dict[str, Any]:
        return {
            "target": self.target, "plan": self.plan.to_dict(), "train_ratio": self.train_ratio,
            "val_ratio": self.val_ratio, "models": self.models, "arima_fit_days": self.arima_fit_days,
            "random_state": self.random_state,
        }

    @classmethod
    def from_dict(cls, d: dict[str, Any]) -> "TrainingConfig":
        return cls(target=d["target"], plan=FeaturePlan.from_dict(d["plan"]), train_ratio=d["train_ratio"],
                   val_ratio=d["val_ratio"], models=d.get("models"), arima_fit_days=d["arima_fit_days"],
                   random_state=d.get("random_state", 42))


@dataclass
class ModelOutcome:
    name: str
    category: str
    status: str                       # trained | failed
    seconds: float
    params: dict[str, Any] = field(default_factory=dict)
    metrics: dict[str, Any] | None = None
    artifact: dict[str, Any] | None = None
    error: str | None = None


@dataclass
class TrainingOutput:
    split: dict[str, Any]
    summary: dict[str, Any]
    outcomes: list[ModelOutcome]
    feature_columns: list[str]


def available_specs(steps_per_day: int, freq_minutes: int) -> dict[str, ModelSpec]:
    specs = baseline_specs(steps_per_day, freq_minutes) + classical_specs() + tabular_specs()
    return {s.name: s for s in specs}


def train_and_evaluate(
    frame: pd.DataFrame,
    cfg: TrainingConfig,
    progress: Callable[[str], None] | None = None,
) -> TrainingOutput:
    progress = progress or (lambda _msg: None)
    plan = cfg.plan
    spd = 1440 // plan.freq_minutes if plan.freq_minutes < 1440 else 1
    specs = available_specs(spd, plan.freq_minutes)
    requested = cfg.models or list(specs)
    unknown = [m for m in requested if m not in specs]
    if unknown:
        raise ValueError(f"Unknown model(s): {', '.join(unknown)}. Available: {', '.join(specs)}.")

    progress("building features")
    y = frame[cfg.target]
    X = build_features(frame, cfg.target, plan)
    split: SplitInfo = chronological_split(frame.index, cfg.train_ratio, cfg.val_ratio, plan.freq_minutes)
    masks = split.masks(frame.index)
    valid = pd.Series(X.notna().all(axis=1).to_numpy() & y.notna().to_numpy() & frame[OBSERVED_COL].to_numpy(),
                      index=frame.index)
    train_rows = valid & pd.Series(masks["train"], index=frame.index)
    val_rows = valid & pd.Series(masks["validation"], index=frame.index)
    if int(train_rows.sum()) < 500 or int(val_rows.sum()) < 24:
        raise ValueError("Too few complete rows in the train/validation periods to train models.")

    eval_index = frame.index[frame.index >= split.train_end]
    ctx = TrainingContext(
        y=y, X=X, train_rows=train_rows, val_rows=val_rows, eval_index=eval_index, split=split, plan=plan,
        steps_per_day=spd, seasonal_period=spd if plan.freq_minutes < 1440 else 7,
        arima_fit_window=cfg.arima_fit_days * spd, random_state=cfg.random_state,
    )

    fits: dict[str, ModelFit] = {}
    outcomes: dict[str, ModelOutcome] = {}
    for i, name in enumerate(requested, start=1):
        spec = specs[name]
        progress(f"training {name} ({i}/{len(requested)})")
        t0 = time.perf_counter()
        try:
            fit = spec.fit_predict(ctx)
            if fit.predictions.notna().sum() == 0:
                raise ValueError("The model produced no forecasts.")
            fits[name] = fit
            outcomes[name] = ModelOutcome(name, spec.category, "trained", time.perf_counter() - t0,
                                          params=fit.params, artifact=fit.artifact)
        except Exception as exc:  # isolate failures: one model must not abort the run
            outcomes[name] = ModelOutcome(
                name, spec.category, "failed", time.perf_counter() - t0,
                error=f"{type(exc).__name__}: {exc}"[:500],
            )
            traceback.print_exc()

    if not fits:
        raise RuntimeError("Every model failed to train; see the individual model errors.")

    progress("evaluating models")
    metrics, eval_summary = evaluate_models({n: f.predictions for n, f in fits.items()}, y, valid, eval_index, split)
    for name, m in metrics.items():
        outcomes[name].metrics = m

    summary = {
        **eval_summary,
        "horizon_steps": plan.horizon,
        "forecast_protocol": (
            f"direct {plan.horizon}-step-ahead forecasts issued every {plan.horizon} steps; "
            "features use only data available at issue time"
        ),
        "train_rows_used": int(train_rows.sum()),
        "validation_rows_used": int(val_rows.sum()),
    }
    return TrainingOutput(
        split=split.to_dict(frame.index), summary=summary,
        outcomes=[outcomes[n] for n in requested], feature_columns=list(X.columns),
    )
