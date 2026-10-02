"""PostgreSQL connection pool and CRUD queries for the admin API.

Manages the same venues/users tables the public backend serves. The tables
are created idempotently at startup so the admin app also works on a fresh
database (seed.py in backend/ still fully rebuilds venues when re-run).
"""
import os
from pathlib import Path

import psycopg
from dotenv import load_dotenv
from psycopg import errors as pg_errors
from psycopg_pool import ConnectionPool

# admin-backend/.env (placed next to requirements.txt) — same pattern as backend/db.py
load_dotenv(Path(__file__).resolve().parent.parent / ".env")

DATABASE_URL = os.environ.get(
    "DATABASE_URL", "postgresql://postgres:postgres@localhost:5432/demo001"
)

pool = ConnectionPool(DATABASE_URL, min_size=1, max_size=5, open=False)

_VENUE_COLUMNS = (
    "id, name, type, location, image, description, opening_hours, contact"
)


def ensure_tables() -> None:
    """Idempotently create venues/users if absent (mirrors backend DDL)."""
    with pool.connection() as conn:
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS venues (
                id integer PRIMARY KEY,
                name text NOT NULL,
                type text NOT NULL CHECK (type IN ('足球场', '篮球场', '羽毛球场', '网球场')),
                location text NOT NULL,
                image text NOT NULL,
                description text NOT NULL,
                opening_hours text NOT NULL,
                contact text NOT NULL
            )
            """
        )
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


def _venue_dict(row) -> dict:
    return {
        "id": row[0],
        "name": row[1],
        "type": row[2],
        "location": row[3],
        "image": row[4],
        "description": row[5],
        "opening_hours": row[6],
        "contact": row[7],
    }


def _user_dict(row) -> dict:
    return {"id": row[0], "username": row[1], "email": row[2], "created_at": row[3]}


# ---------------------------------------------------------------------------
# venues


def fetch_venues(
    q: str, type_: str, limit: int, offset: int
) -> tuple[int, list[dict]]:
    """Return (total, items) filtered by keyword and type, all 8 fields."""
    conds: list[str] = []
    params: list = []
    if q:
        conds.append("(name ILIKE %s OR location ILIKE %s)")
        like = f"%{q}%"
        params.extend([like, like])
    if type_:
        conds.append("type = %s")
        params.append(type_)
    where = ("WHERE " + " AND ".join(conds)) if conds else ""

    with pool.connection() as conn:
        with conn.cursor() as cur:
            cur.execute(f"SELECT COUNT(*) FROM venues {where}", params)
            (total,) = cur.fetchone()
            cur.execute(
                f"SELECT {_VENUE_COLUMNS} FROM venues "
                f"{where} ORDER BY id LIMIT %s OFFSET %s",
                params + [limit, offset],
            )
            rows = cur.fetchall()

    return total, [_venue_dict(r) for r in rows]


def fetch_venue(venue_id: int) -> dict | None:
    with pool.connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                f"SELECT {_VENUE_COLUMNS} FROM venues WHERE id = %s", (venue_id,)
            )
            row = cur.fetchone()
    return _venue_dict(row) if row else None


def create_venue(data: dict) -> dict | None:
    """Insert with id = MAX(id) + 1 (seeded table has no identity column).

    Retry a few times on UniqueViolation — the tiny race window between the
    MAX() read and the insert is only reachable with concurrent creators.
    """
    fields = (
        data["name"], data["type"], data["location"], data["image"],
        data["description"], data["opening_hours"], data["contact"],
    )
    with pool.connection() as conn:
        with conn.cursor() as cur:
            for _ in range(3):
                try:
                    cur.execute(
                        f"INSERT INTO venues ({_VENUE_COLUMNS}) "
                        "SELECT COALESCE(MAX(id), 0) + 1, %s, %s, %s, %s, %s, %s, %s "
                        f"FROM venues RETURNING {_VENUE_COLUMNS}",
                        fields,
                    )
                    return _venue_dict(cur.fetchone())
                except pg_errors.UniqueViolation:
                    continue
    return None


def update_venue(venue_id: int, data: dict) -> dict | None:
    """Full overwrite of the 7 editable fields; None if the id is absent."""
    with pool.connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "UPDATE venues SET name = %s, type = %s, location = %s, "
                "image = %s, description = %s, opening_hours = %s, contact = %s "
                f"WHERE id = %s RETURNING {_VENUE_COLUMNS}",
                (
                    data["name"], data["type"], data["location"], data["image"],
                    data["description"], data["opening_hours"], data["contact"],
                    venue_id,
                ),
            )
            row = cur.fetchone()
    return _venue_dict(row) if row else None


def delete_venue(venue_id: int) -> bool:
    with pool.connection() as conn:
        with conn.cursor() as cur:
            cur.execute("DELETE FROM venues WHERE id = %s", (venue_id,))
            return cur.rowcount > 0


# ---------------------------------------------------------------------------
# users


def fetch_users(q: str, limit: int, offset: int) -> tuple[int, list[dict]]:
    conds: list[str] = []
    params: list = []
    if q:
        conds.append("(username ILIKE %s OR email ILIKE %s)")
        like = f"%{q}%"
        params.extend([like, like])
    where = ("WHERE " + " AND ".join(conds)) if conds else ""

    with pool.connection() as conn:
        with conn.cursor() as cur:
            cur.execute(f"SELECT COUNT(*) FROM users {where}", params)
            (total,) = cur.fetchone()
            cur.execute(
                "SELECT id, username, email, created_at FROM users "
                f"{where} ORDER BY id LIMIT %s OFFSET %s",
                params + [limit, offset],
            )
            rows = cur.fetchall()

    return total, [_user_dict(r) for r in rows]


def fetch_user(user_id: int) -> dict | None:
    with pool.connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT id, username, email, created_at FROM users WHERE id = %s",
                (user_id,),
            )
            row = cur.fetchone()
    return _user_dict(row) if row else None


def create_user(
    username: str, email: str, password_hash: str
) -> tuple[dict | None, str | None]:
    """Insert a user; on conflict return (None, "username" | "email")."""
    with pool.connection() as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT 1 FROM users WHERE username = %s", (username,))
            if cur.fetchone() is not None:
                return None, "username"
            cur.execute("SELECT 1 FROM users WHERE email = %s", (email.lower(),))
            if cur.fetchone() is not None:
                return None, "email"
            try:
                cur.execute(
                    "INSERT INTO users (username, email, password_hash) "
                    "VALUES (%s, %s, %s) RETURNING id, username, email, created_at",
                    (username, email.lower(), password_hash),
                )
                return _user_dict(cur.fetchone()), None
            except pg_errors.UniqueViolation as exc:
                # 依据被违反的约束名定位字段（users_username_key / users_email_key）
                constraint = exc.diag.constraint_name or ""
                field = "email" if "email" in constraint else "username"
                return None, field


def update_user(
    user_id: int, username: str, email: str, password_hash: str | None
) -> tuple[dict | None, str | None]:
    """Update profile and optionally the password.

    Returns (user, None) on success, (None, "username"|"email") on conflict,
    (None, None) when the id is absent.
    """
    with pool.connection() as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT 1 FROM users WHERE id = %s", (user_id,))
            if cur.fetchone() is None:
                return None, None
            cur.execute(
                "SELECT 1 FROM users WHERE username = %s AND id <> %s",
                (username, user_id),
            )
            if cur.fetchone() is not None:
                return None, "username"
            cur.execute(
                "SELECT 1 FROM users WHERE email = %s AND id <> %s",
                (email.lower(), user_id),
            )
            if cur.fetchone() is not None:
                return None, "email"
            try:
                if password_hash is None:
                    cur.execute(
                        "UPDATE users SET username = %s, email = %s "
                        "WHERE id = %s RETURNING id, username, email, created_at",
                        (username, email.lower(), user_id),
                    )
                else:
                    cur.execute(
                        "UPDATE users SET username = %s, email = %s, "
                        "password_hash = %s "
                        "WHERE id = %s RETURNING id, username, email, created_at",
                        (username, email.lower(), password_hash, user_id),
                    )
                return _user_dict(cur.fetchone()), None
            except pg_errors.UniqueViolation as exc:
                constraint = exc.diag.constraint_name or ""
                field = "email" if "email" in constraint else "username"
                return None, field


def delete_user(user_id: int) -> bool:
    with pool.connection() as conn:
        with conn.cursor() as cur:
            cur.execute("DELETE FROM users WHERE id = %s", (user_id,))
            return cur.rowcount > 0
