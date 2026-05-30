#!/usr/bin/env python3
"""
Ingest land-law PDFs into the ChromaDB vector store.

Run from backend/:
    python scripts/ingest_docs.py

Drop PDFs into data/land_laws/ first, then run this script.
Re-running is safe — existing chunks are upserted (no duplicates).
"""
import asyncio
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

from app.core.config import get_settings
from app.services.rag.ingest import ingest_directory
from app.services.rag.service import RAGService


async def main() -> None:
    settings = get_settings()
    law_dir = Path(settings.rag_land_laws_dir)
    law_dir.mkdir(parents=True, exist_ok=True)

    pdf_count = len(list(law_dir.glob("*.pdf")))
    print(f"Land laws dir : {law_dir.resolve()}  ({pdf_count} PDF(s))")
    print(f"Vector store  : {Path(settings.rag_vector_store_path).resolve()}")
    print()

    rag = RAGService(settings)
    total = await ingest_directory(law_dir, settings, rag.collection())
    print(f"\nDone. {total} chunks indexed. Collection size: {rag.collection().count()}")


if __name__ == "__main__":
    asyncio.run(main())
