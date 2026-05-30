"""POST /api/v1/pipeline/refresh — pull CKAN data, write Parquet, load DuckDB."""
from __future__ import annotations

import asyncio
import logging
import time
import uuid
from datetime import datetime, timezone
from pathlib import Path

import pyarrow as pa
import pyarrow.parquet as pq
from fastapi import APIRouter, Body, HTTPException

from app.core.config import get_settings
from app.schemas.pipeline import PipelineRefreshRequest, PipelineRefreshResponse
from app.services.pipeline import ckan_fetcher
from app.services.pipeline import heritage_cleaner, development_cleaner
from app.services.pipeline.duckdb_store import get_store

router = APIRouter()
logger = logging.getLogger(__name__)

_HERITAGE_PACKAGE = "heritage-register"
_DEVELOPMENT_PACKAGE = "development-applications"


@router.post("/pipeline/refresh", response_model=PipelineRefreshResponse)
async def refresh_pipeline(
    request: PipelineRefreshRequest = Body(default_factory=PipelineRefreshRequest),
) -> PipelineRefreshResponse:
    settings = get_settings()
    parquet_dir = Path(settings.parquet_dir)
    parquet_dir.mkdir(parents=True, exist_ok=True)

    started = time.perf_counter()
    run_id = str(uuid.uuid4())
    warnings: list[str] = []
    heritage_rows = 0
    development_rows = 0
    parquet_paths: dict[str, str] = {}

    store = await get_store(settings.duckdb_path)

    # Fetch both datasets concurrently
    try:
        heritage_records, development_records = await asyncio.gather(
            ckan_fetcher.fetch_all(_HERITAGE_PACKAGE),
            ckan_fetcher.fetch_all(_DEVELOPMENT_PACKAGE),
            return_exceptions=True,
        )
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"CKAN fetch failed: {exc}") from exc

    ts = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%S")

    # Heritage
    if isinstance(heritage_records, Exception):
        warnings.append(f"Heritage fetch failed: {heritage_records}")
    else:
        path = str(parquet_dir / f"heritage_{ts}.parquet")
        _write_parquet(heritage_records, path)
        parquet_paths["heritage"] = path
        store.load_parquet("heritage", path)
        try:
            heritage_rows = heritage_cleaner.run(store)
        except Exception as exc:
            warnings.append(f"Heritage cleaning failed: {exc}")
            logger.exception("Heritage cleaning error")

    # Development
    if isinstance(development_records, Exception):
        warnings.append(f"Development fetch failed: {development_records}")
    else:
        path = str(parquet_dir / f"development_{ts}.parquet")
        _write_parquet(development_records, path)
        parquet_paths["development"] = path
        store.load_parquet("development", path)
        try:
            development_rows = development_cleaner.run(store)
        except Exception as exc:
            warnings.append(f"Development cleaning failed: {exc}")
            logger.exception("Development cleaning error")

    duration = time.perf_counter() - started
    finished_at = datetime.now(timezone.utc)

    store.execute(
        """INSERT OR REPLACE INTO pipeline_runs
           (run_id, started_at, finished_at, heritage_rows, development_rows, status, error_message)
           VALUES (?,?,?,?,?,?,?)""",
        [
            run_id,
            datetime.now(timezone.utc),
            finished_at,
            heritage_rows,
            development_rows,
            "success" if not warnings else "partial",
            "; ".join(warnings) or None,
        ],
    )

    return PipelineRefreshResponse(
        status="success" if not warnings else "partial",
        heritage_rows=heritage_rows,
        development_rows=development_rows,
        duration_seconds=round(duration, 2),
        refreshed_at=finished_at,
        parquet_paths=parquet_paths,
        warnings=warnings,
    )


def _write_parquet(records: list[dict], path: str) -> None:
    if not records:
        return
    # Normalise keys to lower snake_case
    norm = [{k.lower().replace(" ", "_"): v for k, v in r.items()} for r in records]
    table = pa.Table.from_pylist(norm)
    pq.write_table(table, path)
