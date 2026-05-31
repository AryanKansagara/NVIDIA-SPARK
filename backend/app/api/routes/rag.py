"""RAG admin: re-index the land-law PDFs without restarting the server.

Drop a PDF into data/land_laws/ then POST /api/v1/rag/reload. Ingestion runs
in-process against the shared RAG collection, so new chunks are immediately
queryable by chat and reports — no restart needed.
"""
from pathlib import Path

from fastapi import APIRouter
from pydantic import BaseModel

from app.core.config import get_settings
from app.services.rag.ingest import ingest_directory
from app.services.rag.service import get_rag_service

router = APIRouter()


class RagReloadResponse(BaseModel):
    chunks_indexed: int
    collection_count: int
    backend: str
    pdfs: list[str]


@router.post("/rag/reload", response_model=RagReloadResponse)
async def rag_reload() -> RagReloadResponse:
    settings = get_settings()
    rag = get_rag_service()
    law_dir = Path(settings.rag_land_laws_dir)

    chunks = await ingest_directory(law_dir, settings, rag.collection())
    # If cuVS is the active backend, force its GPU index to rebuild from the
    # refreshed collection on the next query.
    rag._cuvs_built = False
    rag._cuvs = None

    pdfs = sorted(p.name for p in law_dir.glob("*.pdf"))
    return RagReloadResponse(
        chunks_indexed=chunks,
        collection_count=rag.collection().count(),
        backend=settings.vector_backend,
        pdfs=pdfs,
    )


@router.get("/rag/status", response_model=RagReloadResponse)
async def rag_status() -> RagReloadResponse:
    settings = get_settings()
    rag = get_rag_service()
    law_dir = Path(settings.rag_land_laws_dir)
    pdfs = sorted(p.name for p in law_dir.glob("*.pdf"))
    return RagReloadResponse(
        chunks_indexed=0,
        collection_count=rag.collection().count(),
        backend=settings.vector_backend,
        pdfs=pdfs,
    )
