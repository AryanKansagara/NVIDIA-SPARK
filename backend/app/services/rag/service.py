"""
Adapter over the legislative RAG engine (``app.rag``).

Preserves the original ``RAGService.query() -> list[str]`` interface so the
report/synthesis pipeline is unchanged, while delegating retrieval to the new
tag-filtered engine. The index lifecycle is owned by ``app.rag`` (built/loaded
in the FastAPI lifespan); this class is a thin, per-request facade.
"""

from __future__ import annotations

from app.core.config import Settings
from app.rag import is_ready, retrieve
from app.rag.prompt import ReportSignals, detect_tags


class RAGService:
    def __init__(self, settings: Settings) -> None:
        self.settings = settings

    def is_ready(self) -> bool:
        # The ``rag_enabled`` flag is the single switch: when off, RAG is never
        # ready regardless of whether an index happens to be loaded.
        return self.settings.rag_enabled and is_ready()

    async def query(
        self,
        text: str,
        n_results: int | None = None,
        signals: ReportSignals | None = None,
    ) -> list[str]:
        """Retrieve legislative chunks for ``text``.

        When ``signals`` is provided, retrieval is narrowed to the relevant
        knowledge domains via ``detect_tags`` (heritage → Heritage Act, first-time
        buyer → FHSA/RRSP, etc.). Returns the chunk texts as a plain list of
        strings — the existing synthesis contract.
        """
        if not self.settings.rag_enabled:
            return []
        filter_tags = detect_tags(signals) if signals else None
        hits = await retrieve(
            text,
            n_results=n_results or self.settings.rag_n_results,
            filter_tags=filter_tags,
        )
        return [hit["text"] for hit in hits]
