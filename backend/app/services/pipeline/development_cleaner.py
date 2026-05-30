"""Development Applications dataset cleaning pipeline."""
from __future__ import annotations

import logging
from datetime import date

from app.services.pipeline.duckdb_store import DuckDBStore

logger = logging.getLogger(__name__)

_INACTIVE_STATUSES = {
    "withdrawn", "closed", "lapsed", "refused", "cancelled",
    "appeal dismissed", "appeal withdrawn",
}


def _is_active(status: str | None) -> bool:
    if not status:
        return True
    return status.strip().lower() not in _INACTIVE_STATUSES


def run(store: DuckDBStore) -> int:
    """Read development_raw, clean, write to development. Return row count."""
    if not store.has_table("development_raw"):
        logger.warning("development_raw table missing — skipping cleaner")
        return 0

    raw_cols = [
        row[0].lower()
        for row in store.fetchall(
            "SELECT column_name FROM information_schema.columns "
            "WHERE table_name = 'development_raw'"
        )
    ]

    lat_col = _pick(raw_cols, ["latitude", "lat", "y", "geo_point_lat"])
    lon_col = _pick(raw_cols, ["longitude", "lon", "long", "x", "geo_point_lng", "geo_point_lon"])
    status_col = _pick(raw_cols, ["status", "application_status", "current_status"])
    addr_col = _pick(raw_cols, ["address", "property_address", "street_address", "location"])
    id_col = _pick(raw_cols, ["_id", "id", "objectid", "application_id", "record_id"])
    submitted_col = _pick_optional(raw_cols, ["submitted_date", "date_submitted", "application_date", "received_date"])
    decision_col = _pick_optional(raw_cols, ["decision_date", "date_decided", "determined_date"])

    sub_expr = f"TRY_CAST({submitted_col} AS DATE)" if submitted_col else "NULL"
    dec_expr = f"TRY_CAST({decision_col} AS DATE)" if decision_col else "NULL"

    rows = store.fetchall(f"""
        SELECT
            CAST({id_col} AS VARCHAR),
            {addr_col},
            {status_col},
            {sub_expr},
            {dec_expr},
            TRY_CAST({lat_col} AS DOUBLE),
            TRY_CAST({lon_col} AS DOUBLE)
        FROM development_raw
        WHERE TRY_CAST({lat_col} AS DOUBLE) IS NOT NULL
          AND TRY_CAST({lon_col} AS DOUBLE) IS NOT NULL
    """)

    cleaned = [
        (rid, addr, status, _is_active(status), sub, dec, lat, lon)
        for rid, addr, status, sub, dec, lat, lon in rows
        if lat is not None and lon is not None
    ]

    store.execute("DELETE FROM development")
    store._con.executemany(
        """INSERT OR REPLACE INTO development
           (record_id, address, status, active, submitted_date, decision_date, latitude, longitude)
           VALUES (?,?,?,?,?,?,?,?)""",
        cleaned,
    )
    logger.info("Cleaned %d development records", len(cleaned))
    return len(cleaned)


def _pick(cols: list[str], candidates: list[str]) -> str:
    for c in candidates:
        if c in cols:
            return c
    raise ValueError(f"None of {candidates} found in columns: {cols}")


def _pick_optional(cols: list[str], candidates: list[str]) -> str | None:
    for c in candidates:
        if c in cols:
            return c
    return None
