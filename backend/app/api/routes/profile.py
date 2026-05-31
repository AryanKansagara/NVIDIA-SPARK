from typing import Any

from fastapi import APIRouter, Body, HTTPException

from app.core.config import get_settings
from app.schemas.profile import ProfileIn, ProfileOut, SaveReportResponse, SavedReportSummary
from app.services.storage.app_store import get_app_store

router = APIRouter()


def _store():
    return get_app_store(get_settings().duckdb_path)


@router.get("/profile", response_model=ProfileOut)
async def get_profile() -> ProfileOut:
    profile = _store().get_profile()
    return ProfileOut(**(profile or {}))


@router.put("/profile", response_model=ProfileOut)
async def put_profile(profile: ProfileIn) -> ProfileOut:
    saved = _store().upsert_profile(
        profile.name, profile.email, profile.phone, profile.monthly_income
    )
    return ProfileOut(**saved)


@router.post("/reports/save", response_model=SaveReportResponse)
async def save_report(report: dict[str, Any] = Body(...)) -> SaveReportResponse:
    report_id = _store().save_report(report)
    return SaveReportResponse(report_id=report_id)


@router.get("/reports", response_model=list[SavedReportSummary])
async def list_reports() -> list[SavedReportSummary]:
    return [SavedReportSummary(**r) for r in _store().list_reports()]


@router.get("/reports/{report_id}")
async def get_report(report_id: str) -> dict[str, Any]:
    report = _store().get_report(report_id)
    if report is None:
        raise HTTPException(status_code=404, detail="Report not found")
    return report


@router.delete("/reports/{report_id}", status_code=204)
async def delete_report(report_id: str) -> None:
    deleted = _store().delete_report(report_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Report not found")
