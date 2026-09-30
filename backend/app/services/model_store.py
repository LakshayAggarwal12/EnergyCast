"""Safe loading of trained model bundles, with a tiny cache (models can be large: keep one in memory)."""
from __future__ import annotations

import threading
from collections import OrderedDict
from pathlib import Path
from typing import Any

import joblib

from app.config import get_settings

MAX_CACHED_MODELS = 1
_lock = threading.Lock()
_cache: OrderedDict[tuple[str, int], dict[str, Any]] = OrderedDict()


class ArtifactError(RuntimeError):
    """The model file is missing, outside the model storage directory, or unreadable."""


def resolve_artifact_path(path: str | None) -> Path:
    if not path:
        raise ArtifactError("This model has no saved artifact.")
    root = get_settings().MODEL_STORAGE_PATH.resolve()
    resolved = Path(path).resolve()
    if not resolved.is_relative_to(root):  # artifacts are only ever read from the managed directory
        raise ArtifactError("The model artifact is outside the model storage directory.")
    if not resolved.is_file():
        raise ArtifactError("The model artifact file is missing on the server.")
    return resolved


def load_bundle(path: str | None) -> dict[str, Any]:
    resolved = resolve_artifact_path(path)
    key = (str(resolved), resolved.stat().st_mtime_ns)
    with _lock:
        if key in _cache:
            _cache.move_to_end(key)
            return _cache[key]
        try:
            bundle = joblib.load(resolved)
        except Exception as exc:
            raise ArtifactError(f"The model artifact could not be loaded: {type(exc).__name__}") from exc
        if not isinstance(bundle, dict) or "artifact" not in bundle or "feature_plan" not in bundle:
            raise ArtifactError("The model artifact has an unexpected format.")
        _cache[key] = bundle
        while len(_cache) > MAX_CACHED_MODELS:
            _cache.popitem(last=False)
        return bundle


def clear_cache() -> None:
    with _lock:
        _cache.clear()
