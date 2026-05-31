"""RAG service: local NeMo Retriever embeddings (ChromaDB vector store) +
optional local NVIDIA reranker. Fully on-device — no hosted API.

Pipeline: query -> embed (:8081) -> vector search (ChromaDB, over-fetch
candidate_k) -> rerank (:8082, optional) -> top n_results grounded passages.
Every stage degrades gracefully so the report/chat still render if a model
server is down.
"""
import asyncio
import logging
from dataclasses import dataclass
from pathlib import Path

import chromadb
import httpx

from app.core.config import Settings

logger = logging.getLogger(__name__)
_COLLECTION_NAME = "land_laws"


@dataclass
class Passage:
    """A grounded retrieval result with provenance for frontend citations."""

    text: str
    source: str
    score: float | None = None


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
        self._reranker = _Reranker(settings) if settings.rag_rerank_enabled else None

    def is_ready(self) -> bool:
        if self._nemo is not None:
            return True
        return self._collection.count() > 0

    def collection(self) -> chromadb.Collection:
        return self._collection

    async def query(self, text: str, n_results: int | None = None) -> list[str]:
        """Back-compat: return plain passage strings (used by report synthesis)."""
        passages = await self.query_grounded(text, n_results)
        return [p.text for p in passages]

    async def query_grounded(self, text: str, n_results: int | None = None) -> list[Passage]:
        """Return reranked, source-tagged passages for grounded answers + citations."""
        n = n_results or self.settings.rag_n_results

        if self._nemo is not None:
            try:
                return await self._nemo.query(text, n)
            except Exception as exc:
                logger.warning("NemoRetriever failed (%s), falling back to ChromaDB", exc)

        candidates = await self._chroma_candidates(text)
        if not candidates:
            return []

        if self._reranker is not None and len(candidates) > 1:
            try:
                candidates = await self._reranker.rerank(text, candidates)
            except Exception as exc:
                logger.warning("Reranker unavailable (%s) — using vector order", exc)

        return candidates[:n]

    async def _chroma_candidates(self, text: str) -> list[Passage]:
        if not self._collection.count():
            return []
        k = min(self.settings.rag_candidate_k, self._collection.count())
        embedding = await self._embed(text)
        results = await asyncio.to_thread(
            self._collection.query,
            query_embeddings=[embedding],
            n_results=k,
        )
        docs = results.get("documents", [[]])[0]
        metas = results.get("metadatas", [[]])[0] or [{}] * len(docs)
        out: list[Passage] = []
        for doc, meta in zip(docs, metas):
            if doc:
                out.append(Passage(text=doc, source=(meta or {}).get("source", "land_laws")))
        return out

    async def _embed(self, text: str) -> list[float]:
        async with httpx.AsyncClient(timeout=self.settings.nim_timeout_seconds) as client:
            resp = await client.post(
                f"{self.settings.embedding_local_url}/embeddings",
                json={"model": self.settings.rag_embedding_model, "input": [text]},
            )
            resp.raise_for_status()
            return resp.json()["data"][0]["embedding"]


class _Reranker:
    """Local NVIDIA reranker (vLLM `--task score`, OpenAI-compatible /rerank)."""

    def __init__(self, settings: Settings) -> None:
        self._url = settings.rerank_url.rstrip("/")
        self._model = settings.rerank_model
        self._timeout = settings.nim_timeout_seconds

    async def rerank(self, query: str, passages: list[Passage]) -> list[Passage]:
        payload = {
            "model": self._model,
            "query": query,
            "documents": [p.text for p in passages],
        }
        async with httpx.AsyncClient(timeout=self._timeout) as client:
            resp = await client.post(f"{self._url}/rerank", json=payload)
            resp.raise_for_status()
            data = resp.json()
        # vLLM/NIM rerank: {"results": [{"index": i, "relevance_score": s}, ...]}
        results = data.get("results") or data.get("data") or []
        ordered: list[Passage] = []
        for r in results:
            idx = r.get("index")
            if idx is None or idx >= len(passages):
                continue
            p = passages[idx]
            ordered.append(Passage(text=p.text, source=p.source, score=r.get("relevance_score")))
        return ordered or passages


class _NemoRetriever:
    """NVIDIA NemoRetriever retrieval endpoint."""

    def __init__(self, settings: Settings) -> None:
        self._url = settings.nemo_retriever_url
        self._timeout = settings.nim_timeout_seconds

    async def query(self, text: str, n_results: int | None = None) -> list[Passage]:
        payload = {"query": text, "top_k": n_results or 3}
        async with httpx.AsyncClient(timeout=self._timeout) as client:
            resp = await client.post(self._url, json=payload)
            resp.raise_for_status()
            data = resp.json()
        passages = data.get("passages") or data.get("results") or []
        out: list[Passage] = []
        for p in passages:
            if not p:
                continue
            out.append(
                Passage(
                    text=p.get("text") or p.get("content") or "",
                    source=p.get("source") or "nemo-retriever",
                    score=p.get("score"),
                )
            )
        return out
