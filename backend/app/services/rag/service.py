"""RAG service with NemoRetriever (primary) and ChromaDB (fallback)."""
import asyncio
import logging
from pathlib import Path

import chromadb
import httpx

from app.core.config import Settings

logger = logging.getLogger(__name__)
_COLLECTION_NAME = "land_laws"


class RAGService:
    """ChromaDB-backed RAG — always available as fallback."""

    def __init__(self, settings: Settings) -> None:
        self.settings = settings
        store_path = Path(settings.rag_vector_store_path)
        store_path.mkdir(parents=True, exist_ok=True)
        self._client = chromadb.PersistentClient(path=str(store_path))
        self._collection = self._client.get_or_create_collection(
            name=_COLLECTION_NAME,
            metadata={"hnsw:space": "cosine"},
        )
        self._nemo: _NemoRetriever | None = (
            _NemoRetriever(settings) if settings.nemo_retriever_enabled else None
        )

    def is_ready(self) -> bool:
        if self._nemo is not None:
            return True
        return self._collection.count() > 0

    def collection(self) -> chromadb.Collection:
        return self._collection

    async def query(self, text: str, n_results: int | None = None) -> list[str]:
        if self._nemo is not None:
            try:
                return await self._nemo.query(text, n_results)
            except Exception as exc:
                logger.warning("NemoRetriever failed (%s), falling back to ChromaDB", exc)

        return await self._chroma_query(text, n_results)

    async def _chroma_query(self, text: str, n_results: int | None = None) -> list[str]:
        if not self._collection.count():
            return []
        n = n_results or self.settings.rag_n_results
        embedding = await self._embed(text)
        results = await asyncio.to_thread(
            self._collection.query,
            query_embeddings=[embedding],
            n_results=min(n, self._collection.count()),
        )
        return [doc for doc in results.get("documents", [[]])[0] if doc]

    async def _embed(self, text: str) -> list[float]:
        async with httpx.AsyncClient(timeout=self.settings.nim_timeout_seconds) as client:
            resp = await client.post(
                f"{self.settings.nim_base_url}/embeddings",
                json={"model": self.settings.rag_embedding_model, "input": [text]},
            )
            resp.raise_for_status()
            return resp.json()["data"][0]["embedding"]


class _NemoRetriever:
    """NVIDIA NemoRetriever retrieval endpoint."""

    def __init__(self, settings: Settings) -> None:
        self._url = settings.nemo_retriever_url
        self._timeout = settings.nim_timeout_seconds

    async def query(self, text: str, n_results: int | None = None) -> list[str]:
        payload = {
            "query": text,
            "top_k": n_results or 3,
        }
        async with httpx.AsyncClient(timeout=self._timeout) as client:
            resp = await client.post(self._url, json=payload)
            resp.raise_for_status()
            data = resp.json()
        # NemoRetriever returns {"passages": [{"text": "..."}]} or {"results": [...]}
        passages = data.get("passages") or data.get("results") or []
        return [p.get("text") or p.get("content") or "" for p in passages if p]
