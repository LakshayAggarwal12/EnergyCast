"""Model comparison on a common set of timestamps."""
from __future__ import annotations

from typing import Any

import pandas as pd

from app.ml.metrics import regression_metrics
from app.ml.splitting import SplitInfo


def evaluate_models(
    predictions: dict[str, pd.Series],
    y: pd.Series,
    valid_rows: pd.Series,
    eval_index: pd.DatetimeIndex,
    split: SplitInfo,
) -> tuple[dict[str, dict[str, Any]], dict[str, Any]]:
    """Every model is scored on exactly the same timestamps: observed targets with complete features, where
    every model produced a forecast. Returns (per-model metrics, evaluation summary)."""
    common = valid_rows.reindex(eval_index).to_numpy(dtype=bool).copy()
    for pred in predictions.values():
        common &= pred.reindex(eval_index).notna().to_numpy()

    in_val = ((eval_index >= split.train_end) & (eval_index < split.val_end))
    in_test = eval_index >= split.val_end
    val_idx = eval_index[common & in_val]
    test_idx = eval_index[common & in_test]

    results: dict[str, dict[str, Any]] = {}
    for name, pred in predictions.items():
        results[name] = {
            "validation": regression_metrics(y.loc[val_idx], pred.loc[val_idx]),
            "test": regression_metrics(y.loc[test_idx], pred.loc[test_idx]),
        }
    summary = {
        "scored_timestamps_validation": int(len(val_idx)),
        "scored_timestamps_test": int(len(test_idx)),
        "excluded_from_scoring": int((~common).sum()),
        "scoring_rule": "observed target, complete features, forecast available from every model",
        "models_compared": list(predictions),
    }
    return results, summary


def best_on_validation(models: list[dict[str, Any]], metric: str = "mae") -> dict[str, Any] | None:
    """Selection uses validation only; the test set is reserved for reporting."""
    scored = [
        m for m in models
        if m.get("status") in ("trained", "published") and (m.get("metrics") or {}).get("validation", {}).get(metric) is not None
    ]
    if not scored:
        return None
    best = min(scored, key=lambda m: m["metrics"]["validation"][metric])
    return {"metric": metric, "split": "validation", "model_name": best["model_name"], "value": best["metrics"]["validation"][metric]}
