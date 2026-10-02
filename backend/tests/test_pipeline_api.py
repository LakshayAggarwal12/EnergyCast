"""End-to-end pipeline tests against the REAL dataset files (upload -> configure -> validate -> process -> train)."""
import time
from pathlib import Path

import joblib
import pandas as pd
import pytest

from tests.helpers import configure_from_profile, upload_csv

EXO = ["Global_reactive_power", "Voltage", "Global_intensity", "Sub_metering_1", "Sub_metering_2", "Sub_metering_3"]


def test_upload_inspects_real_schema(client, admin_headers, household_slice):
    r = upload_csv(client, admin_headers, household_slice)
    assert r.status_code == 201
    d = r.json()
    prof = d["schema_profile"]
    assert prof["csv"]["delimiter"] == ";" and prof["csv"]["wrapped_in_quotes"] is True
    assert prof["suggested_config"]["timestamp_columns"] == ["Date", "Time"]
    assert prof["suggested_config"]["target_column"] == "Global_active_power"
    assert prof["timestamp_detection"]["format"] == "%d/%m/%Y %H:%M:%S"
    assert d["status"] == "uploaded" and "file_path" not in d and "sha256" not in d


def test_full_pipeline_upload_to_training(client, admin_headers, processed_dataset):
    ds = processed_dataset
    rep = ds["validation_report"]
    assert rep["passed"] and rep["checks"]["frequency"]["inferred"] == "1min"
    assert rep["checks"]["missing_values"]["per_column"]["Global_active_power"]["missing"] >= 0
    pre = ds["preprocessing_report"]
    assert pre["modeling_frequency"] == "1h" and pre["outlier_policy"] == "reported, not removed"

    t = client.post("/api/admin/models/train", headers=admin_headers, json={"dataset_id": ds["id"]})
    assert t.status_code == 202, t.text
    run_id = t.json()["id"]
    for _ in range(120):
        run = client.get(f"/api/admin/training-runs/{run_id}", headers=admin_headers).json()
        if run["status"] in ("completed", "failed"):
            break
        time.sleep(1)
    assert run["status"] == "completed", run
    split = run["split"]
    assert split["train"]["end"] == split["validation"]["start"] and split["validation"]["end"] == split["test"]["start"]
    assert pd.Timestamp(split["train"]["start"]) < pd.Timestamp(split["train"]["end"])

    names = {m["model_name"]: m for m in run["models"]}
    assert {"naive", "seasonal_naive", "moving_average", "arima", "sarima", "linear_regression", "random_forest", "xgboost"} <= set(names)
    for m in names.values():
        assert m["status"] == "trained", m
        for part in ("validation", "test"):
            met = m["metrics"][part]
            assert met["n"] > 100 and met["mae"] > 0 and met["rmse"] >= met["mae"]
            assert met["mape"] is not None  # target has no zeros, so MAPE is defined
    # No accuracy ranking is asserted: on a short slice any model may win. Check internal consistency instead.
    assert all(m["metrics"]["validation"]["mae"] < 5 for m in names.values())
    assert names["xgboost"]["params"]["best_iteration"] >= 1
    # every model was scored on identical timestamps
    assert len({m["metrics"]["test"]["n"] for m in names.values()}) == 1

    art = joblib.load(_artifact_path(ds["id"], run["version"], "xgboost"))
    assert art["model_name"] == "xgboost" and art["feature_columns"] and art["feature_plan"]["horizon"] == 24

    cmp_ = client.get(f"/api/admin/models/{ds['id']}", headers=admin_headers).json()
    assert cmp_["best_on_validation"]["split"] == "validation" and cmp_["latest_run"]["id"] == run_id
    maes = [m["metrics"]["validation"]["mae"] for m in cmp_["latest_models"]]
    assert maes == sorted(maes)
    assert "artifact_path" not in cmp_["latest_models"][0]

    again = client.post("/api/admin/models/train", headers=admin_headers, json={"dataset_id": ds["id"], "models": ["naive"]})
    assert again.status_code == 202 and again.json()["version"] == 2


def _artifact_path(dataset_id, version, model):
    from app.config import get_settings
    return get_settings().MODEL_STORAGE_PATH / f"dataset_{dataset_id}" / f"v{version}" / f"{model}.joblib"


def test_train_requires_processed_dataset_and_valid_model_names(client, admin_headers, household_slice, processed_dataset):
    up = upload_csv(client, admin_headers, household_slice, name="Second").json()
    r = client.post("/api/admin/models/train", headers=admin_headers, json={"dataset_id": up["id"]})
    assert r.status_code == 409
    r = client.post("/api/admin/models/train", headers=admin_headers, json={"dataset_id": processed_dataset["id"], "models": ["nope"]})
    assert r.status_code == 422
    assert client.post("/api/admin/models/train", headers=admin_headers, json={"dataset_id": 9999}).status_code == 404


def test_electricity_csv_without_timestamps_is_rejected(client, admin_headers, electricity_csv):
    r = upload_csv(client, admin_headers, electricity_csv, name="Electricity")
    assert r.status_code == 201
    d = r.json()
    assert d["schema_profile"]["csv"]["has_header"] is False
    assert d["schema_profile"]["suggested_config"]["timestamp_columns"] == []
    from tests.helpers import run_step
    v = run_step(client, admin_headers, d["id"], "validate")
    assert v["status"] == "rejected"
    codes = {e["code"] for e in v["validation_report"]["errors"]}
    assert "missing_timestamp" in codes
    assert client.post(f"/api/admin/datasets/{d['id']}/process", headers=admin_headers).status_code == 409


def test_upload_rejects_bad_files(client, admin_headers, tmp_path):
    def post(name, content):
        return client.post("/api/admin/datasets", headers=admin_headers, files={"file": (name, content, "text/csv")},
                           data={"name": "x", "energy_type": "electricity"})
    assert post("data.txt", b"a,b\n1,2\n").status_code == 422
    assert post("empty.csv", b"").status_code == 422
    assert post("bin.csv", b"\x00\x01\x02" * 100).status_code == 422


def test_upload_filename_cannot_traverse_paths(client, admin_headers, tmp_path):
    from app.config import get_settings
    p = tmp_path / "t.csv"
    p.write_text("a,b\n" + "\n".join(f"{i},{i}" for i in range(50)))
    with open(p, "rb") as fh:
        r = client.post("/api/admin/datasets", headers=admin_headers,
                        files={"file": ("../../../etc/evil.csv", fh, "text/csv")}, data={"name": "x", "energy_type": "e"})
    assert r.status_code == 201
    assert "/" not in r.json()["original_filename"] and ".." not in r.json()["original_filename"].replace("...", "")
    raw = get_settings().raw_dir
    assert all(f.parent == raw for f in raw.iterdir())


def test_config_change_invalidates_processed_state_and_delete_removes_files(client, admin_headers, processed_dataset):
    ds = processed_dataset
    from app.config import get_settings
    proc = get_settings().processed_dir / f"dataset_{ds['id']}.parquet"
    assert proc.exists()
    r = configure_from_profile(client, admin_headers, ds["id"], ds["schema_profile"], exogenous_columns=["Voltage"])
    assert r.status_code == 200 and r.json()["status"] == "configured" and r.json()["validation_report"] is None
    assert not proc.exists()
    assert {f["name"] for f in r.json()["features"]} == {"calendar", "target_lags", "target_rolling", "Voltage"}
    assert client.delete(f"/api/admin/datasets/{ds['id']}", headers=admin_headers).status_code == 204
    assert client.get(f"/api/admin/datasets/{ds['id']}", headers=admin_headers).status_code == 404


def test_config_validation_errors(client, admin_headers, household_slice):
    d = upload_csv(client, admin_headers, household_slice).json()
    base = {"timestamp_columns": ["Date", "Time"], "target_column": "Global_active_power"}
    assert client.put(f"/api/admin/datasets/{d['id']}", headers=admin_headers, json={**base, "target_column": "Nope"}).status_code == 422
    assert client.put(f"/api/admin/datasets/{d['id']}", headers=admin_headers, json={**base, "target_column": "Date"}).status_code == 422
    assert client.put(f"/api/admin/datasets/{d['id']}", headers=admin_headers, json={**base, "frequency": "7min"}).status_code == 422
    r = client.put(f"/api/admin/datasets/{d['id']}", headers=admin_headers, json={**base, "frequency": "1h"})
    assert r.status_code == 200
    from tests.helpers import run_step
    v = run_step(client, admin_headers, d["id"], "validate")
    assert v["status"] == "rejected" and any(e["code"] == "frequency_mismatch" for e in v["validation_report"]["errors"])
