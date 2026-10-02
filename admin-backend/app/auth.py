"""Admin accounts: scrypt hashing (same scheme as backend), scoped JWT tokens,
and the admins-table lifecycle.

JWT secret is deliberately separate from backend's JWT_SECRET: users/admins
ids both start at 1, so a shared secret would let a public user token
authenticate here. Tokens also carry scope="admin" as defense in depth —
even an accidentally shared secret keeps user tokens out.
"""
import hashlib
import hmac
import logging
import os
import secrets
from datetime import datetime, timedelta, timezone
from pathlib import Path

import jwt
from dotenv import load_dotenv
from fastapi import HTTPException, Request

from . import db

# admin-backend/.env (placed next to requirements.txt) — same pattern as db.py
load_dotenv(Path(__file__).resolve().parent.parent / ".env")

_DEFAULT_SECRET = "dev-admin-secret-change-me-0123456789abcdef"
JWT_SECRET = os.environ.get("ADMIN_JWT_SECRET", _DEFAULT_SECRET)
JWT_ALGORITHM = "HS256"
TOKEN_HOURS = 8  # 管理后台不做「记住登录」，token 固定 8 小时

if JWT_SECRET == _DEFAULT_SECRET:
    logging.getLogger("uvicorn.error").warning(
        "ADMIN_JWT_SECRET not set in .env - using insecure default, tokens "
        "are forgeable. Set a random string for anything beyond local demo."
    )

# scrypt 参数随哈希串一起存储（与 backend/app/auth.py 相同的自描述格式，
# 两端实现一致但互相独立——不跨目录 import）
_SCRYPT_PARAMS = dict(n=16384, r=8, p=1, dklen=32)
_PARAM_STR = f"${_SCRYPT_PARAMS['n']}${_SCRYPT_PARAMS['r']}${_SCRYPT_PARAMS['p']}"


def hash_password(password: str) -> str:
    salt = secrets.token_bytes(16)
    digest = hashlib.scrypt(
        password.encode(), salt=salt, **_SCRYPT_PARAMS
    )
    return f"scrypt{_PARAM_STR}${salt.hex()}${digest.hex()}"


def verify_password(password: str, stored: str) -> bool:
    try:
        scheme, n, r, p, salt_hex, hash_hex = stored.split("$")
        if scheme != "scrypt":
            return False
        digest = hashlib.scrypt(
            password.encode(),
            salt=bytes.fromhex(salt_hex),
            n=int(n), r=int(r), p=int(p), dklen=len(bytes.fromhex(hash_hex)),
        )
        return hmac.compare_digest(digest.hex(), hash_hex)
    except (ValueError, TypeError):
        return False


def create_token(admin_id: int, email: str) -> str:
    now = datetime.now(timezone.utc)
    payload = {
        "sub": str(admin_id),  # JWT 规范要求 sub 为字符串
        "email": email,
        "scope": "admin",
        "iat": now,
        "exp": now + timedelta(hours=TOKEN_HOURS),
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)


def decode_token(token: str) -> int | None:
    """Return the admin id, or None for any invalid/expired/mis-scoped token."""
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        if payload.get("scope") != "admin":
            return None
        return int(payload["sub"])
    except (jwt.PyJWTError, KeyError, TypeError, ValueError):
        return None


def ensure_admins_table() -> None:
    with db.pool.connection() as conn:
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS admins (
                id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
                email text NOT NULL UNIQUE,
                password_hash text NOT NULL,
                created_at timestamptz NOT NULL DEFAULT now()
            )
            """
        )


def seed_default_admin() -> None:
    """Insert the default admin from .env; no-op when it already exists.

    Changing the password in .env does NOT update an existing row — reset by
    deleting the row and restarting, or via SQL.
    """
    email = os.environ.get("ADMIN_INITIAL_EMAIL", "").strip().lower()
    password = os.environ.get("ADMIN_INITIAL_PASSWORD", "")
    if not email or not password:
        logging.getLogger("uvicorn.error").warning(
            "ADMIN_INITIAL_EMAIL/PASSWORD not set - no default admin created"
        )
        return
    with db.pool.connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "INSERT INTO admins (email, password_hash) VALUES (%s, %s) "
                "ON CONFLICT (email) DO NOTHING",
                (email, hash_password(password)),
            )


def _admin_dict(row) -> dict:
    return {"id": row[0], "email": row[1]}


def authenticate(email: str, password: str) -> dict | None:
    """Verify the password against the stored hash; return public fields or None.

    Caller treats "no such admin" and "wrong password" identically
    (anti-enumeration).
    """
    with db.pool.connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT id, email, password_hash FROM admins WHERE email = %s",
                (email.lower(),),
            )
            row = cur.fetchone()
    if row is None or not verify_password(password, row[2]):
        return None
    return _admin_dict(row)


def get_admin_by_id(admin_id: int) -> dict | None:
    with db.pool.connection() as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT id, email FROM admins WHERE id = %s", (admin_id,))
            row = cur.fetchone()
    return _admin_dict(row) if row else None


def require_admin(request: Request) -> dict:
    """FastAPI dependency: Bearer token -> admins row, else 401.

    The row lookup makes a deleted admin's token fail immediately.
    """
    header = request.headers.get("authorization", "")
    scheme, _, token = header.partition(" ")
    if scheme.lower() != "bearer" or not token.strip():
        raise HTTPException(status_code=401, detail="not authenticated")
    admin_id = decode_token(token.strip())
    if admin_id is None:
        raise HTTPException(status_code=401, detail="not authenticated")
    admin = get_admin_by_id(admin_id)
    if admin is None:
        raise HTTPException(status_code=401, detail="not authenticated")
    return admin
