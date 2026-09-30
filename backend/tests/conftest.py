"""Test setup. Uses a dedicated PostgreSQL database (must have 'test' in its name) and temp storage dirs.
Integration tests run on slices of the *real* dataset files; set the paths below if they live elsewhere."""
import os
import tempfile
from pathlib import Path

_TMP = tempfile.mkdtemp(prefix="energicast_test_")
os.environ["DATABASE_URL"] = os.environ.get(
    "TEST_DATABASE_URL", "postgresql://energicast:energicast_dev@localhost:5432/energicast_test"
)
os.environ["JWT_SECRET"] = "test-only-secret-" + "k" * 40
os.environ["MODEL_STORAGE_PATH"] = f"{_TMP}/models"
os.environ["DATA_STORAGE_PATH"] = f"{_TMP}/data"

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402
from sqlalchemy import text  # noqa: E402

from app.auth.security import hash_password  # noqa: E402
from app.database.models import ROLE_ADMIN, User  # noqa: E402
from app.database.session import SessionLocal, engine  # noqa: E402
from app.main import app  # noqa: E402

HOUSEHOLD_CSV = Path(os.environ.get("ENERGICAST_HOUSEHOLD_CSV", "/home/claude/data_raw/household_power_consumption_1_.csv"))
ELECTRICITY_CSV = Path(os.environ.get("ENERGICAST_ELECTRICITY_CSV", "/home/claude/data_raw/Electricity.csv"))
SLICE_ROWS = 250_000  # ~174 days of minute data


@pytest.fixture(scope="session")
def client():
    assert "test" in engine.url.database, "Refusing to run tests against a non-test database."
    with TestClient(app) as c:
        yield c


@pytest.fixture(autouse=True)
def _clean_db(client):
    with engine.begin() as conn:
        conn.execute(text("TRUNCATE users, datasets, features, training_runs, models, forecasts, forecast_values RESTART IDENTITY CASCADE"))
    yield


def _login(client, email, password):
    r = client.post("/api/auth/login", json={"email": email, "password": password})
    assert r.status_code == 200, r.text
    return {"Authorization": f"Bearer {r.json()['access_token']}"}


@pytest.fixture
def admin_headers(client):
    with SessionLocal() as db:
        db.add(User(name="Admin", email="admin@example.com", password_hash=hash_password("admin-password"), role=ROLE_ADMIN))
        db.commit()
    return _login(client, "admin@example.com", "admin-password")


@pytest.fixture
def user_headers(client):
    r = client.post("/api/auth/register", json={"name": "Una User", "email": "user@example.com", "password": "user-password"})
    assert r.status_code == 201, r.text
    return _login(client, "user@example.com", "user-password")


@pytest.fixture(scope="session")
def household_slice(tmp_path_factory) -> Path:
    if not HOUSEHOLD_CSV.exists():
        pytest.skip(f"real household CSV not found at {HOUSEHOLD_CSV}")
    out = tmp_path_factory.mktemp("real") / "household_slice.csv"
    with open(HOUSEHOLD_CSV, "rb") as src, open(out, "wb") as dst:
        for i, line in enumerate(src):
            if i > SLICE_ROWS:
                break
            dst.write(line)
    return out


@pytest.fixture(scope="session")
def electricity_csv() -> Path:
    if not ELECTRICITY_CSV.exists():
        pytest.skip(f"real Electricity CSV not found at {ELECTRICITY_CSV}")
    return ELECTRICITY_CSV


@pytest.fixture
def processed_dataset(client, admin_headers, household_slice):
    from tests.helpers import configure_from_profile, upload_csv
    up = upload_csv(client, admin_headers, household_slice)
    assert up.status_code == 201, up.text
    ds = up.json()
    assert configure_from_profile(client, admin_headers, ds["id"], ds["schema_profile"]).status_code == 200
    v = client.post(f"/api/admin/datasets/{ds['id']}/validate", headers=admin_headers)
    assert v.status_code == 200 and v.json()["status"] == "validated", v.text
    p = client.post(f"/api/admin/datasets/{ds['id']}/process", headers=admin_headers)
    assert p.status_code == 200 and p.json()["status"] == "processed", p.text
    return p.json()


@pytest.fixture
def second_user_headers(client):
    r = client.post("/api/auth/register", json={"name": "Bo User", "email": "bo@example.com", "password": "bo-password-1"})
    assert r.status_code == 201, r.text
    return _login(client, "bo@example.com", "bo-password-1")
