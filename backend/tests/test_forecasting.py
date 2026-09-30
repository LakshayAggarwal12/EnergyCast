"""Publishing and forecasting, on the real household data."""
import joblib
import numpy as np
import pandas as pd
import pytest

from app.config import get_settings
from app.data.preprocessing import load_processed
from app.features.engineering import FeaturePlan, build_features
from app.ml.forecasting import generate_forecast
from app.database.session import SessionLocal
from app.database.models import ModelRecord
from tests.helpers import train_and_wait

ALL_MODELS = ["naive", "seasonal_naive", "seasonal_naive_weekly", "moving_average", "arima", "sarima",
              "linear_regression", "random_forest", "xgboost"]


def _models(run):
    return {m["model_name"]: m for m in run["models"]}


def _publish(client, headers, model_id):
    return client.post(f"/api/admin/models/{model_id}/publish", headers=headers)


@pytest.fixture
def naive_run(client, admin_headers, processed_dataset):
    return processed_dataset, train_and_wait(client, admin_headers, processed_dataset["id"], ["naive", "moving_average"])


def test_publish_lifecycle_and_dataset_guards(client, admin_headers, user_headers, naive_run):
    ds, run = naive_run
    ids = {n: m["id"] for n, m in _models(run).items()}

    assert _publish(client, user_headers, ids["naive"]).status_code == 403
    assert _publish(client, admin_headers, 99999).status_code == 404

    r = _publish(client, admin_headers, ids["naive"])
    assert r.status_code == 200 and r.json()["status"] == "published"
    assert client.get(f"/api/admin/datasets/{ds['id']}", headers=admin_headers).json()["status"] == "published"
    assert _publish(client, admin_headers, ids["naive"]).status_code == 200  # idempotent

    # publishing another model replaces the first: only one published model per dataset
    assert _publish(client, admin_headers, ids["moving_average"]).status_code == 200
    comp = client.get(f"/api/admin/models/{ds['id']}", headers=admin_headers).json()
    status = {m["model_name"]: m["status"] for m in comp["latest_models"]}
    assert status == {"naive": "trained", "moving_average": "published"}
    assert comp["published_model"]["model_name"] == "moving_average"

    # users now see the dataset, with its published model's held-out metrics
    listed = client.get("/api/datasets", headers=user_headers).json()
    assert [d["id"] for d in listed] == [ds["id"]] and listed[0]["published_model"]["model_name"] == "moving_average"
    assert listed[0]["published_model"]["test_metrics"]["mae"] > 0
    assert "file_path" not in listed[0] and "original_filename" not in listed[0]

    # a published dataset cannot be reconfigured, re-validated, re-processed or deleted underneath its model
    base = {"timestamp_columns": ["Date", "Time"], "target_column": "Global_active_power"}
    assert client.put(f"/api/admin/datasets/{ds['id']}", headers=admin_headers, json=base).status_code == 409
    for action in ("validate", "process"):
        assert client.post(f"/api/admin/datasets/{ds['id']}/{action}", headers=admin_headers).status_code == 409
    assert client.delete(f"/api/admin/datasets/{ds['id']}", headers=admin_headers).status_code == 409
    # ...but new models can still be trained while one is published
    assert train_and_wait(client, admin_headers, ds["id"], ["naive"])["version"] == 2

    # unpublish returns the dataset to admins only
    assert client.post(f"/api/admin/datasets/{ds['id']}/unpublish", headers=user_headers).status_code == 403
    r = client.post(f"/api/admin/datasets/{ds['id']}/unpublish", headers=admin_headers)
    assert r.status_code == 200 and r.json()["status"] == "processed"
    assert client.post(f"/api/admin/datasets/{ds['id']}/unpublish", headers=admin_headers).status_code == 409
    assert client.get("/api/datasets", headers=user_headers).json() == []
    assert client.post("/api/forecast", headers=user_headers, json={"dataset_id": ds["id"], "horizon": 24}).status_code == 409
    assert client.get(f"/api/datasets/{ds['id']}/forecast-info", headers=user_headers).status_code == 409


def test_cannot_publish_a_missing_artifact(client, admin_headers, naive_run):
    ds, run = naive_run
    model = _models(run)["naive"]
    with SessionLocal() as db:
        path = db.get(ModelRecord, model["id"]).artifact_path
    import os
    os.remove(path)
    r = _publish(client, admin_headers, model["id"])
    assert r.status_code == 409 and "missing" in r.json()["detail"]
    assert client.get(f"/api/admin/datasets/{ds['id']}", headers=admin_headers).json()["status"] == "processed"


def test_forecast_info_and_request_validation(client, admin_headers, user_headers, naive_run):
    ds, run = naive_run
    assert _publish(client, admin_headers, _models(run)["naive"]["id"]).status_code == 200
    info = client.get(f"/api/datasets/{ds['id']}/forecast-info", headers=user_headers).json()
    assert info["horizon"] == {"max_steps": 24, "step_minutes": 60}
    assert info["model"]["name"] == "naive" and info["model"]["metrics"]["test"]["mae"] > 0
    assert info["features"]["uses_features"] is False and info["features"]["groups"] == []
    assert info["backtest"]["min_origin"] < info["backtest"]["max_origin"] <= info["data"]["last_observation"]
    assert "file_path" not in str(info) and "artifact_path" not in str(info)

    post = lambda body, h=user_headers: client.post("/api/forecast", headers=h, json={"dataset_id": ds["id"], **body})
    assert client.post("/api/forecast", json={"dataset_id": ds["id"], "horizon": 24}).status_code == 401
    assert post({"horizon": 0}).status_code == 422
    assert post({"horizon": 25}).status_code == 422 and "1 and 24" in post({"horizon": 25}).json()["detail"]
    assert client.post("/api/forecast", headers=user_headers, json={"dataset_id": 9999, "horizon": 24}).status_code == 404
    assert post({"horizon": 24, "origin": "2010-01-01T00:00:00Z"}).status_code == 422          # timezone rejected
    assert post({"horizon": 24, "origin": info["data"]["start"].replace(" ", "T")}).status_code == 422  # in the training period
    assert post({"horizon": 24, "origin": info["backtest"]["max_origin"].replace(" ", "T")[:-3] + ":30"}).status_code == 422  # off-grid
    assert post({"horizon": 24, "origin": info["data"]["last_observation"].replace(" ", "T")}).status_code == 422  # no actuals after it


def test_forecast_history_is_private_but_visible_to_admin(client, admin_headers, user_headers, second_user_headers, naive_run):
    ds, run = naive_run
    assert _publish(client, admin_headers, _models(run)["naive"]["id"]).status_code == 200
    made = client.post("/api/forecast", headers=user_headers, json={"dataset_id": ds["id"], "horizon": 12})
    assert made.status_code == 201, made.text
    fid = made.json()["id"]

    assert [f["id"] for f in client.get("/api/forecasts", headers=user_headers).json()] == [fid]
    assert client.get("/api/forecasts", headers=second_user_headers).json() == []
    assert client.get(f"/api/forecasts/{fid}", headers=second_user_headers).status_code == 404
    assert client.get(f"/api/forecasts/{fid}", headers=user_headers).status_code == 200
    admin_view = client.get("/api/forecasts", headers=admin_headers).json()
    assert admin_view[0]["user_email"] == "user@example.com"
    assert "user_email" not in {k for k, v in client.get("/api/forecasts", headers=user_headers).json()[0].items() if v}
    assert client.get(f"/api/forecasts/{fid}", headers=admin_headers).status_code == 200
    assert client.get("/api/forecasts?limit=0", headers=user_headers).status_code == 422


def test_forecast_every_model_kind_end_to_end(client, admin_headers, user_headers, processed_dataset):
    ds = processed_dataset
    run = train_and_wait(client, admin_headers, ds["id"])
    models = _models(run)
    assert set(models) == set(ALL_MODELS)
    settings = get_settings()
    frame = load_processed(settings.processed_dir / f"dataset_{ds['id']}.parquet")
    target = "Global_active_power"

    for name in ALL_MODELS:
        assert _publish(client, admin_headers, models[name]["id"]).status_code == 200, name
        info = client.get(f"/api/datasets/{ds['id']}/forecast-info", headers=user_headers).json()
        assert info["model"]["name"] == name

        # forecast from the latest data: the future, no actuals
        r = client.post("/api/forecast", headers=user_headers, json={"dataset_id": ds["id"], "horizon": 24})
        assert r.status_code == 201, (name, r.text)
        f = r.json()
        stamps = pd.to_datetime([v["timestamp"] for v in f["values"]])
        last_obs = pd.Timestamp(info["data"]["last_observation"])
        assert len(stamps) == 24 and stamps[0] == last_obs + pd.Timedelta(hours=1)
        assert (np.diff(stamps.values) == np.timedelta64(1, "h")).all()
        preds = np.array([v["predicted"] for v in f["values"]])
        assert np.isfinite(preds).all() and preds.min() > -1 and preds.max() < 15, (name, preds)
        assert f["is_backtest"] is False and f["metrics"] is None and all(v["actual"] is None for v in f["values"])
        assert len(f["history"]) == 168 and pd.Timestamp(f["history"][-1]["timestamp"]) == last_obs

        # backtest inside the held-out test period: real actuals and metrics
        origin = pd.Timestamp(info["backtest"]["min_origin"]) + pd.Timedelta(days=5, hours=23)
        origin = origin.normalize() + pd.Timedelta(hours=23)
        r = client.post("/api/forecast", headers=user_headers,
                        json={"dataset_id": ds["id"], "horizon": 24, "origin": origin.isoformat()})
        assert r.status_code == 201, (name, r.text)
        b = r.json()
        assert b["is_backtest"] is True and pd.Timestamp(b["origin"]) == origin
        assert b["metrics"]["n"] >= 20 and b["metrics"]["mae"] > 0 and b["metrics"]["rmse"] >= b["metrics"]["mae"]
        actual = frame[target].reindex(pd.to_datetime([v["timestamp"] for v in b["values"]]))
        got = np.array([np.nan if v["actual"] is None else v["actual"] for v in b["values"]])
        assert np.allclose(got, actual.to_numpy(), equal_nan=True)  # actuals are the real observations

        # stored forecast is retrievable and identical
        again = client.get(f"/api/forecasts/{b['id']}", headers=user_headers).json()
        assert again["values"] == b["values"] and again["metrics"] == b["metrics"]

        # leakage check on the saved artifact: corrupting all data after the origin changes nothing
        with SessionLocal() as db:
            path = db.get(ModelRecord, models[name]["id"]).artifact_path
        bundle = joblib.load(path)
        clean = generate_forecast(bundle, frame, 24, origin).predictions
        tampered = frame.copy()
        num = [c for c in tampered.columns if tampered[c].dtype.kind == "f"]
        tampered.loc[tampered.index > origin, num] = 1e6
        assert np.allclose(clean.values, generate_forecast(bundle, tampered, 24, origin).predictions.values), name
        assert np.allclose(clean.values, [v["predicted"] for v in b["values"]]), name

        if bundle["artifact"]["kind"] in ("sklearn", "xgboost"):  # same features as at training time
            plan = FeaturePlan.from_dict(bundle["feature_plan"])
            X = build_features(frame, target, plan)[bundle["feature_columns"]]
            direct = bundle["artifact"]["estimator"].predict(X.loc[clean.index])
            assert np.allclose(direct, clean.values), name

    listed = client.get("/api/forecasts", headers=user_headers).json()
    assert len(listed) == 2 * len(ALL_MODELS)
    assert sum(1 for x in listed if x["is_backtest"]) == len(ALL_MODELS)
