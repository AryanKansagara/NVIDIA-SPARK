"""Heritage Register lookup backed by DuckDB (populated by pipeline refresh).

Falls back to the original CKAN live fetch if DuckDB table is empty,
then falls back to heuristic if CKAN is unreachable.
"""
from __future__ import annotations

import logging
import math

import pandas as pd

from app.core.config import get_settings
from app.services.data_sources.models import HeritageEvidence
from app.services.geocoding.service import GeocodeResult
from app.services.gpu import spatial as gpu_spatial
from app.services.pipeline.duckdb_store import get_store

logger = logging.getLogger(__name__)

_MATCH_RADIUS_M = 80


class HeritageService:
    async def lookup(self, location: GeocodeResult) -> HeritageEvidence:
        try:
            return await self._lookup_duckdb(location)
        except Exception as exc:
            logger.warning("Heritage DuckDB lookup failed: %s — using fallback", exc)
            return self._fallback(location)

    async def _lookup_duckdb(self, location: GeocodeResult) -> HeritageEvidence:
        settings = get_settings()
        store = await get_store(settings.duckdb_path)

        if store.row_count("heritage") == 0:
            return HeritageEvidence(
                status="no_match",
                reason="Heritage dataset not loaded. Use /api/v1/pipeline/refresh to populate.",
                source="duckdb-empty",
            )

        # Bounding-box pre-filter in SQL, then GPU/numpy haversine on small candidate set
        lat_delta = _MATCH_RADIUS_M / 111_000
        lon_delta = _MATCH_RADIUS_M / (111_000 * math.cos(math.radians(location.latitude)))

        candidates_df = store.fetchdf(
            """SELECT record_id, address, status, latitude, longitude
               FROM heritage
               WHERE latitude BETWEEN ? AND ?
                 AND longitude BETWEEN ? AND ?""",
            [
                location.latitude - lat_delta,
                location.latitude + lat_delta,
                location.longitude - lon_delta,
                location.longitude + lon_delta,
            ],
        )

        if candidates_df.empty:
            return HeritageEvidence(
                status="no_match",
                reason="No heritage property found at this location.",
                source="duckdb-heritage",
            )

        hits = await gpu_spatial.find_within_radius(
            location.latitude, location.longitude, candidates_df, _MATCH_RADIUS_M
        )

        if not hits:
            return HeritageEvidence(
                status="no_match",
                reason="No heritage property found at this location.",
                source="duckdb-heritage",
            )

        matched = hits[0]
        status = matched.get("status", "listed")
        messages = {
            "part_iv": (
                "Part IV designated heritage property. "
                "Renovations require heritage permit review; budget for delays and exterior alteration restrictions."
            ),
            "part_v": "Located in a heritage conservation district. Neighbourhood-level restrictions on alterations apply.",
            "listed": "On the Heritage Register but not yet designated. Lower risk, worth monitoring.",
            "removed": "Previously listed heritage property, now removed from register.",
        }
        return HeritageEvidence(
            status=status,
            reason=messages.get(status, "Heritage status recorded."),
            source="duckdb-heritage",
        )

    def _fallback(self, location: GeocodeResult) -> HeritageEvidence:
        lower = location.address.lower()
        if any(k in lower for k in ("distillery", "richmond", "front", "king")):
            return HeritageEvidence(
                status="part_iv_or_sensitive_core",
                reason="Heritage-sensitive address (live data unavailable).",
                source="heuristic-fallback",
            )
        return HeritageEvidence(
            status="no_match",
            reason="No heritage signal (live data unavailable).",
            source="heuristic-fallback",
        )
