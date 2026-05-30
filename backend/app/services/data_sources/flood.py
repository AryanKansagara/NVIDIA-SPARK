import httpx

from app.core.config import Settings
from app.services.data_sources.models import FloodEvidence
from app.services.geocoding.service import GeocodeResult


class FloodService:
    def __init__(self, settings: Settings) -> None:
        self.settings = settings

    async def lookup(self, location: GeocodeResult) -> FloodEvidence:
        try:
            return await self._query_trca(location)
        except Exception:
            return self._fallback(location)

    async def _query_trca(self, location: GeocodeResult) -> FloodEvidence:
        params = {
            "geometry": f"{location.longitude},{location.latitude}",
            "geometryType": "esriGeometryPoint",
            "inSR": "4326",
            "spatialRel": "esriSpatialRelIntersects",
            "returnCountOnly": "true",
            "f": "json",
        }
        async with httpx.AsyncClient(timeout=self.settings.request_timeout_seconds) as client:
            resp = await client.get(self.settings.trca_flood_query_url, params=params)
            resp.raise_for_status()
            count = resp.json().get("count", 0)

        in_flood_zone = count > 0
        return FloodEvidence(
            in_flood_zone=in_flood_zone,
            annual_risk_loading=self.settings.flood_risk_annual_loading if in_flood_zone else 0,
            source="trca-floodline",
        )

    def _fallback(self, location: GeocodeResult) -> FloodEvidence:
        in_flood_zone = location.latitude < 43.64 and location.longitude < -79.36
        return FloodEvidence(
            in_flood_zone=in_flood_zone,
            annual_risk_loading=self.settings.flood_risk_annual_loading if in_flood_zone else 0,
            source="heuristic-fallback",
        )
