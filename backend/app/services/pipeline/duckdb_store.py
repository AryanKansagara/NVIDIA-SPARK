"""Singleton DuckDB connection wrapping the persistent meridian.duckdb file."""
from __future__ import annotations

import asyncio
import logging
import os
from pathlib import Path
from typing import Any

import duckdb

logger = logging.getLogger(__name__)

_lock = asyncio.Lock()
_instance: "DuckDBStore | None" = None


class DuckDBStore:
    def __init__(self, db_path: str) -> None:
        Path(db_path).parent.mkdir(parents=True, exist_ok=True)
        self._con = duckdb.connect(db_path)
        self._init_schema()

    # ------------------------------------------------------------------
    def _init_schema(self) -> None:
        self._con.execute("""
            CREATE TABLE IF NOT EXISTS heritage (
                record_id  VARCHAR PRIMARY KEY,
                address    VARCHAR,
                status     VARCHAR,
                latitude   DOUBLE,
                longitude  DOUBLE,
                loaded_at  TIMESTAMP DEFAULT current_timestamp
            )
        """)
        self._con.execute("""
            CREATE TABLE IF NOT EXISTS development (
                record_id      VARCHAR PRIMARY KEY,
                address        VARCHAR,
                status         VARCHAR,
                active         BOOLEAN,
                submitted_date DATE,
                decision_date  DATE,
                latitude       DOUBLE,
                longitude      DOUBLE,
                loaded_at      TIMESTAMP DEFAULT current_timestamp
            )
        """)
        self._con.execute("""
            CREATE TABLE IF NOT EXISTS pipeline_runs (
                run_id           VARCHAR PRIMARY KEY,
                started_at       TIMESTAMP,
                finished_at      TIMESTAMP,
                heritage_rows    INTEGER,
                development_rows INTEGER,
                status           VARCHAR,
                error_message    VARCHAR
            )
        """)

    # ------------------------------------------------------------------
    def load_parquet(self, table: str, parquet_path: str) -> int:
        """Replace *table*_raw with fresh parquet data; return row count."""
        raw = f"{table}_raw"
        self._con.execute(f"DROP TABLE IF EXISTS {raw}")
        self._con.execute(
            f"CREATE TABLE {raw} AS SELECT * FROM read_parquet('{parquet_path}')"
        )
        count = self._con.execute(f"SELECT COUNT(*) FROM {raw}").fetchone()[0]
        logger.info("Loaded %d rows into %s from %s", count, raw, parquet_path)
        return count

    def execute(self, sql: str, params: list[Any] | None = None):
        if params:
            return self._con.execute(sql, params)
        return self._con.execute(sql)

    def fetchall(self, sql: str, params: list[Any] | None = None) -> list[tuple]:
        return self.execute(sql, params).fetchall()

    def fetchdf(self, sql: str, params: list[Any] | None = None):
        """Return a pandas DataFrame for the query."""
        return self.execute(sql, params).df()

    def has_table(self, table: str) -> bool:
        result = self._con.execute(
            "SELECT count(*) FROM information_schema.tables WHERE table_name = ?",
            [table],
        ).fetchone()
        return result[0] > 0

    def row_count(self, table: str) -> int:
        if not self.has_table(table):
            return 0
        return self._con.execute(f"SELECT COUNT(*) FROM {table}").fetchone()[0]


async def get_store(db_path: str) -> DuckDBStore:
    global _instance
    async with _lock:
        if _instance is None:
            _instance = DuckDBStore(db_path)
    return _instance


def reset_store() -> None:
    """Force re-creation on next get_store() call (used after pipeline refresh)."""
    global _instance
    _instance = None
