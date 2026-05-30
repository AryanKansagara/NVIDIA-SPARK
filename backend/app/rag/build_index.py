#!/usr/bin/env python3
"""
Meridian RAG — standalone index builder.

Run this once before starting the server to pre-warm the index,
or in CI to validate all sources are reachable.

Usage:
    cd backend
    python -m app.rag.build_index               # build (skip if index exists)
    python -m app.rag.build_index --rebuild      # force full rebuild
    python -m app.rag.build_index --check        # just report index stats
"""

import argparse
import asyncio
import logging
import sys
from pathlib import Path

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s  %(levelname)-7s  %(name)s  %(message)s",
    datefmt="%H:%M:%S",
)

logger = logging.getLogger("meridian.rag.build")


async def main(rebuild: bool = False, check: bool = False) -> int:
    from app.rag.service import startup, retrieve, is_ready
    from app.rag.store import DEFAULT_PERSIST_DIR

    if check:
        from app.rag.store import load_store
        try:
            col = load_store()
            count = col.count()
            logger.info("Index OK — %d chunks at %s", count, DEFAULT_PERSIST_DIR)
            # Quick smoke-test query
            results = await retrieve("Ontario land transfer tax first-time buyer refund", n_results=3)
            logger.info("Smoke test — top result: [%s] %s", results[0]["source_id"], results[0]["text"][:120])
            return 0
        except Exception as exc:
            logger.error("Index check failed: %s", exc)
            return 1

    await startup(force_rebuild=rebuild)

    if is_ready():
        from app.rag.store import load_store
        col = load_store()
        logger.info("Done — %d chunks indexed", col.count())
        return 0
    else:
        logger.error("Index build failed")
        return 1


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Build or check the Meridian RAG index")
    parser.add_argument("--rebuild", action="store_true", help="Force full rebuild even if index exists")
    parser.add_argument("--check", action="store_true", help="Check existing index stats and run smoke test")
    args = parser.parse_args()

    exit_code = asyncio.run(main(rebuild=args.rebuild, check=args.check))
    sys.exit(exit_code)
