"""Heritage Register dataset cleaning pipeline."""
from __future__ import annotations

import logging
import re

from app.services.pipeline.duckdb_store import DuckDBStore

logger = logging.getLogger(__name__)

_STATUS_MAP = {
    "part iv": "part_iv",
    "part 4": "part_iv",
    "designated": "part_iv",
    "part v": "part_v",
    "part 5": "part_v",
    "heritage conservation district": "part_v",
    "listed": "listed",
    "on list": "listed",
    "inventory": "listed",
    "removed": "removed",
    "delisted": "removed",
}


def _normalise_status(raw: str | None) -> str:
    if not raw:
        return "listed"
    lower = raw.strip().lower()
    for pattern, canonical in _STATUS_MAP.items():
        if pattern in lower:
            return canonical
    return "listed"


def run(store: DuckDBStore) -> int:
    """Read heritage_raw, clean, write to heritage. Return row count."""
    if not store.has_table("heritage_raw"):
        logger.warning("heritage_raw table missing — skipping cleaner")
        return 0

    raw_cols = [
        row[0].lower()
        for row in store.fetchall(
            "SELECT column_name FROM information_schema.columns "
            "WHERE table_name = 'heritage_raw'"
        )
    ]

    lat_col = _pick(raw_cols, ["latitude", "lat", "y", "geo_point_lat"])
    lon_col = _pick(raw_cols, ["longitude", "lon", "long", "x", "geo_point_lng", "geo_point_lon"])
    status_col = _pick(raw_cols, ["status", "designation", "heritage_status", "type"])
    addr_col = _pick(raw_cols, ["address", "property_address", "street_address", "full_address"])
    id_col = _pick(raw_cols, ["_id", "id", "objectid", "record_id"])

    rows = store.fetchall(f"""
        SELECT
            CAST({id_col} AS VARCHAR),
            {addr_col},
            {status_col},
            TRY_CAST({lat_col} AS DOUBLE),
            TRY_CAST({lon_col} AS DOUBLE)
        FROM heritage_raw
        WHERE TRY_CAST({lat_col} AS DOUBLE) IS NOT NULL
          AND TRY_CAST({lon_col} AS DOUBLE) IS NOT NULL
    """)

    cleaned = [
        (rid, addr, _normalise_status(status), lat, lon)
        for rid, addr, status, lat, lon in rows
        if lat is not None and lon is not None
    ]

    store.execute("DELETE FROM heritage")
    # Bulk insert the cleaned, standardized rows.
    store._con.executemany(
        "INSERT OR REPLACE INTO heritage (record_id, address, status, latitude, longitude) VALUES (?,?,?,?,?)",
        cleaned,
    )
    logger.info("Cleaned %d heritage records", len(cleaned))
    return len(cleaned)


def _pick(cols: list[str], candidates: list[str]) -> str:
    for c in candidates:
        if c in cols:
            return c
    raise ValueError(f"None of {candidates} found in columns: {cols}")
