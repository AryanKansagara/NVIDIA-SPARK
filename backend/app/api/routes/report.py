from fastapi import APIRouter, Depends, HTTPException, status

from app.schemas.report import ReportRequest, ReportResponse
from app.services.report_service import ReportService, get_report_service
from app.services.geocoding.service import GeocodingError

router = APIRouter()


@router.post("/report", response_model=ReportResponse)
async def create_report(
    payload: ReportRequest,
    service: ReportService = Depends(get_report_service),
) -> ReportResponse:
    try:
        return await service.build_report(payload)
    except GeocodingError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e),
        )


@router.get("/report/suggest")
async def suggest_address(
    q: str,
    service: ReportService = Depends(get_report_service),
) -> list[dict]:
    return await service.suggest_address(q)
