"""FastAPI dependencies enforcing authentication and role checks on the server."""
from __future__ import annotations

import jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

from app.auth.security import decode_access_token
from app.database.models import ROLE_ADMIN, User
from app.database.session import get_db

_bearer = HTTPBearer(auto_error=False)


def _unauthorized(detail: str) -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail=detail,
        headers={"WWW-Authenticate": "Bearer"},
    )


def get_current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(_bearer),
    db: Session = Depends(get_db),
) -> User:
    if credentials is None:
        raise _unauthorized("Authentication required.")
    try:
        user_id = decode_access_token(credentials.credentials)
    except jwt.ExpiredSignatureError:
        raise _unauthorized("Token expired. Please sign in again.")
    except (jwt.PyJWTError, ValueError):
        raise _unauthorized("Invalid authentication token.")
    user = db.get(User, user_id)
    if user is None:
        raise _unauthorized("Invalid authentication token.")
    return user


def require_admin(user: User = Depends(get_current_user)) -> User:
    if user.role != ROLE_ADMIN:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Administrator access required.")
    return user
