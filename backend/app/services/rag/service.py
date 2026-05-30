import asyncio
from pathlib import Path

import httpx

from app.core.config import Settings
from app.services.rag.store import VectorStore


class RAGService:
    def __init__(self, settings: Settings) -> None:
        self.settings = settings
        self._store = VectorStore(Path(settings.rag_vector_store_path))

    def is_ready(self) -> bool:
        return self._store.count() > 0

    def store(self) -> VectorStore:
        return self._store

    async def query(self, text: str, n_results: int | None = None) -> list[str]:
        if not self.is_ready():
            return []
        n = n_results or self.settings.rag_n_results
        embedding = await self._embed(text)
        results = await asyncio.to_thread(
            self._store.query,
            query_embeddings=[embedding],
            n_results=n,
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
