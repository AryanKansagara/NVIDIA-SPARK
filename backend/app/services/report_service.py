from functools import lru_cache

from app.core.config import Settings, get_settings
from app.schemas.debug import DevelopmentDebugResponse, FloodDebugResponse, GeocodeResponse, HeritageDebugResponse
from app.schemas.report import EvidenceSummary, ReportRequest, ReportResponse, ResolvedProperty
from app.services.data_sources.development import DevelopmentService
from app.services.data_sources.flood import FloodService
from app.services.data_sources.heritage import HeritageService
from app.services.engine.report_engine import EngineInput, ReportEngine
from app.services.geocoding.service import GeocodingService
from app.services.synthesis.service import SynthesisService


class ReportService:
    def __init__(self, settings: Settings) -> None:
        self.settings = settings
        self.geocoder = GeocodingService(settings)
        self.heritage_service = HeritageService()
        self.flood_service = FloodService(settings)
        self.development_service = DevelopmentService()
        self.engine = ReportEngine(settings)
        self.synthesis = SynthesisService(settings)

    async def geocode_address(self, address: str) -> GeocodeResponse:
        location = await self.geocoder.geocode(address)
        return GeocodeResponse(
            address=location.address,
            normalized_address=location.normalized_address,
            latitude=location.latitude,
            longitude=location.longitude,
            source=location.source,
            raw_display_name=location.raw_display_name,
        )

    async def debug_heritage(self, address: str) -> HeritageDebugResponse:
        location = await self.geocoder.geocode(address)
        heritage = await self.heritage_service.lookup(location)
        return HeritageDebugResponse(
            address=location.address,
            normalized_address=location.normalized_address,
            latitude=location.latitude,
            longitude=location.longitude,
            status=heritage.status,
            reason=heritage.reason,
            source=heritage.source,
        )

    async def debug_flood(self, address: str) -> FloodDebugResponse:
        location = await self.geocoder.geocode(address)
        flood = await self.flood_service.lookup(location)
        return FloodDebugResponse(
            address=location.address,
            normalized_address=location.normalized_address,
            latitude=location.latitude,
            longitude=location.longitude,
            in_flood_zone=flood.in_flood_zone,
            annual_risk_loading=flood.annual_risk_loading,
            source=flood.source,
        )

    async def debug_development(self, address: str) -> DevelopmentDebugResponse:
        location = await self.geocoder.geocode(address)
        development = await self.development_service.lookup(location)
        return DevelopmentDebugResponse(
            address=location.address,
            normalized_address=location.normalized_address,
            latitude=location.latitude,
            longitude=location.longitude,
            application_count_500m=development.application_count_500m,
            intensity=development.intensity,
            source=development.source,
        )

    async def build_report(self, payload: ReportRequest) -> ReportResponse:
        warnings: list[str] = []
        location = await self.geocoder.geocode(payload.address)

        heritage = await self.heritage_service.lookup(location)
        flood = await self.flood_service.lookup(location)
        development = await self.development_service.lookup(location)

        if "heuristic" in heritage.source:
            warnings.append("Heritage data fell back to heuristic — CKAN live dataset unavailable.")
        if "heuristic" in flood.source:
            warnings.append("Flood data fell back to heuristic — TRCA ArcGIS service unavailable.")
        if "heuristic" in development.source:
            warnings.append("Development pressure fell back to heuristic — CKAN live dataset unavailable.")

        engine_output = self.engine.build(
            EngineInput(
                list_price=payload.list_price,
                buyer_profile=payload.buyer_profile,
                down_payment_percent=payload.down_payment_percent,
                mortgage_rate=payload.mortgage_rate,
                amortization_years=payload.amortization_years,
                address=payload.address,
                heritage=heritage,
                flood=flood,
                development=development,
            )
        )

        return ReportResponse(
            property=ResolvedProperty(
                address=location.address,
                normalized_address=location.normalized_address,
                latitude=location.latitude,
                longitude=location.longitude,
                ward=None,
            ),
            true_10_year_cost=engine_output.total_cost,
            cost_breakdown=engine_output.components,
            mortgage_scenarios=engine_output.scenarios,
            flags=engine_output.flags,
            warnings=warnings,
            evidence_summary=EvidenceSummary(
                geocoder={
                    "source": location.source,
                    "raw_display_name": location.raw_display_name,
                },
                heritage={
                    "status": heritage.status,
                    "reason": heritage.reason,
                    "source": heritage.source,
                },
                flood={
                    "in_flood_zone": flood.in_flood_zone,
                    "annual_risk_loading": flood.annual_risk_loading,
                    "source": flood.source,
                },
                development={
                    "application_count_500m": development.application_count_500m,
                    "intensity": development.intensity,
                    "source": development.source,
                },
            ),
            key_numbers=engine_output.key_numbers,
            summary_text=await self.synthesis.synthesize(
                address=payload.address,
                list_price=payload.list_price,
                buyer_profile=payload.buyer_profile,
                engine_output=engine_output,
                heritage=heritage,
                flood=flood,
                development=development,
            ),
        )


@lru_cache
def get_report_service() -> ReportService:
    return ReportService(get_settings())
