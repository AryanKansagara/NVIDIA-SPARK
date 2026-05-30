from app.services.data_sources.models import DevelopmentEvidence
from app.services.geocoding.service import GeocodeResult


class DevelopmentService:
    async def lookup(self, location: GeocodeResult) -> DevelopmentEvidence:
        lower = location.address.lower()
        if any(keyword in lower for keyword in ("richmond", "king", "yonge", "queen")):
            count = 14
        elif any(keyword in lower for keyword in ("scarborough", "etobicoke", "north york")):
            count = 4
        else:
            count = 7

        if count >= 10:
            intensity = "high"
        elif count >= 5:
            intensity = "medium"
        else:
            intensity = "low"

        return DevelopmentEvidence(
            application_count_500m=count,
            intensity=intensity,
            source="heuristic-preview",
        )
