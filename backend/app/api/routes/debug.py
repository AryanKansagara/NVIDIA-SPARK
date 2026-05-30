from fastapi import APIRouter, Depends, Query

from app.schemas.debug import DevelopmentDebugResponse, FloodDebugResponse, GeocodeResponse, HeritageDebugResponse
from app.services.report_service import ReportService, get_report_service

router = APIRouter()


@router.get("/geocode", response_model=GeocodeResponse)
async def debug_geocode(
    address: str = Query(..., min_length=3),
    service: ReportService = Depends(get_report_service),
) -> GeocodeResponse:
    return await service.geocode_address(address)


@router.get("/heritage", response_model=HeritageDebugResponse)
async def debug_heritage(
    address: str = Query(..., min_length=3),
    service: ReportService = Depends(get_report_service),
) -> HeritageDebugResponse:
    return await service.debug_heritage(address)


@router.get("/flood", response_model=FloodDebugResponse)
async def debug_flood(
    address: str = Query(..., min_length=3),
    service: ReportService = Depends(get_report_service),
) -> FloodDebugResponse:
    return await service.debug_flood(address)


@router.get("/development", response_model=DevelopmentDebugResponse)
async def debug_development(
    address: str = Query(..., min_length=3),
    service: ReportService = Depends(get_report_service),
) -> DevelopmentDebugResponse:
    return await service.debug_development(address)
