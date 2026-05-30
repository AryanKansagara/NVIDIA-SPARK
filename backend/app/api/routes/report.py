from fastapi import APIRouter, Depends

from app.schemas.report import ReportRequest, ReportResponse
from app.services.report_service import ReportService, get_report_service

router = APIRouter()


@router.post("/report", response_model=ReportResponse)
async def create_report(
    payload: ReportRequest,
    service: ReportService = Depends(get_report_service),
) -> ReportResponse:
    return await service.build_report(payload)
