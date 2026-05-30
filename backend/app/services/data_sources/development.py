"""Development Applications lookup backed by DuckDB.

Falls back to heuristic if DuckDB table is empty.
"""
from __future__ import annotations

import logging
import math

from app.core.config import get_settings
from app.services.data_sources.models import DevelopmentEvidence
from app.services.geocoding.service import GeocodeResult
from app.services.gpu import spatial as gpu_spatial
from app.services.pipeline.duckdb_store import get_store

logger = logging.getLogger(__name__)

_RADIUS_M = 500


class DevelopmentService:
    async def lookup(self, location: GeocodeResult) -> DevelopmentEvidence:
        try:
            return await self._lookup_duckdb(location)
        except Exception as exc:
            logger.warning("Development DuckDB lookup failed: %s — using fallback", exc)
            return self._fallback(location)

    async def _lookup_duckdb(self, location: GeocodeResult) -> DevelopmentEvidence:
        settings = get_settings()
        store = await get_store(settings.duckdb_path)

        if store.row_count("development") == 0:
            return self._fallback(location)

        lat_delta = _RADIUS_M / 111_000
        lon_delta = _RADIUS_M / (111_000 * math.cos(math.radians(location.latitude)))

        candidates_df = store.fetchdf(
            """SELECT record_id, address, latitude, longitude
               FROM development
               WHERE active = TRUE
                 AND latitude BETWEEN ? AND ?
                 AND longitude BETWEEN ? AND ?""",
            [
                location.latitude - lat_delta,
                location.latitude + lat_delta,
                location.longitude - lon_delta,
                location.longitude + lon_delta,
            ],
        )

        if candidates_df.empty:
            return DevelopmentEvidence(
                application_count_500m=0,
                intensity="low",
                source="duckdb-development",
            )

        hits = await gpu_spatial.find_within_radius(
            location.latitude, location.longitude, candidates_df, _RADIUS_M
        )

        count = len(hits)
        intensity = "high" if count >= 10 else "medium" if count >= 5 else "low"
        return DevelopmentEvidence(
            application_count_500m=count,
            intensity=intensity,
            source="duckdb-development",
        )

    def _fallback(self, location: GeocodeResult) -> DevelopmentEvidence:
        lower = location.address.lower()
        if any(k in lower for k in ("richmond", "king", "yonge", "queen")):
            count = 14
        elif any(k in lower for k in ("scarborough", "etobicoke", "north york")):
            count = 4
        else:
            count = 7
        intensity = "high" if count >= 10 else "medium" if count >= 5 else "low"
        return DevelopmentEvidence(
            application_count_500m=count,
            intensity=intensity,
            source="heuristic-fallback",
        )
