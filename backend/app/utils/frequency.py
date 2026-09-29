"""Sampling-frequency helpers. Frequencies are handled internally as whole minutes."""
from __future__ import annotations

import re

import pandas as pd

MINUTES_PER_DAY = 1440
_FREQ_RE = re.compile(r"^(\d*)\s*(min|t|h|d)$", re.IGNORECASE)


class FrequencyError(ValueError):
    pass


def freq_to_minutes(freq: str) -> int:
    """'1h' / 'h' / '30min' / 'D' -> minutes. Raises FrequencyError for anything else."""
    match = _FREQ_RE.match(freq.strip())
    if not match:
        raise FrequencyError(f"Unsupported frequency '{freq}'. Use values like 1min, 15min, 30min, 1h, 1D.")
    count = int(match.group(1) or 1)
    unit = match.group(2).lower()
    minutes = count * {"min": 1, "t": 1, "h": 60, "d": MINUTES_PER_DAY}[unit]
    check_supported(minutes)
    return minutes


def check_supported(minutes: int) -> None:
    if minutes < 1:
        raise FrequencyError("Sampling intervals below one minute are not supported.")
    if minutes > MINUTES_PER_DAY:
        raise FrequencyError("Sampling intervals longer than one day are not supported in this version.")
    if minutes < MINUTES_PER_DAY and MINUTES_PER_DAY % minutes != 0:
        raise FrequencyError(f"A {minutes}-minute interval does not divide a day evenly and is not supported.")


def minutes_to_alias(minutes: int) -> str:
    """Canonical pandas alias for a whole number of minutes."""
    if minutes % MINUTES_PER_DAY == 0:
        return f"{minutes // MINUTES_PER_DAY}D"
    if minutes % 60 == 0:
        return f"{minutes // 60}h"
    return f"{minutes}min"


def steps_per_day(minutes: int) -> int:
    return MINUTES_PER_DAY // minutes if minutes < MINUTES_PER_DAY else 1


def resolve_modeling_minutes(native_minutes: int, requested: str | None) -> int:
    """Modeling frequency: requested, else hourly for sub-hourly data, else native."""
    if requested:
        modeling = freq_to_minutes(requested)
    else:
        modeling = 60 if native_minutes < 60 else native_minutes
    if modeling < native_minutes or modeling % native_minutes != 0:
        raise FrequencyError(
            f"Modeling frequency {minutes_to_alias(modeling)} must be equal to, or a whole multiple of, "
            f"the native frequency {minutes_to_alias(native_minutes)}."
        )
    return modeling


def default_horizon(modeling_minutes: int) -> int:
    """Default forecast horizon in steps: one day for sub-daily data, one week for daily data."""
    return steps_per_day(modeling_minutes) if modeling_minutes < MINUTES_PER_DAY else 7


def timedelta_to_minutes(delta: pd.Timedelta) -> float:
    return delta.total_seconds() / 60.0
