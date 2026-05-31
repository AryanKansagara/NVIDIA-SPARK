"""Singleton DuckDB store for app state: user profile, saved reports, chat turns.

Single implicit local user (no auth) — the profile is one row keyed id=1.
Reuses the same on-device DuckDB file as the data pipeline.
"""
from __future__ import annotations

import json
import threading
import uuid
from pathlib import Path
from typing import Any

import duckdb

_lock = threading.Lock()
_instance: "AppStore | None" = None


class AppStore:
    def __init__(self, db_path: str) -> None:
        Path(db_path).parent.mkdir(parents=True, exist_ok=True)
        self._con = duckdb.connect(db_path)
        self._lock = threading.Lock()
        self._init_schema()

    def _init_schema(self) -> None:
        self._con.execute("""
            CREATE TABLE IF NOT EXISTS user_profile (
                id             INTEGER PRIMARY KEY,
                name           VARCHAR,
                email          VARCHAR,
                phone          VARCHAR,
                monthly_income DOUBLE,
                updated_at     TIMESTAMP DEFAULT current_timestamp
            )
        """)
        self._con.execute("""
            CREATE TABLE IF NOT EXISTS saved_reports (
                report_id     VARCHAR PRIMARY KEY,
                address       VARCHAR,
                list_price    DOUBLE,
                buyer_profile VARCHAR,
                true_10y_cost INTEGER,
                payload       JSON,
                created_at    TIMESTAMP DEFAULT current_timestamp
            )
        """)
        self._con.execute("""
            CREATE TABLE IF NOT EXISTS chat_turns (
                turn_id    VARCHAR PRIMARY KEY,
                session_id VARCHAR,
                role       VARCHAR,
                content    VARCHAR,
                created_at TIMESTAMP DEFAULT current_timestamp
            )
        """)

    # ---- profile ----------------------------------------------------
    def get_profile(self) -> dict[str, Any] | None:
        with self._lock:
            row = self._con.execute(
                "SELECT name, email, phone, monthly_income FROM user_profile WHERE id = 1"
            ).fetchone()
        if not row:
            return None
        return {"name": row[0], "email": row[1], "phone": row[2], "monthly_income": row[3]}

    def upsert_profile(
        self, name: str | None, email: str | None, phone: str | None, monthly_income: float | None
    ) -> dict[str, Any]:
        with self._lock:
            self._con.execute(
                """
                INSERT INTO user_profile (id, name, email, phone, monthly_income, updated_at)
                VALUES (1, ?, ?, ?, ?, now())
                ON CONFLICT (id) DO UPDATE SET
                    name = excluded.name, email = excluded.email,
                    phone = excluded.phone, monthly_income = excluded.monthly_income,
                    updated_at = now()
                """,
                [name, email, phone, monthly_income],
            )
        return {"name": name, "email": email, "phone": phone, "monthly_income": monthly_income}

    # ---- saved reports ----------------------------------------------
    def save_report(self, report: dict[str, Any]) -> str:
        report_id = uuid.uuid4().hex[:12]
        prop = report.get("property", {})
        with self._lock:
            self._con.execute(
                """
                INSERT INTO saved_reports
                    (report_id, address, list_price, buyer_profile, true_10y_cost, payload)
                VALUES (?, ?, ?, ?, ?, ?)
                """,
                [
                    report_id,
                    prop.get("address") or report.get("address"),
                    report.get("list_price"),
                    report.get("buyer_profile"),
                    report.get("true_10_year_cost"),
                    json.dumps(report),
                ],
            )
        return report_id

    def list_reports(self) -> list[dict[str, Any]]:
        with self._lock:
            rows = self._con.execute(
                """
                SELECT report_id, address, list_price, buyer_profile, true_10y_cost, created_at
                FROM saved_reports ORDER BY created_at DESC
                """
            ).fetchall()
        return [
            {
                "report_id": r[0], "address": r[1], "list_price": r[2],
                "buyer_profile": r[3], "true_10y_cost": r[4], "created_at": str(r[5]),
            }
            for r in rows
        ]

    def get_report(self, report_id: str) -> dict[str, Any] | None:
        with self._lock:
            row = self._con.execute(
                "SELECT payload FROM saved_reports WHERE report_id = ?", [report_id]
            ).fetchone()
        return json.loads(row[0]) if row else None

    def delete_report(self, report_id: str) -> bool:
        with self._lock:
            rows = self._con.execute(
                "DELETE FROM saved_reports WHERE report_id = ? RETURNING report_id", [report_id]
            ).fetchall()
        return len(rows) > 0

    # ---- chat turns (short-term memory) -----------------------------
    def add_turn(self, session_id: str, role: str, content: str) -> None:
        with self._lock:
            self._con.execute(
                "INSERT INTO chat_turns (turn_id, session_id, role, content) VALUES (?, ?, ?, ?)",
                [uuid.uuid4().hex[:12], session_id, role, content],
            )

    def recent_turns(self, session_id: str, limit: int = 10) -> list[dict[str, str]]:
        with self._lock:
            rows = self._con.execute(
                """
                SELECT role, content FROM chat_turns
                WHERE session_id = ? ORDER BY created_at DESC LIMIT ?
                """,
                [session_id, limit],
            ).fetchall()
        return [{"role": r[0], "content": r[1]} for r in reversed(rows)]


def get_app_store(db_path: str) -> AppStore:
    global _instance
    with _lock:
        if _instance is None:
            _instance = AppStore(db_path)
    return _instance
