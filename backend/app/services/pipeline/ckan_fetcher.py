"""Reusable CKAN paginated fetcher used by the pipeline refresh endpoint."""
from __future__ import annotations

import logging
from typing import Any

import httpx

logger = logging.getLogger(__name__)

_CKAN_BASE = "https://ckan0.cf.opendata.inter.prod-toronto.ca"
_PAGE_SIZE = 5000


async def fetch_all(package_id: str, timeout: float = 30.0) -> list[dict[str, Any]]:
    """Fetch every record for a CKAN package via datastore_search pagination."""
    resource_id = await _get_resource_id(package_id, timeout)
    records: list[dict] = []
    offset = 0
    async with httpx.AsyncClient(timeout=timeout) as client:
        while True:
            resp = await client.get(
                f"{_CKAN_BASE}/api/3/action/datastore_search",
                params={"id": resource_id, "limit": _PAGE_SIZE, "offset": offset},
            )
            resp.raise_for_status()
            data = resp.json()
            page = data.get("result", {}).get("records", [])
            records.extend(page)
            if len(page) < _PAGE_SIZE:
                break
            offset += _PAGE_SIZE
    logger.info("Fetched %d records for package %s", len(records), package_id)
    return records


async def _get_resource_id(package_id: str, timeout: float) -> str:
    async with httpx.AsyncClient(timeout=timeout) as client:
        resp = await client.get(
            f"{_CKAN_BASE}/api/3/action/package_show",
            params={"id": package_id},
        )
        resp.raise_for_status()
        resources = resp.json()["result"]["resources"]
    # prefer datastore_active resource
    for r in resources:
        if r.get("datastore_active"):
            return r["id"]
    # fallback: first CSV/JSON resource
    for r in resources:
        if r.get("format", "").upper() in ("CSV", "JSON"):
            return r["id"]
    return resources[0]["id"]
