from app.core.config import Settings
from app.services.data_sources.models import FloodEvidence
from app.services.geocoding.service import GeocodeResult


class FloodService:
    def __init__(self, settings: Settings) -> None:
        self.settings = settings

    async def lookup(self, location: GeocodeResult) -> FloodEvidence:
        in_flood_zone = location.latitude < 43.64 and location.longitude < -79.36
        return FloodEvidence(
            in_flood_zone=in_flood_zone,
            annual_risk_loading=self.settings.flood_risk_annual_loading if in_flood_zone else 0,
            source="heuristic-preview",
        )
