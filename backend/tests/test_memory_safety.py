"""Regression tests for the free-tier memory fixes (512 MB instance).

The streaming validator / preprocessor must give exactly the results of reading the whole file at once; the
memory-light SARIMA walk-forward must give exactly statsmodels' own `extend()` forecasts; and the full real dataset
must validate inside a hard memory ceiling.
"""
import gzip
import hashlib
import subprocess
import sys
import textwrap
import threading
import time
from pathlib import Path

import numpy as np
import pandas as pd
import pytest

from app.data import loader
from app.data.loader import read_csv_frame, sniff_csv
from app.data.preprocessing import _stream_to_modeling_grid, preprocess_dataset, resample_to_modeling_grid
from app.data.profile import build_profile
from app.data.timestamps import parse_timestamps
from app.data.validator import validate_dataset
from app.database.models import Dataset, DatasetStatus, FileObject
from app.database.session import SessionLocal
from tests.conftest import HOUSEHOLD_CSV
from tests.helpers import train_and_wait

EXOG = ["Global_reactive_power", "Voltage", "Global_intensity", "Sub_metering_1", "Sub_metering_2", "Sub_metering_3"]


def _config(path: Path) -> dict:
    meta = sniff_csv(path)
    cfg = dict(build_profile(path, meta, ["?"])["suggested_config"])
    cfg["csv_meta"] = meta.to_dict()
    return cfg


# ---- streaming == whole-file --------------------------------------------------------------------------------
def test_validation_report_does_not_depend_on_chunk_size(household_slice, monkeypatch):
    cfg = _config(household_slice)
    monkeypatch.setattr(loader, "CHUNK_ROWS", 50_000)
    big = validate_dataset(household_slice, cfg)
    monkeypatch.setattr(loader, "CHUNK_ROWS", 7_001)      # many boundaries, none aligned to anything in the data
    small = validate_dataset(household_slice, cfg)
    assert big["passed"] and big == small


def test_preprocessing_does_not_depend_on_chunk_size(household_slice, monkeypatch):
    cfg = _config(household_slice)
    cfg["derived"] = validate_dataset(household_slice, cfg)["derived"]
    monkeypatch.setattr(loader, "CHUNK_ROWS", 50_000)
    f1, r1 = preprocess_dataset(household_slice, cfg)
    monkeypatch.setattr(loader, "CHUNK_ROWS", 7_001)
    f2, r2 = preprocess_dataset(household_slice, cfg)
    pd.testing.assert_frame_equal(f1, f2, check_freq=False)
    assert r1 == r2


@pytest.mark.parametrize("modeling_minutes", [60, 15])
def test_streaming_preprocess_equals_whole_file_pandas(household_slice, monkeypatch, modeling_minutes):
    """Reference = read everything into one DataFrame and use pandas' own resample (the previous implementation)."""
    cfg = _config(household_slice)
    columns = ["Global_active_power"] + EXOG
    df = read_csv_frame(household_slice, sniff_csv(household_slice))
    ts, _ = parse_timestamps(df, ["Date", "Time"], cfg["datetime_format"])
    ref = pd.DataFrame({c: pd.to_numeric(df[c], errors="coerce").astype("float64") for c in columns})
    ref.index = pd.DatetimeIndex(ts.to_numpy(), name="timestamp")
    ref = resample_to_modeling_grid(ref.sort_index(), 1, modeling_minutes, 0.5)

    monkeypatch.setattr(loader, "CHUNK_ROWS", 9_000)
    got, rows, bad_ts, was_sorted, dups = _stream_to_modeling_grid(
        household_slice, cfg, {"datetime_format": cfg["datetime_format"]}, columns, 1, modeling_minutes, 0.5
    )
    assert rows == len(df) and bad_ts == 0 and was_sorted and dups == 0
    pd.testing.assert_frame_equal(got, ref, check_freq=False, rtol=1e-12)


def test_duplicate_timestamps_straddling_a_chunk_boundary_are_averaged(tmp_path, monkeypatch):
    """Structure test on a tiny hand-written file: the duplicated minute sits exactly on a chunk boundary."""
    idx = pd.date_range("2020-01-01 00:00", periods=300, freq="min")
    df = pd.DataFrame({"ts": idx.strftime("%Y-%m-%d %H:%M:%S"), "kw": np.arange(300, dtype=float)})
    dup = df.iloc[[99]].copy(); dup["kw"] = 1000.0            # row 99 (timestamp 01:39) appears twice, with different values
    df = pd.concat([df.iloc[:100], dup, df.iloc[100:]], ignore_index=True)
    path = tmp_path / "dup.csv"; df.to_csv(path, index=False)
    cfg = {"csv_meta": sniff_csv(path).to_dict(), "timestamp_columns": ["ts"], "target_column": "kw", "exogenous_columns": []}
    monkeypatch.setattr(loader, "CHUNK_ROWS", 100)             # chunk 1 = rows 0..99, so the duplicate pair is split across chunks
    for modeling in (1, 60):
        got, rows, _, _, dups = _stream_to_modeling_grid(path, cfg, {"datetime_format": "ISO8601"}, ["kw"], 1, modeling, 0.0)
        ref = df.groupby("ts", sort=True)["kw"].mean()
        ref.index = pd.DatetimeIndex(ref.index)
        ref = ref if modeling == 1 else ref.resample("1h").mean()
        assert dups == 1 and rows == 301
        np.testing.assert_allclose(got["kw"].to_numpy(), ref.to_numpy(), rtol=1e-12)


# ---- memory ceiling ----------------------------------------------------------------------------------------
@pytest.mark.skipif(not HOUSEHOLD_CSV.exists() or not Path("/proc/self/status").exists(), reason="needs the full real household CSV and Linux /proc")
def test_full_real_file_validates_and_processes_within_a_memory_ceiling():
    """The 135 MB / 2M-row file used to need ~830 MB. Run in a fresh process and bound the peak resident memory."""
    code = textwrap.dedent(f"""
        import sys
        from pathlib import Path

        def peak_mb():  # this process's own high-water mark (ru_maxrss would inherit the much larger pytest parent's)
            return int([l for l in open("/proc/self/status") if l.startswith("VmHWM:")][0].split()[1]) // 1024

        from app.data.loader import sniff_csv
        from app.data.profile import build_profile
        from app.data.validator import validate_dataset
        from app.data.preprocessing import preprocess_dataset
        p = Path(r"{HOUSEHOLD_CSV}"); m = sniff_csv(p)
        cfg = dict(build_profile(p, m, ["?"])["suggested_config"]); cfg["csv_meta"] = m.to_dict()
        rep = validate_dataset(p, cfg); assert rep["passed"], rep["errors"]
        peak_validate = peak_mb()
        cfg["derived"] = rep["derived"]
        frame, pre = preprocess_dataset(p, cfg); assert len(frame) > 30000
        print(peak_validate, peak_mb())
    """)
    out = subprocess.run([sys.executable, "-c", code], capture_output=True, text=True, cwd=Path(__file__).resolve().parents[1])
    assert out.returncode == 0, out.stderr[-600:]
    peak_validate, peak_all = map(int, out.stdout.split())
    assert peak_validate < 330 and peak_all < 330, (peak_validate, peak_all)   # was ~830 MB


# ---- SARIMA: light walk-forward == statsmodels extend() ------------------------------------------------------
@pytest.mark.parametrize("order,seasonal,trend", [((1, 0, 1), (0, 1, 1, 24), None), ((2, 0, 1), (0, 0, 0, 0), "c")])
def test_light_walk_forward_matches_extend_exactly(processed_dataset, order, seasonal, trend):
    from statsmodels.tsa.statespace.sarimax import SARIMAX
    from app.config import get_settings
    from app.data.preprocessing import load_processed
    from app.ml.classical import light_walk_forward

    frame = load_processed(Path(processed_dataset["processed_path"]) if processed_dataset.get("processed_path") else get_settings().processed_dir / f"dataset_{processed_dataset['id']}.parquet")
    y = frame["Global_active_power"].to_numpy(dtype="float64")
    train, ev, h = y[-1400:-480], y[-480:].copy(), 24
    ev[30:36] = np.nan; ev[200] = np.nan                      # outages inside the evaluation span

    mk = lambda: SARIMAX(train, order=order, seasonal_order=seasonal, trend=trend, enforce_stationarity=False, enforce_invertibility=False)
    fitted = mk().fit(disp=False, maxiter=60, low_memory=True)        # the memory-light estimation path
    light = light_walk_forward(order, seasonal, trend, fitted.params, train, ev, h)

    full = mk().fit(disp=False, maxiter=60)                           # statsmodels' own, full-memory path
    assert np.allclose(full.params, fitted.params, rtol=1e-6, atol=1e-8) and np.isclose(full.aic, fitted.aic)
    cur, ref = full, []
    for s in range(0, len(ev), h):
        ref.append(np.asarray(cur.forecast(min(h, len(ev) - s))))
        if s + h < len(ev):
            cur = cur.extend(ev[s:s + h])
    np.testing.assert_allclose(light, np.concatenate(ref), atol=1e-8)


# ---- database file storage -----------------------------------------------------------------------------------
def _sha(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def test_storage_round_trip_is_compressed_chunked_and_exact(client, household_slice, tmp_path, monkeypatch):
    from app.services import storage
    monkeypatch.setattr(storage, "WRITE_SLICE", 1024 * 1024)       # force many append slices
    monkeypatch.setattr(storage, "READ_SLICE", 512 * 1024)         # and many read slices
    with SessionLocal() as db:
        storage.upload_file_to_db(db, "datasets", household_slice, "slice.csv")
        stored = db.scalar(__import__("sqlalchemy").text("select octet_length(data) from file_objects where file_name='slice.csv'"))
        assert stored < household_slice.stat().st_size / 3          # gzip-compressed CSV is several times smaller
        out = tmp_path / "back.csv"
        storage.download_file_from_db(db, "datasets", "slice.csv", out)
    assert _sha(out) == _sha(household_slice)
    assert not list(tmp_path.glob("*.part")) and not list(household_slice.parent.glob("*.gz.tmp"))


def test_storage_reads_legacy_uncompressed_rows_and_keeps_non_csv_files_raw(client, tmp_path):
    from app.services import storage
    legacy = b"a;b\n1;2\n3;4\n" * 1000
    with SessionLocal() as db:
        db.add(FileObject(bucket_name="datasets", file_name="legacy.csv", data=legacy)); db.commit()     # as stored by the old version
        storage.download_file_from_db(db, "datasets", "legacy.csv", tmp_path / "legacy.csv")
        blob = tmp_path / "model.joblib"; blob.write_bytes(b"\x1f\x8b-not-really-gzip-but-starts-like-it" + bytes(range(256)) * 10)
        storage.upload_file_to_db(db, "models", blob, "model.joblib")
        storage.download_file_from_db(db, "models", "model.joblib", tmp_path / "model_back.joblib")
    assert (tmp_path / "legacy.csv").read_bytes() == legacy
    assert (tmp_path / "model_back.joblib").read_bytes() == blob.read_bytes()   # non-CSV files are never re-encoded


def test_storage_replaces_and_deletes(client, tmp_path):
    from app.services import storage
    f = tmp_path / "x.csv"
    with SessionLocal() as db:
        f.write_text("a,b\n1,2\n"); storage.upload_file_to_db(db, "datasets", f, "x.csv")
        f.write_text("a,b\n9,9\n9,9\n"); storage.upload_file_to_db(db, "datasets", f, "x.csv")        # replace in place
        storage.download_file_from_db(db, "datasets", "x.csv", tmp_path / "x_back.csv")
        assert (tmp_path / "x_back.csv").read_text() == "a,b\n9,9\n9,9\n"
        assert db.scalar(__import__("sqlalchemy").text("select count(*) from file_objects where file_name='x.csv'")) == 1
        storage.delete_file_from_db(db, "datasets", "x.csv")
        assert db.scalar(__import__("sqlalchemy").text("select count(*) from file_objects where file_name='x.csv'")) == 0


# ---- crash recovery & job discipline --------------------------------------------------------------------------
def test_datasets_stuck_after_a_crash_are_recovered_on_startup(client):
    from app.services.dataset_service import recover_interrupted_jobs
    base = dict(name="d", energy_type="e", original_filename="f.csv", file_path="/x", file_size_bytes=1, sha256="0" * 64)
    with SessionLocal() as db:
        db.add_all([
            Dataset(**base, status=DatasetStatus.VALIDATING, config={"timestamp_columns": ["Date"]}),
            Dataset(**base, status=DatasetStatus.VALIDATING, config={}),
            Dataset(**base, status=DatasetStatus.PROCESSING, config={}),
            Dataset(**base, status=DatasetStatus.PROCESSED, config={}),
        ]); db.commit()
    assert recover_interrupted_jobs() == 3
    with SessionLocal() as db:
        got = [d.status for d in db.query(Dataset).order_by(Dataset.id)]
        assert got == [DatasetStatus.CONFIGURED, DatasetStatus.UPLOADED, DatasetStatus.VALIDATED, DatasetStatus.PROCESSED]
        assert "Interrupted" in db.query(Dataset).order_by(Dataset.id).first().validation_report["errors"][0]["message"]


def test_heavy_jobs_never_overlap():
    from app.utils.resources import heavy_job
    running, peak = [0], [0]
    def job():
        with heavy_job("t"):
            running[0] += 1; peak[0] = max(peak[0], running[0]); time.sleep(0.05); running[0] -= 1
    threads = [threading.Thread(target=job) for _ in range(6)]
    [t.start() for t in threads]; [t.join() for t in threads]
    assert peak[0] == 1


def test_validate_and_process_on_a_published_dataset_are_refused_and_do_not_change_its_state(client, admin_headers, processed_dataset):
    ds = processed_dataset
    run = train_and_wait(client, admin_headers, ds["id"], ["naive"])
    mid = run["models"][0]["id"]
    assert client.post(f"/api/admin/models/{mid}/publish", headers=admin_headers).status_code == 200
    for action in ("validate", "process"):
        assert client.post(f"/api/admin/datasets/{ds['id']}/{action}", headers=admin_headers).status_code == 409
    assert client.get(f"/api/admin/datasets/{ds['id']}", headers=admin_headers).json()["status"] == "published"   # untouched


def test_processing_an_unvalidated_dataset_is_refused_immediately(client, admin_headers, household_slice):
    from tests.helpers import upload_csv
    d = upload_csv(client, admin_headers, household_slice).json()
    r = client.post(f"/api/admin/datasets/{d['id']}/process", headers=admin_headers)
    assert r.status_code == 409 and "validate" in r.json()["detail"].lower()
    assert client.get(f"/api/admin/datasets/{d['id']}", headers=admin_headers).json()["status"] == "uploaded"
