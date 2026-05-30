import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI

from app.api.router import api_router
from app.core.config import get_settings
from app.rag import rag_startup

logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Build/load the legislative RAG index. Fail-safe: if NIM or the network
    # is unavailable the server still boots — RAG just reports not-ready and
    # reports degrade gracefully without law context.
    if get_settings().rag_enabled:
        try:
            await rag_startup()
        except Exception as exc:  # noqa: BLE001 — never block startup on RAG
            logger.warning("RAG startup failed; continuing without it: %s", exc)
    yield


app = FastAPI(
    title="Meridian Backend",
    version="0.1.0",
    description="Backend API for Meridian true cost of ownership reports.",
    lifespan=lifespan,
)

app.include_router(api_router, prefix="/api/v1")
