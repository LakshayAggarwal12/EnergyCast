"""Shared types for the modeling pipeline."""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Callable

import pandas as pd

from app.features.engineering import FeaturePlan
from app.ml.splitting import SplitInfo


@dataclass
class TrainingContext:
    y: pd.Series                 # target on the full regular grid (short gaps interpolated, long gaps NaN)
    X: pd.DataFrame              # engineered features on the same grid
    train_rows: pd.Series        # bool: complete features + observed target, inside the train period
    val_rows: pd.Series          # bool: same, inside the validation period
    eval_index: pd.DatetimeIndex # validation + test timestamps (contiguous)
    split: SplitInfo
    plan: FeaturePlan
    steps_per_day: int
    seasonal_period: int
    arima_fit_window: int
    random_state: int = 42
    tune: bool = True

    @property
    def horizon(self) -> int:
        return self.plan.horizon

    @property
    def freq_minutes(self) -> int:
        return self.plan.freq_minutes


@dataclass
class ModelFit:
    predictions: pd.Series       # indexed by ctx.eval_index (NaN where the model could not forecast)
    artifact: dict[str, Any]     # serialisable payload saved with joblib
    params: dict[str, Any] = field(default_factory=dict)


@dataclass(frozen=True)
class ModelSpec:
    name: str
    category: str                # baseline | classical | feature_ml
    description: str
    fit_predict: Callable[[TrainingContext], ModelFit]
