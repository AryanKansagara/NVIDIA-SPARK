import asyncio
import time
from functools import lru_cache

from app.core.config import Settings, get_settings
from app.schemas.debug import DevelopmentDebugResponse, FloodDebugResponse, GeocodeResponse, HeritageDebugResponse
from app.schemas.report import (
    CommunityInsight,
    EvidenceSummary,
    MapGeometry,
    MonteCarloResult,
    PipelineStep,
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
from app.services.storage.app_store import get_app_store
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

    async def _build_engine(self, payload, heritage, flood, development):
        return self.engine.build(
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

    async def build_report(self, payload: ReportRequest) -> ReportResponse:
        warnings: list[str] = []
        trace: list[PipelineStep] = []
        t_start = time.perf_counter()

        def _ms() -> float:
            return round((time.perf_counter() - t_start) * 1000, 1)

        async def _timed(name: str, group: int, coro):
            started = _ms()
            result = await coro
            trace.append(
                PipelineStep(
                    name=name, started_ms=started, elapsed_ms=round(_ms() - started, 1),
                    parallel_group=group,
                )
            )
            return result

        # Group 0: geocode (everything downstream depends on it)
        location = await _timed("geocode", 0, self.geocoder.geocode(payload.address))

        # Group 1: three data-source agents run concurrently
        heritage, flood, development = await asyncio.gather(
            _timed("heritage", 1, self.heritage_service.lookup(location)),
            _timed("flood", 1, self.flood_service.lookup(location)),
            _timed("development", 1, self.development_service.lookup(location)),
        )

        if "heuristic" in heritage.source:
            warnings.append("Heritage data fell back to heuristic — CKAN live dataset unavailable.")
        if "heuristic" in flood.source:
            warnings.append("Flood data fell back to heuristic — TRCA ArcGIS service unavailable.")
        if "heuristic" in development.source:
            warnings.append("Development pressure fell back to heuristic — CKAN live dataset unavailable.")

        # Group 2: deterministic engine
        engine_output = await _timed(
            "engine",
            2,
            self._build_engine(payload, heritage, flood, development),
        )

        # Group 3: GPU Monte Carlo — single pass, 5/10/15-year horizons
        dev_density_score = min(development.application_count_500m / 20.0, 1.0)
        assessed_value = payload.list_price * self.settings.assessed_value_factor
        base_costs = {int(k.rstrip("y")): v for k, v in engine_output.horizon_totals.items()}
        mc_raw = await _timed(
            "monte_carlo",
            3,
            self.monte_carlo.run(
                base_costs=base_costs,
                flood_zone=flood.in_flood_zone,
                dev_density_score=dev_density_score,
                assessed_value=assessed_value,
                base_tax_rate=self.settings.property_tax_rate,
                tax_growth_base=self.settings.property_tax_growth_rate,
            ),
        )
        monte_carlo_horizons = {
            horizon: MonteCarloResult(
                p10=r.p10, p50=r.p50, p90=r.p90, mean=r.mean,
                trajectories_sampled=r.trajectories_sampled, elapsed_ms=r.elapsed_ms,
            )
            for horizon, r in mc_raw.items()
        }
        monte_carlo = monte_carlo_horizons.get("10y")

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

        # Group 4: RAG land-law grounding (local Nemotron RAG embeddings)
        async def _run_rag() -> list[str]:
            if self.settings.rag_enabled and self.rag.is_ready():
                top_flags = [f.title for f in engine_output.flags[:2]]
                rag_query = f"{payload.address} {' '.join(top_flags)} land law Toronto Ontario property purchase"
                try:
                    return await self.rag.query(rag_query)
                except Exception:
                    return []
            return []

        law_context = await _timed("rag", 4, _run_rag())

        # Group 5: synthesis (local Nemotron LLM)
        summary_text = await _timed(
            "synthesis",
            5,
            self.synthesis.synthesize(
                address=payload.address,
                list_price=payload.list_price,
                buyer_profile=payload.buyer_profile,
                engine_output=engine_output,
                heritage=heritage,
                flood=flood,
                development=development,
                law_context=law_context,
                monte_carlo=monte_carlo,
                horizons=monte_carlo_horizons,
                profile=get_app_store(self.settings.duckdb_path).get_profile(),
            ),
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
            monte_carlo=monte_carlo,
            monte_carlo_horizons=monte_carlo_horizons,
            horizon_costs=engine_output.horizon_totals,
            map_geometry=map_geometry,
            pipeline_trace=sorted(trace, key=lambda s: s.started_ms),
            summary_text=summary_text,
        )


@lru_cache
def get_report_service() -> ReportService:
    return ReportService(get_settings())
