"""
Meridian RAG — service layer.

Manages the index lifecycle:
  • On first startup, fetches all sources and builds the ChromaDB index.
  • On subsequent startups, loads the persisted index (fast, no re-fetching).
  • Exposes a single async function `retrieve()` used by Agent 4 synthesis.

Embeddings (both indexing and querying) go through NVIDIA NIM — see
app.rag.embeddings. Integrated into FastAPI lifespan (see app/main.py).
"""

from __future__ import annotations

import asyncio
import logging
from pathlib import Path
from typing import Any

import httpx

from app.rag.embeddings import embed_texts
from app.rag.fetcher import fetch_source
from app.rag.sources import SOURCES, RagSource
from app.rag.store import (
    DEFAULT_PERSIST_DIR,
    build_store,
    load_store,
    query_store,
)

logger = logging.getLogger(__name__)

# Module-level singleton — set during lifespan startup
_collection = None


# ── Public API ────────────────────────────────────────────────────────────────

async def startup(force_rebuild: bool = False, persist_dir: Path = DEFAULT_PERSIST_DIR) -> None:
    """
    Call this from your FastAPI lifespan on application startup.

    If the index already exists on disk and force_rebuild is False,
    it loads instantly without any HTTP requests.

    If the index is absent or force_rebuild is True, it fetches all
    sources concurrently (bounded concurrency to be polite to gov sites)
    and builds the ChromaDB collection (embedding via NIM).
    """
    global _collection

    index_exists = (persist_dir / "chroma.sqlite3").exists()

    if index_exists and not force_rebuild:
        logger.info("RAG: loading existing index from %s", persist_dir)
        _collection = load_store(persist_dir)
        count = _collection.count()
        logger.info("RAG: index ready — %d chunks", count)
        return

    logger.info("RAG: building index from %d sources (this runs once)…", len(SOURCES))
    documents = await _fetch_all_sources()
    _collection = await build_store(documents, persist_dir=persist_dir, force_rebuild=force_rebuild)
    logger.info("RAG: index built and persisted to %s", persist_dir)


async def retrieve(
    query: str,
    n_results: int = 6,
    filter_tags: list[str] | None = None,
) -> list[dict[str, Any]]:
    """
    Semantic retrieval against the legislative knowledge base.

    Args:
        query: the natural language question (agent will pass its full query).
        n_results: number of chunks to return (6 is a good default for a
                   ~1500-token context budget in the synthesis prompt).
        filter_tags: optional tag filter to narrow retrieval domain.
                     e.g. ["heritage"] for heritage-specific questions,
                     ["first_time_buyer"] for buyer program questions.

    Returns:
        List of chunk dicts (text, source_name, url, tags, distance).
        Returns [] if index not ready — caller degrades gracefully.
    """
    if _collection is None:
        logger.warning("RAG: retrieve() called before startup() — returning empty")
        return []

    query_embedding = (await embed_texts([query]))[0]
    return await asyncio.to_thread(
        query_store,
        _collection,
        query_embedding,
        n_results,
        filter_tags,
    )


def is_ready() -> bool:
    """True if the index has been loaded and is queryable."""
    return _collection is not None


# ── Internal helpers ──────────────────────────────────────────────────────────

async def _fetch_all_sources(
    concurrency: int = 3,
) -> list[tuple[RagSource, str]]:
    """
    Fetch all SOURCES with bounded concurrency (semaphore = 3).
    Gov/TRCA endpoints are rate-sensitive; 3 concurrent is polite.
    """
    semaphore = asyncio.Semaphore(concurrency)

    async def _bounded_fetch(
        source: RagSource, client: httpx.AsyncClient
    ) -> tuple[RagSource, str]:
        async with semaphore:
            text = await fetch_source(source, client)
            return source, text or ""

    async with httpx.AsyncClient() as client:
        tasks = [_bounded_fetch(src, client) for src in SOURCES]
        results = await asyncio.gather(*tasks, return_exceptions=False)

    return [(src, text) for src, text in results if text]
