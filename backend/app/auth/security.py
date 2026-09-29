"""Password hashing (bcrypt) and JWT helpers."""
from __future__ import annotations

from datetime import datetime, timedelta, timezone

import bcrypt
import jwt

from app.config import get_settings

MAX_PASSWORD_BYTES = 72  # bcrypt limit; longer inputs are rejected by the schema layer
_DUMMY_HASH = bcrypt.hashpw(b"dummy-password-for-timing", bcrypt.gensalt())


def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("ascii")


def verify_password(password: str, password_hash: str | None) -> bool:
    """Constant-work check: hashes against a dummy when the user does not exist."""
    target = password_hash.encode("ascii") if password_hash else _DUMMY_HASH
    try:
        ok = bcrypt.checkpw(password.encode("utf-8"), target)
    except ValueError:
        return False
    return ok and password_hash is not None


def create_access_token(user_id: int) -> str:
    settings = get_settings()
    now = datetime.now(timezone.utc)
    payload = {
        "sub": str(user_id),
        "iat": now,
        "exp": now + timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES),
    }
    return jwt.encode(payload, settings.JWT_SECRET, algorithm=settings.JWT_ALGORITHM)


def decode_access_token(token: str) -> int:
    """Return the user id, or raise jwt.PyJWTError / ValueError."""
    settings = get_settings()
    payload = jwt.decode(
        token,
        settings.JWT_SECRET,
        algorithms=[settings.JWT_ALGORITHM],
        options={"require": ["exp", "sub"]},
    )
    return int(payload["sub"])
