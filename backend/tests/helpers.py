"""Shared helpers for API tests that drive the real dataset through the pipeline."""
import time
from pathlib import Path


def upload_csv(client, headers, path: Path, name="Household", filename=None):
    with open(path, "rb") as fh:
        return client.post(
            "/api/admin/datasets", headers=headers,
            files={"file": (filename or path.name, fh, "text/csv")},
            data={"name": name, "energy_type": "electricity"},
        )


def configure_from_profile(client, headers, ds_id, profile, **overrides):
    s = profile["suggested_config"]
    body = {"timestamp_columns": s["timestamp_columns"], "datetime_format": s["datetime_format"],
            "target_column": s["target_column"], "exogenous_columns": s["exogenous_columns"], "na_values": ["?"]}
    body.update(overrides)
    return client.put(f"/api/admin/datasets/{ds_id}", headers=headers, json=body)


def train_and_wait(client, headers, dataset_id, models=None, timeout=180):
    body = {"dataset_id": dataset_id, **({"models": models} if models else {})}
    r = client.post("/api/admin/models/train", headers=headers, json=body)
    assert r.status_code == 202, r.text
    run_id = r.json()["id"]
    for _ in range(timeout):
        run = client.get(f"/api/admin/training-runs/{run_id}", headers=headers).json()
        if run["status"] in ("completed", "failed"):
            assert run["status"] == "completed", run
            return run
        time.sleep(1)
    raise AssertionError("training did not finish in time")


def run_step(client, headers, ds_id, action, timeout=180):
    """Validate / process run as background jobs (the API answers 202); wait until the dataset leaves the busy state."""
    r = client.post(f"/api/admin/datasets/{ds_id}/{action}", headers=headers)
    assert r.status_code in (200, 202), r.text
    for _ in range(timeout):
        d = client.get(f"/api/admin/datasets/{ds_id}", headers=headers).json()
        if d["status"] not in ("validating", "processing"):
            return d
        time.sleep(1)
    raise AssertionError(f"{action} did not finish in time")
