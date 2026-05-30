import asyncio
import math

import httpx

from app.services.data_sources.models import HeritageEvidence
from app.services.geocoding.service import GeocodeResult

_CKAN_BASE = "https://ckan0.cf.opendata.inter.prod-toronto.ca/api/3/action"
_PACKAGE = "heritage-register"
_MATCH_RADIUS_M = 80  # generous for geocoder accuracy variance


def _haversine_m(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    R = 6_371_000
    φ1, φ2 = math.radians(lat1), math.radians(lat2)
    dφ = math.radians(lat2 - lat1)
    dλ = math.radians(lon2 - lon1)
    a = math.sin(dφ / 2) ** 2 + math.cos(φ1) * math.cos(φ2) * math.sin(dλ / 2) ** 2
    return R * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))


class HeritageService:
    def __init__(self) -> None:
        self._records: list[dict] | None = None
        self._lat_key: str | None = None
        self._lon_key: str | None = None
        self._status_key: str | None = None
        self._addr_key: str | None = None
        self._lock = asyncio.Lock()

    async def _ensure_loaded(self) -> None:
        if self._records is not None:
            return
        async with self._lock:
            if self._records is not None:
                return
            await self._fetch()

    async def _fetch(self) -> None:
        async with httpx.AsyncClient(timeout=60.0) as client:
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
                (keys[i] for i, u in enumerate(upper) if "STATUS" in u or "DESIGNATION" in u), None
            )
            self._addr_key = next(
                (keys[i] for i, u in enumerate(upper) if "ADDR" in u), None
            )

        self._records = records

    def _classify(self, raw: str) -> str:
        u = raw.upper()
        if "PART IV" in u or "IV" in u and "DESIGNAT" in u:
            return "part_iv"
        if "PART V" in u or "DISTRICT" in u or "HCD" in u or "CONSERVATION" in u:
            return "part_v"
        return "listed"

    async def lookup(self, location: GeocodeResult) -> HeritageEvidence:
        try:
            await self._ensure_loaded()
        except Exception as exc:
            return self._fallback(location, note=str(exc))

        if not self._records:
            return HeritageEvidence(
                status="no_match",
                reason="Heritage dataset unavailable.",
                source="ckan-heritage-register",
            )

        matched: dict | None = None

        if self._lat_key and self._lon_key:
            for rec in self._records:
                try:
                    rlat = float(rec[self._lat_key])
                    rlon = float(rec[self._lon_key])
                except (TypeError, ValueError):
                    continue
                if _haversine_m(location.latitude, location.longitude, rlat, rlon) <= _MATCH_RADIUS_M:
                    matched = rec
                    break
        elif self._addr_key:
            needle = location.address.upper().split(",")[0].strip()[:20]
            matched = next(
                (r for r in self._records if needle in str(r.get(self._addr_key, "")).upper()),
                None,
            )

        if matched is None:
            return HeritageEvidence(
                status="no_match",
                reason="No heritage property found at this location.",
                source="ckan-heritage-register",
            )

        raw_status = str(matched.get(self._status_key, "Listed")) if self._status_key else "Listed"
        status = self._classify(raw_status)

        messages = {
            "part_iv": (
                "Part IV designated heritage property. "
                "Renovations require heritage permit review; budget for delays and exterior alteration restrictions."
            ),
            "part_v": "Located in a heritage conservation district. Neighbourhood-level restrictions on alterations apply.",
            "listed": "On the Heritage Register but not yet designated. Lower risk, worth monitoring.",
        }
        return HeritageEvidence(status=status, reason=messages[status], source="ckan-heritage-register")

    def _fallback(self, location: GeocodeResult, note: str = "") -> HeritageEvidence:
        lower = location.address.lower()
        if any(k in lower for k in ("distillery", "richmond", "front", "king")):
            return HeritageEvidence(
                status="part_iv_or_sensitive_core",
                reason=f"Heritage-sensitive address (live data unavailable: {note[:80]}).",
                source="heuristic-fallback",
            )
        return HeritageEvidence(
            status="no_match",
            reason=f"No heritage signal (live data unavailable: {note[:80]}).",
            source="heuristic-fallback",
        )
