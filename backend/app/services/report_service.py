import asyncio
import json
from functools import lru_cache
from pathlib import Path

from app.core.config import Settings, get_settings
from app.schemas.debug import DevelopmentDebugResponse, FloodDebugResponse, GeocodeResponse, HeritageDebugResponse
from app.schemas.report import CompositeSignalOut, EvidenceSummary, ReportRequest, ReportResponse, ResolvedProperty, SignalOut
from app.services.data_sources.development import DevelopmentService
from app.services.data_sources.flood import FloodService
from app.services.data_sources.heritage import HCDService, HeritageService
from app.services.data_sources.building_health import BuildingHealthService
from app.services.data_sources.permits import ActivePermitsService, ClearedPermitsService
from app.services.engine.report_engine import EngineInput, ReportEngine
from app.services.geocoding.service import GeocodingService
from app.services.rag.service import RAGService
from app.services.synthesis.service import SynthesisService
from app.services.utils import slugify


class ReportService:
    def __init__(self, settings: Settings) -> None:
        self.settings = settings
        self.geocoder = GeocodingService(settings)
        self.heritage_service = HeritageService()
        self.hcd_service = HCDService()
        self.active_permits_service = ActivePermitsService()
        self.cleared_permits_service = ClearedPermitsService()
        self.building_health_service = BuildingHealthService()
        self.flood_service = FloodService(settings)
        self.development_service = DevelopmentService()
        self.engine = ReportEngine(settings)
        self.rag = RAGService(settings)
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
            status=flood.status,
            in_flood_zone=flood.in_flood_zone,
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

    def _load_demo_cache(self, address: str) -> dict | None:
        if not self.settings.demo_mode:
            return None
        cache_path = Path(self.settings.demo_cache_dir) / f"{slugify(address)}.json"
        if cache_path.exists():
            try:
                return json.loads(cache_path.read_text(encoding="utf-8"))
            except Exception:
                return None
        return None

    async def build_report(self, payload: ReportRequest) -> ReportResponse:
        warnings: list[str] = []
        location = await self.geocoder.geocode(payload.address)

        heritage, hcd, active_permits, cleared_permits, flood, development = await asyncio.gather(
            self.heritage_service.lookup(location),
            self.hcd_service.lookup(location),
            self.active_permits_service.lookup(location),
            self.cleared_permits_service.lookup(location),
            self.flood_service.lookup(location),
            self.development_service.lookup(location),
        )

        if "heuristic" in heritage.source:
            warnings.append("Heritage data fell back to heuristic — CKAN live dataset unavailable.")
        if "heuristic" in flood.source:
            warnings.append("Flood data fell back to heuristic — TRCA ArcGIS service unavailable.")
        if "heuristic" in development.source:
            warnings.append("Development pressure fell back to heuristic — CKAN live dataset unavailable.")
        if hcd.confidence == "UNKNOWN":
            warnings.append("Heritage Conservation District data unavailable — HCD check skipped.")
        if active_permits.confidence == "UNKNOWN":
            warnings.append("Active building permits data unavailable — permit check skipped.")
        if cleared_permits.confidence == "UNKNOWN":
            warnings.append("Cleared building permits data unavailable — permit history check skipped.")

        building_health = await self.building_health_service.lookup(
            location, active_permits=active_permits, cleared_permits=cleared_permits
        )

        engine_output = self.engine.build(
            EngineInput(
                list_price=payload.list_price,
                buyer_profile=payload.buyer_profile,
                property_type=payload.property_type,
                down_payment_percent=payload.down_payment_percent,
                mortgage_rate=payload.mortgage_rate,
                amortization_years=payload.amortization_years,
                address=payload.address,
                heritage=heritage,
                hcd=hcd,
                active_permits=active_permits,
                cleared_permits=cleared_permits,
                building_health=building_health,
                flood=flood,
                development=development,
            )
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
            verdict_level=engine_output.verdict_level,
            verdict_headline=engine_output.verdict_headline,
            true_10_year_cost=engine_output.total_cost,
            cost_breakdown=engine_output.components,
            mortgage_scenarios=engine_output.scenarios,
            flags=engine_output.flags,
            warnings=warnings,
            signals=[SignalOut(**s) for s in engine_output.signals],
            composite_signals=[CompositeSignalOut(**s) for s in engine_output.composite_signals],
            evidence_summary=EvidenceSummary(
                geocoder={
                    "source": location.source,
                    "raw_display_name": location.raw_display_name,
                },
                heritage={
                    "status": heritage.status,
                    "reason": heritage.reason,
                    "source": heritage.source,
                    "confidence": heritage.confidence,
                },
                hcd={
                    "in_district": hcd.in_district,
                    "district_name": hcd.district_name,
                    "source": hcd.source,
                    "confidence": hcd.confidence,
                },
                active_permits={
                    "permit_count": active_permits.permit_count,
                    "structural_count": active_permits.structural_count,
                    "elevated_risk_count": active_permits.elevated_risk_count,
                    "top_work_types": active_permits.top_work_types,
                    "confidence": active_permits.confidence,
                    "source": active_permits.source,
                },
                cleared_permits={
                    "permit_count": cleared_permits.permit_count,
                    "structural_count": cleared_permits.structural_count,
                    "structural_last_10y": cleared_permits.structural_last_10y,
                    "years_since_last_permit": cleared_permits.years_since_last_permit,
                    "deferred_maintenance": cleared_permits.deferred_maintenance,
                    "chronic_issues": cleared_permits.chronic_issues,
                    "confidence": cleared_permits.confidence,
                    "source": cleared_permits.source,
                },
                property_tax=engine_output.property_tax_meta,
                building_health={
                    "path": building_health.path,
                    "status": building_health.status,
                    "score": building_health.score,
                    "message": building_health.message,
                    "disclaimer": building_health.disclaimer,
                    "confidence": building_health.confidence,
                    "source": building_health.source,
                },
                flood={
                    "status": flood.status,
                    "in_flood_zone": flood.in_flood_zone,
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
                law_context=law_context,
            ),
        )


@lru_cache
def get_report_service() -> ReportService:
    return ReportService(get_settings())
