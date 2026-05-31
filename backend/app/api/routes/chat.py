import asyncio
from functools import lru_cache

from fastapi import APIRouter
from pydantic import BaseModel

from app.core.config import Settings, get_settings
from app.services.memory.memory_service import MemoryService
from app.services.rag.service import get_rag_service
from app.services.web.search import WebSearchService

router = APIRouter()


@lru_cache
def _memory() -> MemoryService:
    return MemoryService(get_settings())


# Shared, process-wide RAG instance (see rag.service.get_rag_service).
_rag = get_rag_service


@lru_cache
def _web() -> WebSearchService:
    return WebSearchService(get_settings())


class ChatRequest(BaseModel):
    session_id: str
    message: str
    web_search: bool = False
    report_context: str | None = None


class Source(BaseModel):
    text: str
    source: str
    score: float | None = None


class ChatResponse(BaseModel):
    reply: str
    sources: list[Source] = []


@router.post("/chat", response_model=ChatResponse)
async def chat(req: ChatRequest) -> ChatResponse:
    settings: Settings = get_settings()
    passages = []
    if settings.rag_enabled and _rag().is_ready():
        try:
            passages = await _rag().query_grounded(req.message)
        except Exception:
            passages = []

    sources = [Source(text=p.text, source=p.source, score=p.score) for p in passages]

    web_context: list[str] = []
    if req.web_search and settings.web_search_enabled:
        results = await _web().search(req.message)
        web_context = [r.as_context() for r in results]
        sources.extend(
            Source(text=f"{r.title} — {r.snippet}", source=r.url) for r in results
        )

    law_context = [p.text for p in passages]
    reply = await _memory().chat(
        req.session_id, req.message, law_context, web_context, req.report_context
    )
    # Extract durable facts in the background — don't block the reply.
    asyncio.create_task(_memory().remember(req.message))
    return ChatResponse(reply=reply, sources=sources)
