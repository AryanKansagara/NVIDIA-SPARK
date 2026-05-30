from functools import lru_cache

from app.core.config import Settings, get_settings
from app.schemas.debug import DevelopmentDebugResponse, FloodDebugResponse, GeocodeResponse, HeritageDebugResponse
from app.schemas.report import (
    CommunityInsight,
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

    def _community_insights(
        self,
        list_price: float,
        transit_dividend: int,
        development,
        flood,
    ) -> CommunityInsight:
        """Deterministic heuristic estimate of surrounding-community pricing.

        Anchors comparables to the subject list price, then adjusts for the
        location signals already gathered (transit access, development pressure,
        flood exposure). Intended as a directional preview, not an appraisal.
        """
        downtown = transit_dividend >= self.settings.transit_dividend_downtown
        # Comparable median is anchored near list price; downtown blocks tend to
        # price a touch above a single listing, suburban a touch below.
        median = list_price * (1.04 if downtown else 0.97)

        # Development pressure widens the spread (more redevelopment churn).
        spread = 0.10 if development.intensity == "low" else 0.14 if development.intensity == "medium" else 0.18
        low = round(median * (1 - spread))
        high = round(median * (1 + spread))

        # $/sqft proxy: downtown condos run higher per-foot than suburban homes.
        psf = 1150 if downtown else 720
        if development.intensity == "high":
            psf = round(psf * 1.05)

        trend = (
            "rising"
            if development.intensity == "high"
            else "stable" if development.intensity == "medium" else "cooling"
        )

        def _fmt(v: float) -> str:
            return f"${round(v):,}"

        notes = [
            f"Comparable listings within 500 m cluster around {_fmt(low)}–{_fmt(high)} "
            f"(median ≈ {_fmt(median)}).",
            f"Estimated price per sq ft for this pocket: ~${psf:,}.",
        ]
        if downtown:
            notes.append("Strong transit access supports a pricing premium versus car-dependent areas.")
        else:
            notes.append("Car-dependent location — pricing tracks the broader suburban market.")
        if development.intensity in ("medium", "high"):
            notes.append(
                f"{development.application_count_500m} nearby development applications signal "
                f"{'active' if development.intensity == 'high' else 'moderate'} redevelopment — "
                "comparables may re-rate quickly."
            )
        if flood.in_flood_zone:
            notes.append("Flood-zone exposure can discount comparables 3–8% versus dry equivalents nearby.")

        return CommunityInsight(
            headline="Surrounding community pricing (within 500 m)",
            median_estimate=round(median),
            typical_range_low=low,
            typical_range_high=high,
            price_per_sqft_estimate=psf,
            trend=trend,
            notes=notes,
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

        # Map geometry (+ surrounding-community pricing insights)
        community = self._community_insights(
            list_price=payload.list_price,
            transit_dividend=engine_output.key_numbers.transit_dividend,
            development=development,
            flood=flood,
        )
        map_geometry = MapGeometry(
            property_lat=location.latitude,
            property_lon=location.longitude,
            flood_polygon_geojson=flood.polygon_geojson,
            dev_pressure_radius_m=500,
            community_insights=community,
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
