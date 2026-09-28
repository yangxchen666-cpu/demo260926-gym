"""PostgreSQL connection pool and queries for the venue directory."""
import os
from pathlib import Path

import psycopg
from dotenv import load_dotenv
from psycopg_pool import ConnectionPool

# backend/.env (placed next to requirements.txt)
load_dotenv(Path(__file__).resolve().parent.parent / ".env")

DATABASE_URL = os.environ.get(
    "DATABASE_URL", "postgresql://postgres:postgres@localhost:5432/demo001"
)

pool = ConnectionPool(DATABASE_URL, min_size=1, max_size=5, open=False)


def fetch_venues(
    q: str, type_: str, limit: int, offset: int
) -> tuple[int, list[dict]]:
    """Return (total, items) filtered by keyword and type, paged by id."""
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
                "SELECT id, name, type, location, image FROM venues "
                f"{where} ORDER BY id LIMIT %s OFFSET %s",
                params + [limit, offset],
            )
            rows = cur.fetchall()

    items = [
        {"id": r[0], "name": r[1], "type": r[2], "location": r[3], "image": r[4]}
        for r in rows
    ]
    return total, items


def fetch_types() -> list[str]:
    with pool.connection() as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT DISTINCT type FROM venues ORDER BY type")
            return [r[0] for r in cur.fetchall()]
