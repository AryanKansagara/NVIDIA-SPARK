import asyncio
import math

import httpx

from app.services.data_sources.models import HCDEvidence, HeritageEvidence
from app.services.geocoding.service import GeocodeResult

_CKAN_BASE = "https://ckan0.cf.opendata.inter.prod-toronto.ca/api/3/action"
_PACKAGE = "heritage-register"
_MATCH_RADIUS_M = 25       # spec: match within 25m
_LOW_CONF_RADIUS_M = 50    # spec: LOW confidence if no match within 50m


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
        self._date_key: str | None = None
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
            self._date_key = next(
                (keys[i] for i, u in enumerate(upper) if "DATE" in u), None
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
                confidence="UNKNOWN",
            )

        matched: dict | None = None
        nearest_dist: float = float("inf")

        if self._lat_key and self._lon_key:
            for rec in self._records:
                try:
                    rlat = float(rec[self._lat_key])
                    rlon = float(rec[self._lon_key])
                except (TypeError, ValueError):
                    continue
                dist = _haversine_m(location.latitude, location.longitude, rlat, rlon)
                if dist < nearest_dist:
                    nearest_dist = dist
                if dist <= _MATCH_RADIUS_M:
                    matched = rec
                    break
        elif self._addr_key:
            needle = location.address.upper().split(",")[0].strip()[:20]
            matched = next(
                (r for r in self._records if needle in str(r.get(self._addr_key, "")).upper()),
                None,
            )

        if matched is None:
            # spec: LOW confidence if no match within 50m, otherwise no signal
            confidence = "LOW" if nearest_dist <= _LOW_CONF_RADIUS_M else "LOW"
            return HeritageEvidence(
                status="no_match",
                reason="No heritage property found at this location.",
                source="ckan-heritage-register",
                confidence=confidence,
            )

        raw_status = str(matched.get(self._status_key, "Listed")) if self._status_key else "Listed"
        status = self._classify(raw_status)
        has_date = bool(self._date_key and matched.get(self._date_key))
        # spec confidence rules: HIGH = found with designation date, MEDIUM = found but status unclear
        confidence = "HIGH" if has_date else "MEDIUM"

        messages = {
            "part_iv": (
                "Elevated review recommended. This property is fully heritage designated. "
                "Renovations require heritage permit review — budget for delays and potential "
                "restrictions on exterior alterations."
            ),
            "part_v": (
                "This property is in a heritage conservation district. "
                "Neighbourhood-level heritage restrictions apply."
            ),
            "listed": (
                "This property is on the Heritage Register but not yet formally designated. "
                "Lower risk, worth monitoring."
            ),
        }
        return HeritageEvidence(
            status=status,
            reason=messages[status],
            source="ckan-heritage-register",
            confidence=confidence,
        )

    def _fallback(self, location: GeocodeResult, note: str = "") -> HeritageEvidence:
        lower = location.address.lower()
        if any(k in lower for k in ("distillery", "richmond", "front", "king")):
            return HeritageEvidence(
                status="part_iv_or_sensitive_core",
                reason=f"Heritage-sensitive address (live data unavailable: {note[:80]}).",
                source="heuristic-fallback",
                confidence="UNKNOWN",
            )
        return HeritageEvidence(
            status="no_match",
            reason=f"No heritage signal (live data unavailable: {note[:80]}).",
            source="heuristic-fallback",
            confidence="UNKNOWN",
        )


# ---------------------------------------------------------------------------
# Heritage Conservation Districts (Parameter 2)
# ---------------------------------------------------------------------------

_HCD_PACKAGE = "heritage-conservation-districts"


def _ray_cast(lon: float, lat: float, ring: list) -> bool:
    """Point-in-polygon via ray casting. Ring is a list of [lon, lat] pairs."""
    inside = False
    j = len(ring) - 1
    for i in range(len(ring)):
        xi, yi = ring[i][0], ring[i][1]
        xj, yj = ring[j][0], ring[j][1]
        if ((yi > lat) != (yj > lat)) and lon < (xj - xi) * (lat - yi) / (yj - yi) + xi:
            inside = not inside
        j = i
    return inside


def _point_in_feature(lon: float, lat: float, geometry: dict) -> bool:
    """Test a point against a GeoJSON Polygon or MultiPolygon geometry."""
    gtype = geometry.get("type")
    coords = geometry.get("coordinates", [])
    if gtype == "Polygon":
        # coords[0] is exterior ring; ignore holes for this use case
        return _ray_cast(lon, lat, coords[0]) if coords else False
    if gtype == "MultiPolygon":
        return any(_ray_cast(lon, lat, poly[0]) for poly in coords if poly)
    return False


class HCDService:
    def __init__(self) -> None:
        self._features: list[dict] | None = None
        self._lock = asyncio.Lock()

    async def _ensure_loaded(self) -> None:
        if self._features is not None:
            return
        async with self._lock:
            if self._features is not None:
                return
            await self._fetch()

    async def _fetch(self) -> None:
        async with httpx.AsyncClient(timeout=60.0) as client:
            pkg = await client.get(f"{_CKAN_BASE}/package_show", params={"id": _HCD_PACKAGE})
            pkg.raise_for_status()
            resources = pkg.json()["result"]["resources"]

            geojson_url = next(
                (r["url"] for r in resources if r.get("format", "").upper() in ("GEOJSON", "JSON", "GEOJSON (WGS84)")),
                None,
            )
            if not geojson_url:
                self._features = []
                return

            resp = await client.get(geojson_url, follow_redirects=True)
            resp.raise_for_status()
            data = resp.json()

        self._features = data.get("features", [])

    async def lookup(self, location: GeocodeResult) -> HCDEvidence:
        try:
            await self._ensure_loaded()
        except Exception as exc:
            return HCDEvidence(
                in_district=False,
                district_name=None,
                source="heuristic-fallback",
                confidence="UNKNOWN",
            )

        if not self._features:
            return HCDEvidence(
                in_district=False,
                district_name=None,
                source="ckan-hcd",
                confidence="UNKNOWN",
            )

        lon, lat = location.longitude, location.latitude
        for feature in self._features:
            geometry = feature.get("geometry") or {}
            if _point_in_feature(lon, lat, geometry):
                props = feature.get("properties") or {}
                name = (
                    props.get("NAME")
                    or props.get("DISTRICT_NAME")
                    or props.get("HCD_NAME")
                    or props.get("name")
                )
                return HCDEvidence(
                    in_district=True,
                    district_name=name,
                    source="ckan-hcd",
                    confidence="HIGH",
                )

        return HCDEvidence(
            in_district=False,
            district_name=None,
            source="ckan-hcd",
            confidence="HIGH",
        )
