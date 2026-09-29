"""Create an administrator account (admins cannot self-register).

    python -m app.scripts.create_admin --name "Admin" --email admin@example.com
"""
from __future__ import annotations

import argparse
import getpass
import sys

from email_validator import EmailNotValidError, validate_email
from sqlalchemy import select

from app.auth.security import MAX_PASSWORD_BYTES, hash_password
from app.database import models as _orm  # noqa: F401
from app.database.base import Base
from app.database.models import ROLE_ADMIN, User
from app.database.session import SessionLocal, engine


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--name", required=True)
    parser.add_argument("--email", required=True)
    parser.add_argument("--password", help="Omit to be prompted (recommended; avoids shell history).")
    args = parser.parse_args()

    password = args.password or getpass.getpass("Password (min 8 chars): ")
    if len(password) < 8 or len(password.encode()) > MAX_PASSWORD_BYTES:
        print(f"Password must be 8-{MAX_PASSWORD_BYTES} bytes.", file=sys.stderr)
        return 1

    try:  # same validation the login endpoint applies, so an admin can never be created that cannot sign in
        email = validate_email(args.email.strip(), check_deliverability=False).normalized.lower()
    except EmailNotValidError as exc:
        print(f"Invalid email: {exc}", file=sys.stderr)
        return 1

    Base.metadata.create_all(engine)
    with SessionLocal() as db:
        existing = db.scalar(select(User).where(User.email == email))
        if existing:
            print(f"A user with email {email} already exists (role: {existing.role}).", file=sys.stderr)
            return 1
        db.add(User(name=args.name.strip(), email=email, password_hash=hash_password(password), role=ROLE_ADMIN))
        db.commit()
    print(f"Admin '{email}' created.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
