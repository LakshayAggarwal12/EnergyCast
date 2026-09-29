"""Chronological train / validation / test split. Data is never shuffled."""
from __future__ import annotations

from dataclasses import dataclass
from typing import Any

import numpy as np
import pandas as pd

from app.utils.frequency import MINUTES_PER_DAY


@dataclass(frozen=True)
class SplitInfo:
    start: pd.Timestamp
    train_end: pd.Timestamp  # first timestamp of validation (exclusive end of train)
    val_end: pd.Timestamp    # first timestamp of test (exclusive end of validation)
    end: pd.Timestamp        # last timestamp (inclusive)

    def masks(self, index: pd.DatetimeIndex) -> dict[str, np.ndarray]:
        return {
            "train": np.asarray(index < self.train_end),
            "validation": np.asarray((index >= self.train_end) & (index < self.val_end)),
            "test": np.asarray(index >= self.val_end),
        }

    def to_dict(self, index: pd.DatetimeIndex) -> dict[str, Any]:
        m = self.masks(index)
        return {
            "strategy": "chronological (no shuffling)",
            "train": {"start": str(self.start), "end": str(self.train_end), "steps": int(m["train"].sum())},
            "validation": {"start": str(self.train_end), "end": str(self.val_end), "steps": int(m["validation"].sum())},
            "test": {"start": str(self.val_end), "end": str(self.end), "steps": int(m["test"].sum())},
        }


def chronological_split(
    index: pd.DatetimeIndex, train_ratio: float, val_ratio: float, freq_minutes: int
) -> SplitInfo:
    if not index.is_monotonic_increasing or index.has_duplicates:
        raise ValueError("The index must be strictly increasing before splitting.")
    if not (0 < train_ratio < 1 and 0 < val_ratio < 1 and train_ratio + val_ratio < 1):
        raise ValueError("train_ratio and val_ratio must be positive and sum to less than 1.")
    n = len(index)
    t1 = index[int(n * train_ratio)]
    t2 = index[int(n * (train_ratio + val_ratio))]
    if freq_minutes < MINUTES_PER_DAY:  # align to midnight so daily forecast blocks never straddle a boundary
        t1, t2 = t1.normalize(), t2.normalize()
    if not (index[0] < t1 < t2 <= index[-1]):
        raise ValueError("The dataset is too short to form non-empty train/validation/test sets.")
    return SplitInfo(start=index[0], train_end=t1, val_end=t2, end=index[-1])
