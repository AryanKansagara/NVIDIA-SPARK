"""
Meridian RAG — ChromaDB vector store.

ChromaDB is already declared in pyproject.toml (chromadb>=0.5.0).
Embeddings are produced by NVIDIA NIM (see app.rag.embeddings) so the
whole stack stays on the local GB10/NIM deployment — no sentence-transformers
or other embedding dependency is required.

Documents and query vectors are computed explicitly and passed to ChromaDB
(rather than registering a Chroma embedding_function), which keeps indexing
and retrieval on the exact same async NIM path.

Persistence path: backend/data/rag_index  (created automatically).
"""

from __future__ import annotations

import asyncio
import logging
import os
from pathlib import Path
from typing import Any

import chromadb

from app.rag.embeddings import embed_texts
from app.rag.sources import RagSource, TAG_INDEX

logger = logging.getLogger(__name__)

# ── Constants ─────────────────────────────────────────────────────────────────

COLLECTION_NAME = "meridian_legislative"

# Adjust this path relative to your project root; or override via env var.
DEFAULT_PERSIST_DIR = Path(
    os.getenv("RAG_PERSIST_DIR", "data/rag_index")
).resolve()

# Chunk tuning — legal text is dense; 400 chars ≈ ~1 paragraph of statute.
CHUNK_SIZE = 400        # characters (not tokens — simple, no tokenizer dep)
CHUNK_OVERLAP = 60

# Retrieval
DEFAULT_N_RESULTS = 6   # fetch 6 diverse chunks per query


# ── Chunker ───────────────────────────────────────────────────────────────────

def _chunk_text(text: str, chunk_size: int = CHUNK_SIZE, overlap: int = CHUNK_OVERLAP) -> list[str]:
    """
    Simple sliding-window chunker that respects paragraph boundaries.
    Prefers splitting on double-newline, falls back to single-newline,
    falls back to hard cut at chunk_size.
    """
    paragraphs = [p.strip() for p in text.split("\n\n") if p.strip()]
    chunks: list[str] = []
    current = ""

    for para in paragraphs:
        # If adding this paragraph still fits, append it
        if len(current) + len(para) + 2 <= chunk_size:
            current = (current + "\n\n" + para).strip()
        else:
            # Flush current chunk
            if current:
                chunks.append(current)
            # If the paragraph itself is longer than chunk_size, hard-split it
            if len(para) > chunk_size:
                for i in range(0, len(para), chunk_size - overlap):
                    sub = para[i : i + chunk_size]
                    if sub.strip():
                        chunks.append(sub.strip())
                current = ""
            else:
                current = para

    if current:
        chunks.append(current)

    return chunks


# ── Collection helpers ────────────────────────────────────────────────────────

def _open_collection(persist_dir: Path, *, create: bool) -> chromadb.Collection:
    """Open (or create) the persisted ChromaDB collection.

    No embedding_function is registered — vectors are supplied explicitly by
    the caller via the NIM embedding path.
    """
    client = chromadb.PersistentClient(path=str(persist_dir))
    if create:
        return client.get_or_create_collection(
            name=COLLECTION_NAME,
            metadata={"hnsw:space": "cosine"},
        )
    return client.get_collection(name=COLLECTION_NAME)


# ── Store builder ─────────────────────────────────────────────────────────────

async def build_store(
    documents: list[tuple[RagSource, str]],
    persist_dir: Path = DEFAULT_PERSIST_DIR,
    force_rebuild: bool = False,
) -> chromadb.Collection:
    """
    Chunk all fetched documents, embed them via NIM, and upsert into ChromaDB.

    Args:
        documents: list of (RagSource, raw_text) pairs from the fetcher.
        persist_dir: where ChromaDB writes its sqlite + parquet files.
        force_rebuild: if True, drops and recreates the collection.

    Returns:
        The populated ChromaDB collection.
    """
    persist_dir.mkdir(parents=True, exist_ok=True)
    client = chromadb.PersistentClient(path=str(persist_dir))

    if force_rebuild:
        try:
            client.delete_collection(COLLECTION_NAME)
            logger.info("RAG: dropped existing collection for rebuild")
        except Exception:
            pass

    collection = client.get_or_create_collection(
        name=COLLECTION_NAME,
        metadata={"hnsw:space": "cosine"},
    )

    total_chunks = 0
    for source, text in documents:
        if not text:
            logger.warning("RAG: empty text for source %s — skipping", source.id)
            continue

        chunks = _chunk_text(text)
        if not chunks:
            continue

        ids = [f"{source.id}__chunk_{i}" for i in range(len(chunks))]
        metadatas = [
            {
                "source_id": source.id,
                "source_name": source.name,
                "url": source.url,
                "tags": ",".join(source.tags),  # ChromaDB metadata must be str
                "chunk_index": i,
            }
            for i in range(len(chunks))
        ]

        embeddings = await embed_texts(chunks)

        # Upsert is idempotent — safe to re-run without duplicates
        await asyncio.to_thread(
            collection.upsert,
            ids=ids,
            documents=chunks,
            embeddings=embeddings,
            metadatas=metadatas,
        )
        logger.info("RAG: indexed %d chunks from %s", len(chunks), source.id)
        total_chunks += len(chunks)

    logger.info("RAG: index complete — %d total chunks across %d sources", total_chunks, len(documents))
    return collection


# ── Store loader ──────────────────────────────────────────────────────────────

def load_store(persist_dir: Path = DEFAULT_PERSIST_DIR) -> chromadb.Collection:
    """Load an existing persisted ChromaDB collection (no re-embedding)."""
    return _open_collection(persist_dir, create=False)


# ── Retrieval ─────────────────────────────────────────────────────────────────

def query_store(
    collection: chromadb.Collection,
    query_embedding: list[float],
    n_results: int = DEFAULT_N_RESULTS,
    filter_tags: list[str] | None = None,
) -> list[dict[str, Any]]:
    """
    Semantic search against the collection using a precomputed query vector.

    Args:
        collection: the ChromaDB collection.
        query_embedding: the NIM embedding of the query text.
        n_results: number of chunks to retrieve.
        filter_tags: if provided, restricts retrieval to the sources that carry
                     ANY of those tags. Tags are resolved to source ids via
                     TAG_INDEX and applied with a valid metadata filter
                     ({"source_id": {"$in": [...]}}). (ChromaDB's $contains is a
                     where_document operator, not a metadata one, so a per-tag
                     substring match on the comma-joined tags field is not valid.)

    Returns:
        List of dicts with keys: text, source_id, source_name, url, tags, distance.
    """
    where_clause: dict | None = None
    if filter_tags:
        source_ids = sorted(
            {sid for tag in filter_tags for sid in TAG_INDEX.get(tag, [])}
        )
        if source_ids:
            where_clause = {"source_id": {"$in": source_ids}}

    kwargs: dict[str, Any] = {
        "query_embeddings": [query_embedding],
        "n_results": n_results,
        "include": ["documents", "metadatas", "distances"],
    }
    if where_clause:
        kwargs["where"] = where_clause

    results = collection.query(**kwargs)

    docs = (results.get("documents") or [[]])[0]
    metas = (results.get("metadatas") or [[]])[0]
    dists = (results.get("distances") or [[]])[0]

    hits: list[dict[str, Any]] = []
    for doc, meta, dist in zip(docs, metas, dists):
        meta = meta or {}
        hits.append(
            {
                "text": doc,
                "source_id": meta.get("source_id", ""),
                "source_name": meta.get("source_name", ""),
                "url": meta.get("url", ""),
                "tags": meta.get("tags", "").split(","),
                "distance": dist,
            }
        )

    return hits
