"""
Meridian RAG — NVIDIA NIM embeddings.

The RAG index embeds documents and queries through the same NIM
``/embeddings`` endpoint the rest of the backend already uses, so the
whole stack stays on the local GB10/NIM deployment (no extra model
dependency such as sentence-transformers).

The payload mirrors the original ``app.services.rag.ingest._embed_batch``:
NIM's embedqa model does not require a per-call ``input_type``, so the same
path is correct for both indexing (passages) and querying.
"""

from __future__ import annotations

import httpx

from app.core.config import get_settings


async def embed_texts(texts: list[str], batch_size: int = 32) -> list[list[float]]:
    """Embed a list of texts via the NIM ``/embeddings`` endpoint.

    Batches requests (default 32) to stay within NIM payload limits and
    preserves input order via the response ``index`` field.
    """
    if not texts:
        return []

    settings = get_settings()
    out: list[list[float]] = []
    async with httpx.AsyncClient(timeout=settings.nim_timeout_seconds) as client:
        for start in range(0, len(texts), batch_size):
            batch = texts[start : start + batch_size]
            resp = await client.post(
                f"{settings.nim_base_url}/embeddings",
                json={"model": settings.rag_embedding_model, "input": batch},
            )
            resp.raise_for_status()
            data = sorted(resp.json()["data"], key=lambda item: item["index"])
            out.extend(item["embedding"] for item in data)
    return out
