"""User accounts: password hashing (scrypt), JWT tokens, and users-table access.

The users table is intentionally decoupled from seed.py (which fully rebuilds
the venues table) — it is created idempotently at app startup instead.
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
from psycopg import errors as pg_errors

from . import db

# backend/.env (placed next to requirements.txt) — same pattern as db.py
load_dotenv(Path(__file__).resolve().parent.parent / ".env")

# 默认值 32+ 字节以满足 HS256 建议长度；生产必须改 .env
_DEFAULT_SECRET = "dev-secret-change-me-0123456789abcdef"
JWT_SECRET = os.environ.get("JWT_SECRET", _DEFAULT_SECRET)
JWT_ALGORITHM = "HS256"
TOKEN_DAYS_REMEMBERED = 30
TOKEN_DAYS_SESSION = 1

if JWT_SECRET == _DEFAULT_SECRET:
    logging.getLogger("uvicorn.error").warning(
        "JWT_SECRET not set in .env - using insecure default, tokens are "
        "forgeable. Set a random string for anything beyond local demo."
    )

# scrypt 参数随哈希串一起存储，未来调整无需迁移旧数据
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


def create_token(user_id: int, username: str, remember: bool) -> str:
    days = TOKEN_DAYS_REMEMBERED if remember else TOKEN_DAYS_SESSION
    now = datetime.now(timezone.utc)
    payload = {
        "sub": str(user_id),  # JWT 规范要求 sub 为字符串
        "username": username,
        "iat": now,
        "exp": now + timedelta(days=days),
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)


def decode_token(token: str) -> int | None:
    """Return the user id, or None for any invalid/expired token."""
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        return int(payload["sub"])
    except (jwt.PyJWTError, KeyError, TypeError, ValueError):
        return None


def ensure_users_table() -> None:
    with db.pool.connection() as conn:
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS users (
                id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
                username text NOT NULL UNIQUE,
                email text NOT NULL UNIQUE,
                password_hash text NOT NULL,
                created_at timestamptz NOT NULL DEFAULT now()
            )
            """
        )


def _user_dict(row) -> dict:
    return {"id": row[0], "username": row[1], "email": row[2]}


def create_user(
    username: str, email: str, password_hash: str
) -> tuple[dict | None, str | None]:
    """Insert a user; on conflict return (None, "username" | "email").

    Pre-checks give a friendly field-specific message; the UniqueViolation
    catch below covers the race window between check and insert.
    """
    with db.pool.connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT 1 FROM users WHERE username = %s", (username,)
            )
            if cur.fetchone() is not None:
                return None, "username"
            cur.execute(
                "SELECT 1 FROM users WHERE email = %s", (email.lower(),)
            )
            if cur.fetchone() is not None:
                return None, "email"
            try:
                cur.execute(
                    "INSERT INTO users (username, email, password_hash) "
                    "VALUES (%s, %s, %s) RETURNING id, username, email",
                    (username, email.lower(), password_hash),
                )
                return _user_dict(cur.fetchone()), None
            except pg_errors.UniqueViolation as exc:
                # 依据被违反的约束名定位字段（users_username_key / users_email_key）
                constraint = exc.diag.constraint_name or ""
                field = "email" if "email" in constraint else "username"
                return None, field


def authenticate(email: str, password: str) -> dict | None:
    """Verify the password against the stored hash; return public fields or None.

    Caller treats "no such user" and "wrong password" identically (anti-enumeration).
    """
    with db.pool.connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT id, username, email, password_hash FROM users "
                "WHERE email = %s",
                (email.lower(),),
            )
            row = cur.fetchone()
    if row is None or not verify_password(password, row[3]):
        return None
    return _user_dict(row)


def get_user_by_id(user_id: int) -> dict | None:
    with db.pool.connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT id, username, email FROM users WHERE id = %s",
                (user_id,),
            )
            row = cur.fetchone()
    return _user_dict(row) if row else None
