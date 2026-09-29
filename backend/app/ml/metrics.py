"""Forecast accuracy metrics."""
from __future__ import annotations

import numpy as np

MAPE_EPSILON = 1e-6


def regression_metrics(y_true, y_pred) -> dict[str, float | int | None]:
    """MAE, RMSE, MAPE (%), R². MAPE is only reported when every actual value is non-zero
    (it is mathematically undefined otherwise); missing/non-finite pairs are excluded."""
    yt = np.asarray(y_true, dtype="float64")
    yp = np.asarray(y_pred, dtype="float64")
    ok = np.isfinite(yt) & np.isfinite(yp)
    yt, yp = yt[ok], yp[ok]
    n = int(len(yt))
    if n == 0:
        return {"n": 0, "mae": None, "rmse": None, "mape": None, "r2": None}
    err = yt - yp
    mae = float(np.mean(np.abs(err)))
    rmse = float(np.sqrt(np.mean(err**2)))
    mape = float(np.mean(np.abs(err) / np.abs(yt)) * 100) if np.all(np.abs(yt) > MAPE_EPSILON) else None
    ss_tot = float(np.sum((yt - yt.mean()) ** 2))
    r2 = float(1 - np.sum(err**2) / ss_tot) if n > 1 and ss_tot > 0 else None
    return {"n": n, "mae": mae, "rmse": rmse, "mape": mape, "r2": r2}
