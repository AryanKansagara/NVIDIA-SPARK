import asyncio
from pathlib import Path

import chromadb
import httpx

from app.core.config import Settings

_COLLECTION_NAME = "land_laws"


class RAGService:
    def __init__(self, settings: Settings) -> None:
        self.settings = settings
        store_path = Path(settings.rag_vector_store_path)
        store_path.mkdir(parents=True, exist_ok=True)
        self._client = chromadb.PersistentClient(path=str(store_path))
        self._collection = self._client.get_or_create_collection(
            name=_COLLECTION_NAME,
            metadata={"hnsw:space": "cosine"},
        )

    def is_ready(self) -> bool:
        return self._collection.count() > 0

    def collection(self) -> chromadb.Collection:
        return self._collection

    async def query(self, text: str, n_results: int | None = None) -> list[str]:
        if not self.is_ready():
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
