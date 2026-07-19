"""Persistent per-brand detection counter (SQLite).

A minimal brand -> cumulative total table. Incremented once per real
"match" (detector.py:save_match), not per classified crop, so it matches
the "Number of detections" already shown by the frontend.

SQLite in WAL mode handles occasional writes from multiple processes well
(each detection job runs in its own subprocess), which is the only
concurrency pattern that occurs here.
"""

import sqlite3
from pathlib import Path

DB_PATH = Path("resultados") / "stats.db"


def _connect() -> sqlite3.Connection:
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(DB_PATH, timeout=10)
    conn.execute("PRAGMA journal_mode=WAL")
    return conn


def init_db() -> None:
    conn = _connect()
    try:
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS brand_counts (
                brand TEXT PRIMARY KEY,
                count INTEGER NOT NULL DEFAULT 0
            )
            """
        )
        # Migration: the table used to have a "marca" column (Spanish).
        # Rename it in place instead of dropping the table, so existing
        # persisted counts survive the English rename.
        columns = {row[1] for row in conn.execute("PRAGMA table_info(brand_counts)")}
        if "marca" in columns and "brand" not in columns:
            conn.execute("ALTER TABLE brand_counts RENAME COLUMN marca TO brand")
        conn.commit()
    finally:
        conn.close()


def increment_brand(brand: str) -> None:
    conn = _connect()
    try:
        conn.execute(
            """
            INSERT INTO brand_counts (brand, count) VALUES (?, 1)
            ON CONFLICT(brand) DO UPDATE SET count = count + 1
            """,
            (brand,),
        )
        conn.commit()
    finally:
        conn.close()


def get_all_counts() -> dict[str, int]:
    conn = _connect()
    try:
        rows = conn.execute("SELECT brand, count FROM brand_counts").fetchall()
        return {brand: count for brand, count in rows}
    finally:
        conn.close()
