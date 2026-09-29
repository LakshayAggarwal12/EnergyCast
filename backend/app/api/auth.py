from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.auth.deps import get_current_user
from app.auth.security import create_access_token, hash_password, verify_password
from app.database.models import ROLE_USER, User
from app.database.session import get_db
from app.schemas.auth import LoginRequest, RegisterRequest, TokenResponse, UserOut

router = APIRouter(prefix="/api/auth", tags=["auth"])


@router.post("/register", response_model=UserOut, status_code=status.HTTP_201_CREATED)
def register(body: RegisterRequest, db: Session = Depends(get_db)) -> User:
    """Creates a normal user. Admin accounts are only created through the controlled CLI script."""
    email = body.email.lower()
    if db.scalar(select(User.id).where(User.email == email)):
        raise HTTPException(status.HTTP_409_CONFLICT, "An account with this email already exists.")
    user = User(name=body.name.strip(), email=email, password_hash=hash_password(body.password), role=ROLE_USER)
    db.add(user)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(status.HTTP_409_CONFLICT, "An account with this email already exists.")
    db.refresh(user)
    return user


@router.post("/login", response_model=TokenResponse)
def login(body: LoginRequest, db: Session = Depends(get_db)) -> TokenResponse:
    user = db.scalar(select(User).where(User.email == body.email.lower()))
    if not verify_password(body.password, user.password_hash if user else None):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Incorrect email or password.", headers={"WWW-Authenticate": "Bearer"})
    return TokenResponse(access_token=create_access_token(user.id), user=UserOut.model_validate(user))


@router.get("/me", response_model=UserOut)
def me(user: User = Depends(get_current_user)) -> User:
    return user
