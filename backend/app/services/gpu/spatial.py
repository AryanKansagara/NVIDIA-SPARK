"""GPU-accelerated spatial matching with numpy CPU fallback.

On DGX Spark with RAPIDS installed the cuDF/cuSpatial path is used.
On any other machine the numpy path is used transparently.
"""
from __future__ import annotations

import asyncio
import logging
import math
from typing import Any

import numpy as np

logger = logging.getLogger(__name__)

try:
    import cudf  # type: ignore
    import cuspatial  # type: ignore
    _GPU = True
    logger.info("GPU spatial enabled (cuDF + cuSpatial)")
except ImportError:
    _GPU = False
    logger.info("GPU spatial unavailable — using numpy fallback")

_EARTH_R = 6_371_000.0  # metres


async def find_within_radius(
    query_lat: float,
    query_lon: float,
    candidates,  # pandas DataFrame with 'latitude', 'longitude' columns + others
    radius_m: float,
) -> list[dict[str, Any]]:
    """Return rows from *candidates* within *radius_m* metres of the query point."""
    if len(candidates) == 0:
        return []
    if _GPU:
        return await asyncio.to_thread(_gpu_haversine, query_lat, query_lon, candidates, radius_m)
    return _numpy_haversine(query_lat, query_lon, candidates, radius_m)


# ---------------------------------------------------------------------------
# GPU path
# ---------------------------------------------------------------------------

def _gpu_haversine(
    query_lat: float,
    query_lon: float,
    candidates,
    radius_m: float,
) -> list[dict[str, Any]]:
    cdf = cudf.from_pandas(candidates)
    lat = cudf.Series([query_lat])
    lon = cudf.Series([query_lon])
    # cuspatial haversine_distance expects (lon, lat) order
    distances = cuspatial.haversine_distance(
        lon, lat,
        cdf["longitude"], cdf["latitude"],
    ) * 1000  # km → m
    mask = distances <= radius_m
    return cdf[mask].to_pandas().to_dict("records")


# ---------------------------------------------------------------------------
# CPU path (vectorised numpy — no Python loop)
# ---------------------------------------------------------------------------

def _numpy_haversine(
    query_lat: float,
    query_lon: float,
    candidates,
    radius_m: float,
) -> list[dict[str, Any]]:
    lat1 = math.radians(query_lat)
    lon1 = math.radians(query_lon)
    lats = np.radians(candidates["latitude"].to_numpy(dtype=float))
    lons = np.radians(candidates["longitude"].to_numpy(dtype=float))
    dlat = lats - lat1
    dlon = lons - lon1
    a = np.sin(dlat / 2) ** 2 + np.cos(lat1) * np.cos(lats) * np.sin(dlon / 2) ** 2
    distances = 2 * _EARTH_R * np.arcsin(np.sqrt(a))
    mask = distances <= radius_m
    return candidates[mask].to_dict("records")
