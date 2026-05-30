from app.services.data_sources.models import HeritageEvidence
from app.services.geocoding.service import GeocodeResult


class HeritageService:
    async def lookup(self, location: GeocodeResult) -> HeritageEvidence:
        lower = location.address.lower()
        if any(keyword in lower for keyword in ("distillery", "richmond", "front", "king")):
            return HeritageEvidence(
                status="part_iv_or_sensitive_core",
                reason="Address falls into the downtown heritage-sensitive preview bucket.",
                source="heuristic-preview",
            )

        return HeritageEvidence(
            status="no_match_preview",
            reason="No heritage signal found in the MVP preview adapter.",
            source="heuristic-preview",
        )
