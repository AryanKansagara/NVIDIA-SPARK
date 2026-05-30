import json
from pathlib import Path

import httpx

from app.core.config import Settings
from app.services.data_sources.models import FloodEvidence
from app.services.geocoding.service import GeocodeResult

_MODERATE_BUFFER_M = 100


def _ray_cast_flood(lon: float, lat: float, ring: list) -> bool:
    inside = False
    j = len(ring) - 1
    for i in range(len(ring)):
        xi, yi = ring[i][0], ring[i][1]
        xj, yj = ring[j][0], ring[j][1]
        if ((yi > lat) != (yj > lat)) and lon < (xj - xi) * (lat - yi) / (yj - yi) + xi:
            inside = not inside
        j = i
    return inside


def _point_in_geojson(lon: float, lat: float, features: list[dict]) -> bool:
    for feature in features:
        geom = feature.get("geometry") or {}
        gtype = geom.get("type")
        coords = geom.get("coordinates", [])
        if gtype == "Polygon" and coords:
            if _ray_cast_flood(lon, lat, coords[0]):
                return True
        elif gtype == "MultiPolygon":
            if any(_ray_cast_flood(lon, lat, poly[0]) for poly in coords if poly):
                return True
    return False


class FloodService:
    def __init__(self, settings: Settings) -> None:
        self.settings = settings
        self._fallback_features: list[dict] | None = None
        self._fallback_loaded = False

    def _load_fallback_geojson(self) -> list[dict]:
        if self._fallback_loaded:
            return self._fallback_features or []
        self._fallback_loaded = True
        path = Path(self.settings.trca_flood_fallback_geojson)
        if path.exists():
            try:
                data = json.loads(path.read_text(encoding="utf-8"))
                self._fallback_features = data.get("features", [])
            except Exception:
                self._fallback_features = []
        else:
            self._fallback_features = []
        return self._fallback_features

    async def lookup(self, location: GeocodeResult) -> FloodEvidence:
        try:
            return await self._query_trca(location)
        except Exception:
            return self._fallback(location)

    async def _query_trca(self, location: GeocodeResult) -> FloodEvidence:
        point = f"{location.longitude},{location.latitude}"
        base_params = {
            "geometry": point,
            "geometryType": "esriGeometryPoint",
            "inSR": "4326",
            "spatialRel": "esriSpatialRelIntersects",
            "returnCountOnly": "true",
            "f": "json",
        }

        async with httpx.AsyncClient(timeout=self.settings.request_timeout_seconds) as client:
            # Tier 1: exact intersection → Elevated
            resp = await client.get(self.settings.trca_flood_query_url, params=base_params)
            resp.raise_for_status()
            if resp.json().get("count", 0) > 0:
                return FloodEvidence(
                    status="elevated",
                    in_flood_zone=True,
                    internal_loading=self.settings.flood_risk_internal_loading,
                    source="trca-floodline",
                )

            # Tier 2: within 100m → Moderate
            near_params = {**base_params, "distance": _MODERATE_BUFFER_M, "units": "esriSRUnit_Meter"}
            resp2 = await client.get(self.settings.trca_flood_query_url, params=near_params)
            resp2.raise_for_status()
            if resp2.json().get("count", 0) > 0:
                return FloodEvidence(
                    status="moderate",
                    in_flood_zone=False,
                    internal_loading=0,
                    source="trca-floodline",
                )

        return FloodEvidence(
            status="low",
            in_flood_zone=False,
            internal_loading=0,
            source="trca-floodline",
        )

    def _fallback(self, location: GeocodeResult) -> FloodEvidence:
        features = self._load_fallback_geojson()
        if features:
            hit = _point_in_geojson(location.longitude, location.latitude, features)
            return FloodEvidence(
                status="elevated" if hit else "low",
                in_flood_zone=hit,
                internal_loading=self.settings.flood_risk_internal_loading if hit else 0,
                source="geojson-fallback",
            )
        # No local file — cannot determine flood risk
        return FloodEvidence(
            status="low",
            in_flood_zone=False,
            internal_loading=0,
            source="heuristic-fallback",
        )
