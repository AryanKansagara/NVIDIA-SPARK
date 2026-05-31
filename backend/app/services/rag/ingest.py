import asyncio
import hashlib
from pathlib import Path

import httpx
from pypdf import PdfReader

from app.core.config import Settings
from app.services.rag.store import VectorStore


def _chunk_text(text: str, size: int, overlap: int) -> list[str]:
    words = text.split()
    chunks: list[str] = []
    start = 0
    while start < len(words):
        chunk = " ".join(words[start : start + size]).strip()
        if chunk:
            chunks.append(chunk)
        if start + size >= len(words):
            break
        start += size - overlap
    return chunks


def _extract_pdf_text(path: Path) -> str:
    reader = PdfReader(str(path))
    return "\n".join(page.extract_text() or "" for page in reader.pages)


def _chunk_id(source: str, index: int) -> str:
    return hashlib.sha1(f"{source}:{index}".encode()).hexdigest()[:16]


async def _embed_batch(texts: list[str], settings: Settings) -> list[list[float]]:
    async with httpx.AsyncClient(timeout=settings.nim_timeout_seconds) as client:
        resp = await client.post(
            f"{settings.embedding_local_url}/embeddings",
            json={"model": settings.rag_embedding_model, "input": texts},
        )
        resp.raise_for_status()
        data = sorted(resp.json()["data"], key=lambda x: x["index"])
        return [item["embedding"] for item in data]


async def ingest_pdf(path: Path, settings: Settings, store: VectorStore) -> int:
    text = _extract_pdf_text(path)
    chunks = _chunk_text(text, settings.rag_chunk_size, settings.rag_chunk_overlap)
    if not chunks:
        return 0

    source = path.name
    ids = [_chunk_id(source, i) for i in range(len(chunks))]
    metadatas = [{"source": source, "chunk": i} for i in range(len(chunks))]

    all_embeddings: list[list[float]] = []
    for start in range(0, len(chunks), 32):
        batch_embeddings = await _embed_batch(chunks[start : start + 32], settings)
        all_embeddings.extend(batch_embeddings)

    await asyncio.to_thread(
        store.upsert,
        ids=ids,
        documents=chunks,
        embeddings=all_embeddings,
        metadatas=metadatas,
    )
    return len(chunks)


async def ingest_directory(dir_path: Path, settings: Settings, store: VectorStore) -> int:
    pdfs = sorted(dir_path.glob("*.pdf"))
    if not pdfs:
        print(f"No PDFs found in {dir_path}")
        return 0
    total = 0
    for pdf_path in pdfs:
        print(f"  {pdf_path.name}...", end=" ", flush=True)
        n = await ingest_pdf(pdf_path, settings, store)
        print(f"{n} chunks")
        total += n
    return total
