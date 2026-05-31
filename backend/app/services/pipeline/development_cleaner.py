"""Development Applications dataset cleaning pipeline.

Best-practice cleaning/standardization applied to the City of Toronto
"development-applications" CKAN datastore (≈26k rows):

1. Schema-agnostic column detection (the open dataset's columns drift over time).
2. Address standardization — composes a single address from the street-part
   columns (street_num/name/type/direction) when no single address column exists,
   then normalizes whitespace/casing.
3. Coordinate standardization — the dataset ships projected MTM Zone 10 (EPSG:2952)
   eastings/northings in x/y; we reproject to WGS84 lat/lon (EPSG:4326).
4. Validation — drop rows with missing/invalid coordinates and clip to the
   Greater Toronto bounding box (data-quality guard against bad geocodes).
5. Status normalization — derive a boolean `active` flag from the status text.
6. Idempotent load — replace by primary key so re-runs don't duplicate.
"""
from __future__ import annotations

import logging

from pyproj import Transformer

from app.services.pipeline.duckdb_store import DuckDBStore

logger = logging.getLogger(__name__)

# City of Toronto open data publishes coordinates in NAD83 MTM Zone 10.
_MTM_ZONE_10 = "EPSG:2952"
_WGS84 = "EPSG:4326"
_transformer = Transformer.from_crs(_MTM_ZONE_10, _WGS84, always_xy=True)

# Greater Toronto bounding box (validation guard).
_LAT_MIN, _LAT_MAX = 43.4, 44.0
_LON_MIN, _LON_MAX = -79.8, -79.0

_INACTIVE_STATUSES = {
    "withdrawn", "closed", "lapsed", "refused", "cancelled",
    "appeal dismissed", "appeal withdrawn",
}


def _is_active(status: str | None) -> bool:
    if not status:
        return True
    return status.strip().lower() not in _INACTIVE_STATUSES


def _to_wgs84(x: float, y: float) -> tuple[float, float] | None:
    """Return (lat, lon) in WGS84, or None if input looks invalid.

    Values within ±180 are already lat/lon; larger magnitudes are projected
    MTM coordinates and get reprojected.
    """
    if x is None or y is None:
        return None
    if abs(x) <= 180 and abs(y) <= 180:
        lon, lat = x, y  # already geographic
    else:
        lon, lat = _transformer.transform(x, y)
    if not (_LAT_MIN <= lat <= _LAT_MAX and _LON_MIN <= lon <= _LON_MAX):
        return None
    return round(lat, 6), round(lon, 6)


def _compose_address(parts: dict[str, str | None]) -> str:
    """Build a normalized single-line address from street-part columns."""
    ordered = [parts.get("num"), parts.get("name"), parts.get("type"), parts.get("dir")]
    tokens = [str(p).strip() for p in ordered if p not in (None, "", "nan")]
    return " ".join(" ".join(tokens).split()).title()


def run(store: DuckDBStore) -> int:
    """Read development_raw, clean/standardize, write to development. Return row count."""
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
    id_col = _pick(raw_cols, ["_id", "id", "objectid", "application_id", "record_id"])
    submitted_col = _pick_optional(raw_cols, ["submitted_date", "date_submitted", "application_date", "received_date"])
    decision_col = _pick_optional(raw_cols, ["decision_date", "date_decided", "determined_date"])

    # Address: prefer a single column, else compose from street parts.
    addr_col = _pick_optional(raw_cols, ["address", "property_address", "street_address", "location"])
    num_col = _pick_optional(raw_cols, ["street_num", "street_number", "civic_number"])
    name_col = _pick_optional(raw_cols, ["street_name"])
    type_col = _pick_optional(raw_cols, ["street_type"])
    dir_col = _pick_optional(raw_cols, ["street_direction", "street_dir"])
    if not addr_col and not name_col:
        raise ValueError(f"No address or street columns found in: {raw_cols}")

    sub_expr = f"TRY_CAST({submitted_col} AS DATE)" if submitted_col else "NULL"
    dec_expr = f"TRY_CAST({decision_col} AS DATE)" if decision_col else "NULL"
    addr_select = (
        f"{addr_col} AS address"
        if addr_col
        else ", ".join(
            f"{c} AS {alias}"
            for c, alias in [(num_col, "s_num"), (name_col, "s_name"), (type_col, "s_type"), (dir_col, "s_dir")]
            if c
        )
    )

    rows = store.fetchdf(f"""
        SELECT
            CAST({id_col} AS VARCHAR) AS record_id,
            {addr_select},
            {status_col} AS status,
            {sub_expr} AS submitted_date,
            {dec_expr} AS decision_date,
            TRY_CAST({lon_col} AS DOUBLE) AS x,
            TRY_CAST({lat_col} AS DOUBLE) AS y
        FROM development_raw
    """)

    cleaned: list[tuple] = []
    seen: set[str] = set()
    for r in rows.itertuples(index=False):
        rid = r.record_id
        if rid in seen:
            continue
        coords = _to_wgs84(getattr(r, "x", None), getattr(r, "y", None))
        if coords is None:
            continue
        lat, lon = coords
        if addr_col:
            address = str(r.address).strip()
        else:
            address = _compose_address(
                {"num": getattr(r, "s_num", None), "name": getattr(r, "s_name", None),
                 "type": getattr(r, "s_type", None), "dir": getattr(r, "s_dir", None)}
            )
        status = r.status
        cleaned.append((rid, address, status, _is_active(status), r.submitted_date, r.decision_date, lat, lon))
        seen.add(rid)

    store.execute("DELETE FROM development")
    store._con.executemany(
        """INSERT OR REPLACE INTO development
           (record_id, address, status, active, submitted_date, decision_date, latitude, longitude)
           VALUES (?,?,?,?,?,?,?,?)""",
        cleaned,
    )
    logger.info("Cleaned %d development records (from %d raw)", len(cleaned), len(rows))
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
