import asyncio
import math

import httpx

from app.services.data_sources.models import DevelopmentEvidence
from app.services.geocoding.service import GeocodeResult

_CKAN_BASE = "https://ckan0.cf.opendata.inter.prod-toronto.ca/api/3/action"
_PACKAGE = "development-applications"
_RADIUS_M = 500

# Only count active OZ/SA applications — exclude Closed (~18,504 records)
_ACTIVE_STATUSES = frozenset({
    "Under Review", "Application Received", "Council Approved", "NOAC Issued",
})
_RELEVANT_TYPES = frozenset({"OZ", "SA"})


def _haversine_m(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    R = 6_371_000
    φ1, φ2 = math.radians(lat1), math.radians(lat2)
    dφ = math.radians(lat2 - lat1)
    dλ = math.radians(lon2 - lon1)
    a = math.sin(dφ / 2) ** 2 + math.cos(φ1) * math.cos(φ2) * math.sin(dλ / 2) ** 2
    return R * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))


class DevelopmentService:
    def __init__(self) -> None:
        self._records: list[dict] | None = None
        self._lat_key: str | None = None
        self._lon_key: str | None = None
        self._status_key: str | None = None
        self._type_key: str | None = None
        self._lock = asyncio.Lock()

    async def _ensure_loaded(self) -> None:
        if self._records is not None:
            return
        async with self._lock:
            if self._records is not None:
                return
            await self._fetch()

    async def _fetch(self) -> None:
        async with httpx.AsyncClient(timeout=90.0) as client:
            pkg = await client.get(f"{_CKAN_BASE}/package_show", params={"id": _PACKAGE})
            pkg.raise_for_status()
            resources = pkg.json()["result"]["resources"]

            resource_id = next(
                (r["id"] for r in resources if r.get("datastore_active")), None
            ) or next(
                (r["id"] for r in resources if r.get("format", "").upper() in ("CSV", "JSON")),
                None,
            )
            if not resource_id:
                self._records = []
                return

            records: list[dict] = []
            limit = 5000
            offset = 0
            while True:
                resp = await client.get(
                    f"{_CKAN_BASE}/datastore_search",
                    params={"resource_id": resource_id, "limit": limit, "offset": offset},
                )
                resp.raise_for_status()
                batch = resp.json()["result"]["records"]
                records.extend(batch)
                if len(batch) < limit:
                    break
                offset += limit

        if records:
            keys = list(records[0].keys())
            upper = [k.upper() for k in keys]
            self._lat_key = next(
                (keys[i] for i, u in enumerate(upper) if u in ("LATITUDE", "LAT", "GEO_LATITUDE")), None
            )
            self._lon_key = next(
                (keys[i] for i, u in enumerate(upper) if u in ("LONGITUDE", "LNG", "LON", "GEO_LONGITUDE")), None
            )
            self._status_key = next(
                (keys[i] for i, u in enumerate(upper) if "STATUS" in u), None
            )
            self._type_key = next(
                (keys[i] for i, u in enumerate(upper) if u in ("APPLICATION_TYPE", "TYPE", "APP_TYPE")), None
            )

        self._records = records

    def _coords(self, rec: dict) -> tuple[float, float] | None:
        try:
            lat = float(rec[self._lat_key])  # type: ignore[index]
            lon = float(rec[self._lon_key])  # type: ignore[index]
        except (TypeError, ValueError, KeyError):
            return None
        # Reject projected (UTM) coordinates — Toronto lat ≈ 43.7, UTM northing ≈ 4,800,000
        if abs(lat) > 200:
            return None
        return (lat, lon)

    async def lookup(self, location: GeocodeResult) -> DevelopmentEvidence:
        try:
            await self._ensure_loaded()
        except Exception:
            return self._fallback(location)

        if not self._records or not self._lat_key or not self._lon_key:
            return self._fallback(location)

        lat_delta = _RADIUS_M / 111_000
        lon_delta = _RADIUS_M / (111_000 * math.cos(math.radians(location.latitude)))

        count = 0
        for rec in self._records:
            # Filter to active OZ/SA only — exclude Closed and irrelevant types
            if self._status_key:
                status = str(rec.get(self._status_key, "")).strip()
                if status not in _ACTIVE_STATUSES:
                    continue
            if self._type_key:
                app_type = str(rec.get(self._type_key, "")).strip()
                if app_type not in _RELEVANT_TYPES:
                    continue

            coords = self._coords(rec)
            if coords is None:
                continue
            rlat, rlon = coords
            if abs(rlat - location.latitude) > lat_delta:
                continue
            if abs(rlon - location.longitude) > lon_delta:
                continue
            if _haversine_m(location.latitude, location.longitude, rlat, rlon) <= _RADIUS_M:
                count += 1

        intensity = "high" if count >= 10 else "medium" if count >= 5 else "low"
        return DevelopmentEvidence(
            application_count_500m=count,
            intensity=intensity,
            source="ckan-development-applications",
        )

    def _fallback(self, location: GeocodeResult) -> DevelopmentEvidence:
        lower = location.address.lower()
        if any(k in lower for k in ("richmond", "king", "yonge", "queen")):
            count = 14
        elif any(k in lower for k in ("scarborough", "etobicoke", "north york")):
            count = 4
        else:
            count = 7
        intensity = "high" if count >= 10 else "medium" if count >= 5 else "low"
        return DevelopmentEvidence(
            application_count_500m=count,
            intensity=intensity,
            source="heuristic-fallback",
        )
