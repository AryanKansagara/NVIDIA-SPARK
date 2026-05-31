from fastapi import APIRouter

from app.api.routes import chat, debug, health, pipeline, profile, report

api_router = APIRouter()
api_router.include_router(health.router, tags=["health"])
api_router.include_router(report.router, tags=["report"])
api_router.include_router(pipeline.router, tags=["pipeline"])
api_router.include_router(profile.router, tags=["profile"])
api_router.include_router(chat.router, tags=["chat"])
api_router.include_router(debug.router, prefix="/debug", tags=["debug"])
