"""Long-term episodic memory — ChromaDB collection embedded via the local
Nemotron RAG embedding server (:8081). Single implicit local user, no auth.
"""
from __future__ import annotations

import asyncio
import logging
import time
import uuid
from pathlib import Path

import chromadb
import httpx

from app.core.config import Settings

logger = logging.getLogger(__name__)
_COLLECTION_NAME = "user_memories"


class EpisodicStore:
    def __init__(self, settings: Settings) -> None:
        self.settings = settings
        store_path = Path(settings.rag_vector_store_path)
        store_path.mkdir(parents=True, exist_ok=True)
        self._client = chromadb.PersistentClient(path=str(store_path))
        self._collection = self._client.get_or_create_collection(
            name=_COLLECTION_NAME,
            metadata={"hnsw:space": "cosine"},
        )

    async def _embed(self, text: str) -> list[float]:
        async with httpx.AsyncClient(timeout=self.settings.nim_timeout_seconds) as client:
            resp = await client.post(
                f"{self.settings.embedding_local_url}/embeddings",
                json={"model": self.settings.rag_embedding_model, "input": [text]},
            )
            resp.raise_for_status()
            return resp.json()["data"][0]["embedding"]

    async def add(self, fact: str) -> None:
        try:
            embedding = await self._embed(fact)
        except Exception as exc:
            logger.warning("Episodic embed failed (%s) — memory not stored", exc)
            return
        await asyncio.to_thread(
            self._collection.upsert,
            ids=[uuid.uuid4().hex[:16]],
            documents=[fact],
            embeddings=[embedding],
            metadatas=[{"ts": time.time()}],
        )

    async def recall(self, query: str, n_results: int = 5) -> list[str]:
        if not self._collection.count():
            return []
        try:
            embedding = await self._embed(query)
        except Exception:
            return []
        results = await asyncio.to_thread(
            self._collection.query,
            query_embeddings=[embedding],
            n_results=min(n_results, self._collection.count()),
        )
        return [doc for doc in results.get("documents", [[]])[0] if doc]
