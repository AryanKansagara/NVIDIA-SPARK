from fastapi import APIRouter

from app.api.routes import debug, health, pipeline, report

api_router = APIRouter()
api_router.include_router(health.router, tags=["health"])
api_router.include_router(report.router, tags=["report"])
api_router.include_router(pipeline.router, tags=["pipeline"])
api_router.include_router(debug.router, prefix="/debug", tags=["debug"])
