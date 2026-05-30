from functools import lru_cache

from app.core.config import Settings, get_settings
from app.schemas.debug import DevelopmentDebugResponse, FloodDebugResponse, GeocodeResponse, HeritageDebugResponse
from app.schemas.report import (
    EvidenceSummary,
    MapGeometry,
    MonteCarloResult,
    ReportRequest,
    ReportResponse,
    ResolvedProperty,
)
from app.services.data_sources.development import DevelopmentService
from app.services.data_sources.flood import FloodService
from app.services.data_sources.heritage import HeritageService
from app.services.engine.report_engine import EngineInput, ReportEngine
from app.services.geocoding.service import GeocodingService
from app.services.gpu.monte_carlo import MonteCarloSimulator
from app.services.rag.service import RAGService
from app.services.synthesis.service import SynthesisService


class ReportService:
    def __init__(self, settings: Settings) -> None:
        self.settings = settings
        self.geocoder = GeocodingService(settings)
        self.heritage_service = HeritageService()
        self.flood_service = FloodService(settings)
        self.development_service = DevelopmentService()
        self.engine = ReportEngine(settings)
        self.rag = RAGService(settings)
        self.synthesis = SynthesisService(settings)
        self.monte_carlo = MonteCarloSimulator(
            n_sims=settings.monte_carlo_n_sims,
            gpu_enabled=settings.gpu_enabled,
        )

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

        # Monte Carlo simulation — runs async, uses GPU if available
        dev_density_score = min(development.application_count_500m / 20.0, 1.0)
        assessed_value = payload.list_price * self.settings.assessed_value_factor
        mc_result_raw = await self.monte_carlo.run(
            base_cost=engine_output.total_cost,
            property_tax_base=assessed_value * self.settings.property_tax_rate,
            flood_zone=flood.in_flood_zone,
            dev_density_score=dev_density_score,
            assessed_value=assessed_value,
            base_tax_rate=self.settings.property_tax_rate,
            tax_growth_base=self.settings.property_tax_growth_rate,
        )
        monte_carlo = MonteCarloResult(
            p10=mc_result_raw.p10,
            p50=mc_result_raw.p50,
            p90=mc_result_raw.p90,
            mean=mc_result_raw.mean,
            trajectories_sampled=mc_result_raw.trajectories_sampled,
            elapsed_ms=mc_result_raw.elapsed_ms,
        )

        # Map geometry
        map_geometry = MapGeometry(
            property_lat=location.latitude,
            property_lon=location.longitude,
            flood_polygon_geojson=flood.polygon_geojson,
            dev_pressure_radius_m=500,
        )

        law_context: list[str] = []
        if self.settings.rag_enabled and self.rag.is_ready():
            top_flags = [f.title for f in engine_output.flags[:2]]
            rag_query = f"{payload.address} {' '.join(top_flags)} land law Toronto Ontario property purchase"
            try:
                law_context = await self.rag.query(rag_query)
            except Exception:
                pass

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
            monte_carlo=monte_carlo,
            map_geometry=map_geometry,
            summary_text=await self.synthesis.synthesize(
                address=payload.address,
                list_price=payload.list_price,
                buyer_profile=payload.buyer_profile,
                engine_output=engine_output,
                heritage=heritage,
                flood=flood,
                development=development,
                law_context=law_context,
                monte_carlo=monte_carlo,
            ),
        )


@lru_cache
def get_report_service() -> ReportService:
    return ReportService(get_settings())
