"""Shapefile fetcher for CKAN datasets published only as SHP (no datastore API).

The City of Toronto Heritage Register is published only as a zipped shapefile
(address points, already in WGS84), so it cannot be read via datastore_search.
This downloads the zip, reads the .shp/.dbf with pyshp, and returns plain dict
records (attributes + latitude/longitude) shaped like the datastore output so the
existing cleaners can consume them unchanged.
"""
from __future__ import annotations

import io
import logging
import zipfile

import httpx
import shapefile

logger = logging.getLogger(__name__)

_CKAN_BASE = "https://ckan0.cf.opendata.inter.prod-toronto.ca"


async def fetch_shp_points(package_id: str, timeout: float = 90.0) -> list[dict]:
    """Download the package's SHP resource and return point records as dicts."""
    async with httpx.AsyncClient(timeout=timeout, follow_redirects=True) as client:
        resp = await client.get(
            f"{_CKAN_BASE}/api/3/action/package_show", params={"id": package_id}
        )
        resp.raise_for_status()
        resources = resp.json()["result"]["resources"]
        shp_url = next(
            (r["url"] for r in resources if r.get("format", "").upper() == "SHP"), None
        )
        if not shp_url:
            raise ValueError(f"No SHP resource for package {package_id}")
        content = (await client.get(shp_url)).content

    return _parse_zip(content)


def _parse_zip(content: bytes) -> list[dict]:
    zf = zipfile.ZipFile(io.BytesIO(content))
    base = next(n[:-4] for n in zf.namelist() if n.lower().endswith(".shp"))
    reader = shapefile.Reader(
        shp=io.BytesIO(zf.read(base + ".shp")),
        dbf=io.BytesIO(zf.read(base + ".dbf")),
        shx=io.BytesIO(zf.read(base + ".shx")),
    )
    field_names = [f[0] for f in reader.fields[1:]]
    records: list[dict] = []
    for sr in reader.iterShapeRecords():
        if not sr.shape.points:
            continue
        lon, lat = sr.shape.points[0]  # WGS84 point geometry
        rec = dict(zip(field_names, sr.record))
        rec["latitude"] = lat
        rec["longitude"] = lon
        records.append(rec)
    logger.info("Parsed %d SHP point records", len(records))
    return records
