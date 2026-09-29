def test_register_login_me(client):
    r = client.post("/api/auth/register", json={"name": "Una", "email": "Una@Example.com", "password": "password123"})
    assert r.status_code == 201 and r.json()["role"] == "user" and r.json()["email"] == "una@example.com"
    assert "password" not in r.text
    tok = client.post("/api/auth/login", json={"email": "una@example.com", "password": "password123"}).json()["access_token"]
    me = client.get("/api/auth/me", headers={"Authorization": f"Bearer {tok}"})
    assert me.status_code == 200 and me.json()["email"] == "una@example.com"


def test_register_cannot_create_admin_and_rejects_duplicates(client):
    body = {"name": "X", "email": "x@example.com", "password": "password123", "role": "admin"}
    assert client.post("/api/auth/register", json=body).json()["role"] == "user"
    assert client.post("/api/auth/register", json=body).status_code == 409


def test_bad_credentials_and_weak_passwords(client, user_headers):
    assert client.post("/api/auth/login", json={"email": "user@example.com", "password": "wrong-password"}).status_code == 401
    assert client.post("/api/auth/login", json={"email": "nobody@example.com", "password": "whatever123"}).status_code == 401
    assert client.post("/api/auth/register", json={"name": "A", "email": "a@example.com", "password": "short"}).status_code == 422
    assert client.post("/api/auth/register", json={"name": "A", "email": "a@example.com", "password": "x" * 80}).status_code == 422


def test_401_without_or_with_bad_token(client):
    assert client.get("/api/auth/me").status_code == 401
    assert client.get("/api/auth/me", headers={"Authorization": "Bearer not-a-token"}).status_code == 401
    assert client.get("/api/admin/datasets").status_code == 401


def test_expired_token_returns_401(client, user_headers):
    import jwt
    from app.config import get_settings
    from datetime import datetime, timedelta, timezone
    s = get_settings()
    expired = jwt.encode({"sub": "1", "exp": datetime.now(timezone.utc) - timedelta(minutes=1)}, s.JWT_SECRET, algorithm=s.JWT_ALGORITHM)
    r = client.get("/api/auth/me", headers={"Authorization": f"Bearer {expired}"})
    assert r.status_code == 401 and "expired" in r.json()["detail"].lower()


def test_normal_user_gets_403_on_every_admin_endpoint(client, user_headers):
    calls = [
        ("get", "/api/admin/datasets"), ("post", "/api/admin/datasets"), ("get", "/api/admin/datasets/1"),
        ("put", "/api/admin/datasets/1"), ("delete", "/api/admin/datasets/1"), ("post", "/api/admin/datasets/1/validate"),
        ("post", "/api/admin/datasets/1/process"), ("post", "/api/admin/models/train"), ("get", "/api/admin/models/1"),
        ("get", "/api/admin/training-runs/1"), ("get", "/api/admin/overview"),
    ]
    for method, url in calls:
        assert getattr(client, method)(url, headers=user_headers).status_code == 403, (method, url)


def test_user_sees_no_unpublished_datasets(client, admin_headers, user_headers):
    assert client.get("/api/datasets", headers=user_headers).json() == []
    assert client.get("/api/datasets", headers=admin_headers).status_code == 200
