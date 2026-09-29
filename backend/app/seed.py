"""Create database/table and import venues from data/venues.json.

Idempotent: safe to re-run, always refreshes all rows.
Usage:  python -m app.seed   (from the backend directory)
"""
import json
from pathlib import Path

import psycopg
from psycopg import sql

from .db import DATABASE_URL

BACKEND_DIR = Path(__file__).resolve().parent.parent


def ensure_database() -> str:
    """Create the target database if missing. Returns its name."""
    params = psycopg.conninfo.conninfo_to_dict(DATABASE_URL)
    dbname = params.get("dbname", "postgres")
    params["dbname"] = "postgres"
    admin_conninfo = psycopg.conninfo.make_conninfo(**params)

    with psycopg.connect(admin_conninfo, autocommit=True) as conn:
        exists = conn.execute(
            "SELECT 1 FROM pg_database WHERE datname = %s", (dbname,)
        ).fetchone()
        if not exists:
            conn.execute(
                sql.SQL("CREATE DATABASE {}").format(sql.Identifier(dbname))
            )
            print(f"created database {dbname}")
    return dbname


def seed() -> None:
    dbname = ensure_database()
    venues = json.loads(
        (BACKEND_DIR / "data" / "venues.json").read_text(encoding="utf-8")
    )

    with psycopg.connect(DATABASE_URL) as conn:
        # DROP + CREATE：表结构始终与 venues.json 字段一致（幂等重建）
        conn.execute("DROP TABLE IF EXISTS venues")
        conn.execute(
            """
            CREATE TABLE venues (
                id integer PRIMARY KEY,
                name text NOT NULL,
                type text NOT NULL,
                location text NOT NULL,
                image text NOT NULL,
                description text NOT NULL,
                opening_hours text NOT NULL,
                contact text NOT NULL
            )
            """
        )
        with conn.cursor() as cur:
            cur.executemany(
                "INSERT INTO venues (id, name, type, location, image, "
                "description, opening_hours, contact) "
                "VALUES (%s, %s, %s, %s, %s, %s, %s, %s)",
                [
                    (
                        v["id"], v["name"], v["type"], v["location"],
                        v["image"], v["description"], v["opening_hours"],
                        v["contact"],
                    )
                    for v in venues
                ],
            )
        conn.commit()
        count = conn.execute("SELECT COUNT(*) FROM venues").fetchone()[0]

    assert count == len(venues), f"expected {len(venues)} rows, got {count}"
    print(f"seeded {count} venues into {dbname}")


if __name__ == "__main__":
    seed()
