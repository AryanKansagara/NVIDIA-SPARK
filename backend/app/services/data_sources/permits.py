import asyncio
import math
from datetime import date, datetime

import httpx

from app.services.data_sources.models import ActivePermitsEvidence, ClearedPermitsEvidence
from app.services.geocoding.service import GeocodeResult

_CKAN_BASE = "https://ckan0.cf.opendata.inter.prod-toronto.ca/api/3/action"
_PACKAGE = "building-permits-active-permits"
_CLEARED_PACKAGE = "building-permits-cleared-permits"

_ELEVATED_RISK_DAYS = 365 * 2
_INCOMPLETE_DATE_CUTOFF = date(1999, 10, 1)
_DEFERRED_MAINTENANCE_YEARS = 15
_CHRONIC_ISSUES_THRESHOLD = 5
_STRUCTURAL_LOOKBACK_YEARS = 10

# Point-proximity match radius per PRD §8.2
_PERMIT_MATCH_RADIUS_M = 30
# Bounding-box prefilter (~110m at Toronto latitude) — wider than match radius
_BBOX_LAT = 0.0010
_BBOX_LON = 0.0014   # lon delta wider: cos(43.7°) ≈ 0.72

_STRUCTURAL = frozenset([
    "structural", "foundation", "framing", "addition", "demolit",
    "new build", "unsafe", "major repair", "emergency",
])
_ELECTRICAL = frozenset(["electric"])
_PLUMBING   = frozenset(["plumb", "drain", "sewer", "water service"])
_MECHANICAL = frozenset(["mechanical", "hvac", "heat", "ventil"])


def _haversine_m(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    R = 6_371_000
    φ1, φ2 = math.radians(lat1), math.radians(lat2)
    dφ = math.radians(lat2 - lat1)
    dλ = math.radians(lon2 - lon1)
    a = math.sin(dφ / 2) ** 2 + math.cos(φ1) * math.cos(φ2) * math.sin(dλ / 2) ** 2
    return R * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))


def _safe_haversine(lat: float, lon: float, raw_lat, raw_lon) -> float:
    try:
        return _haversine_m(lat, lon, float(raw_lat), float(raw_lon))
    except (TypeError, ValueError):
        return float("inf")


def _classify_work(work_type: str) -> str:
    lower = work_type.lower()
    if any(k in lower for k in _STRUCTURAL):
        return "structural"
    if any(k in lower for k in _ELECTRICAL):
        return "electrical"
    if any(k in lower for k in _PLUMBING):
        return "plumbing"
    if any(k in lower for k in _MECHANICAL):
        return "mechanical"
    return "other"


def _parse_date(raw: str | None) -> date | None:
    if not raw:
        return None
    for fmt in ("%Y-%m-%dT%H:%M:%S", "%Y-%m-%d", "%m/%d/%Y"):
        try:
            return datetime.strptime(raw[:19], fmt).date()
        except ValueError:
            continue
    return None


def _address_search_term(location: GeocodeResult) -> str:
    parts = location.normalized_address.split(",")[0].split()
    return " ".join(parts[:2]) if len(parts) >= 2 else parts[0]


# ---------------------------------------------------------------------------
# Active Building Permits (Parameter 3)
# ---------------------------------------------------------------------------

class ActivePermitsService:
    def __init__(self) -> None:
        self._resource_id: str | None = None
        self._date_field: str | None = None
        self._work_field: str | None = None
        self._lat_field: str | None = None
        self._lon_field: str | None = None
        self._lock = asyncio.Lock()

    async def _ensure_resource(self, client: httpx.AsyncClient) -> None:
        if self._resource_id is not None:
            return
        async with self._lock:
            if self._resource_id is not None:
                return
            pkg = await client.get(f"{_CKAN_BASE}/package_show", params={"id": _PACKAGE})
            pkg.raise_for_status()
            resources = pkg.json()["result"]["resources"]
            self._resource_id = next(
                (r["id"] for r in resources if r.get("datastore_active")), None
            ) or next(
                (r["id"] for r in resources if r.get("format", "").upper() in ("CSV", "JSON")),
                None,
            )

    async def _discover_fields(self, client: httpx.AsyncClient) -> None:
        if self._date_field is not None:
            return
        resp = await client.get(
            f"{_CKAN_BASE}/datastore_search",
            params={"resource_id": self._resource_id, "limit": 1},
        )
        resp.raise_for_status()
        fields = [f["id"] for f in resp.json()["result"].get("fields", [])]
        upper = [f.upper() for f in fields]

        self._date_field = next(
            (fields[i] for i, u in enumerate(upper) if "APPLICATION" in u and "DATE" in u),
            next((fields[i] for i, u in enumerate(upper) if "DATE" in u), None),
        )
        self._work_field = next(
            (fields[i] for i, u in enumerate(upper) if "WORK_TYPE" in u or "WORKTYPE" in u),
            next((fields[i] for i, u in enumerate(upper) if "PERMIT_TYPE" in u or "TYPE" in u), None),
        )
        self._lat_field = next(
            (fields[i] for i, u in enumerate(upper) if u in ("LATITUDE", "GEO_LATITUDE", "LAT")), None
        )
        self._lon_field = next(
            (fields[i] for i, u in enumerate(upper) if u in ("LONGITUDE", "GEO_LONGITUDE", "LON", "LNG", "LONG")), None
        )

    async def _fetch_records(
        self, client: httpx.AsyncClient, location: GeocodeResult
    ) -> list[dict]:
        """
        Primary: bbox-SQL + 30m haversine (PRD §8.2).
        Fallback: q= text search when permit rows lack coordinates.
        """
        if self._lat_field and self._lon_field:
            try:
                lat, lon = location.latitude, location.longitude
                sql = (
                    f'SELECT * FROM "{self._resource_id}" '
                    f'WHERE "{self._lat_field}" BETWEEN {lat - _BBOX_LAT} AND {lat + _BBOX_LAT} '
                    f'AND "{self._lon_field}" BETWEEN {lon - _BBOX_LON} AND {lon + _BBOX_LON}'
                )
                resp = await client.get(f"{_CKAN_BASE}/datastore_search_sql", params={"sql": sql})
                resp.raise_for_status()
                candidates = resp.json()["result"]["records"]
                matched = [
                    r for r in candidates
                    if _safe_haversine(lat, lon, r.get(self._lat_field), r.get(self._lon_field))
                    <= _PERMIT_MATCH_RADIUS_M
                ]
                if matched or candidates:
                    return matched
            except Exception:
                pass  # fall through to text search

        search_term = _address_search_term(location)
        resp = await client.get(
            f"{_CKAN_BASE}/datastore_search",
            params={"resource_id": self._resource_id, "q": search_term, "limit": 100},
        )
        resp.raise_for_status()
        return resp.json()["result"]["records"]

    async def lookup(self, location: GeocodeResult) -> ActivePermitsEvidence:
        try:
            return await self._query(location)
        except Exception:
            return ActivePermitsEvidence(
                permit_count=0, structural_count=0, elevated_risk_count=0,
                top_work_types=[], confidence="UNKNOWN", source="heuristic-fallback",
            )

    async def _query(self, location: GeocodeResult) -> ActivePermitsEvidence:
        today = date.today()

        async with httpx.AsyncClient(timeout=30.0) as client:
            await self._ensure_resource(client)
            if not self._resource_id:
                return ActivePermitsEvidence(
                    permit_count=0, structural_count=0, elevated_risk_count=0,
                    top_work_types=[], confidence="UNKNOWN", source="ckan-active-permits",
                )
            await self._discover_fields(client)
            records = await self._fetch_records(client, location)

        if not records:
            return ActivePermitsEvidence(
                permit_count=0, structural_count=0, elevated_risk_count=0,
                top_work_types=[], confidence="LOW", source="ckan-active-permits",
            )

        structural_count = 0
        elevated_risk_count = 0
        work_type_counts: dict[str, int] = {}
        has_date = False
        incomplete_date = False

        for rec in records:
            raw_work = str(rec.get(self._work_field, "") or "") if self._work_field else ""
            category = _classify_work(raw_work)
            work_type_counts[category] = work_type_counts.get(category, 0) + 1
            if category == "structural":
                structural_count += 1

            raw_date = rec.get(self._date_field) if self._date_field else None
            app_date = _parse_date(str(raw_date)) if raw_date else None
            if app_date:
                has_date = True
                if app_date < _INCOMPLETE_DATE_CUTOFF:
                    incomplete_date = True
                if (today - app_date).days > _ELEVATED_RISK_DAYS:
                    elevated_risk_count += 1

        confidence = "MEDIUM" if (not has_date or incomplete_date) else "HIGH"
        top_work_types = sorted(work_type_counts, key=work_type_counts.__getitem__, reverse=True)[:3]

        return ActivePermitsEvidence(
            permit_count=len(records),
            structural_count=structural_count,
            elevated_risk_count=elevated_risk_count,
            top_work_types=top_work_types,
            confidence=confidence,
            source="ckan-active-permits",
        )


# ---------------------------------------------------------------------------
# Cleared Building Permits — historical condition signal (Parameter 4)
# ---------------------------------------------------------------------------

class ClearedPermitsService:
    def __init__(self) -> None:
        self._resource_id: str | None = None
        self._date_field: str | None = None
        self._work_field: str | None = None
        self._lat_field: str | None = None
        self._lon_field: str | None = None
        self._lock = asyncio.Lock()

    async def _ensure_resource(self, client: httpx.AsyncClient) -> None:
        if self._resource_id is not None:
            return
        async with self._lock:
            if self._resource_id is not None:
                return
            pkg = await client.get(f"{_CKAN_BASE}/package_show", params={"id": _CLEARED_PACKAGE})
            pkg.raise_for_status()
            resources = pkg.json()["result"]["resources"]
            self._resource_id = next(
                (r["id"] for r in resources if r.get("datastore_active")), None
            ) or next(
                (r["id"] for r in resources if r.get("format", "").upper() in ("CSV", "JSON")),
                None,
            )

    async def _discover_fields(self, client: httpx.AsyncClient) -> None:
        if self._date_field is not None:
            return
        resp = await client.get(
            f"{_CKAN_BASE}/datastore_search",
            params={"resource_id": self._resource_id, "limit": 1},
        )
        resp.raise_for_status()
        fields = [f["id"] for f in resp.json()["result"].get("fields", [])]
        upper = [f.upper() for f in fields]

        self._date_field = next(
            (fields[i] for i, u in enumerate(upper) if "CLEARED" in u and "DATE" in u),
            next(
                (fields[i] for i, u in enumerate(upper) if "COMPLET" in u and "DATE" in u),
                next((fields[i] for i, u in enumerate(upper) if "DATE" in u), None),
            ),
        )
        self._work_field = next(
            (fields[i] for i, u in enumerate(upper) if "WORK_TYPE" in u or "WORKTYPE" in u),
            next((fields[i] for i, u in enumerate(upper) if "PERMIT_TYPE" in u or "TYPE" in u), None),
        )
        self._lat_field = next(
            (fields[i] for i, u in enumerate(upper) if u in ("LATITUDE", "GEO_LATITUDE", "LAT")), None
        )
        self._lon_field = next(
            (fields[i] for i, u in enumerate(upper) if u in ("LONGITUDE", "GEO_LONGITUDE", "LON", "LNG", "LONG")), None
        )

    async def _fetch_records(
        self, client: httpx.AsyncClient, location: GeocodeResult
    ) -> list[dict]:
        if self._lat_field and self._lon_field:
            try:
                lat, lon = location.latitude, location.longitude
                sql = (
                    f'SELECT * FROM "{self._resource_id}" '
                    f'WHERE "{self._lat_field}" BETWEEN {lat - _BBOX_LAT} AND {lat + _BBOX_LAT} '
                    f'AND "{self._lon_field}" BETWEEN {lon - _BBOX_LON} AND {lon + _BBOX_LON}'
                )
                resp = await client.get(f"{_CKAN_BASE}/datastore_search_sql", params={"sql": sql})
                resp.raise_for_status()
                candidates = resp.json()["result"]["records"]
                matched = [
                    r for r in candidates
                    if _safe_haversine(lat, lon, r.get(self._lat_field), r.get(self._lon_field))
                    <= _PERMIT_MATCH_RADIUS_M
                ]
                if matched or candidates:
                    return matched
            except Exception:
                pass

        search_term = _address_search_term(location)
        resp = await client.get(
            f"{_CKAN_BASE}/datastore_search",
            params={"resource_id": self._resource_id, "q": search_term, "limit": 200},
        )
        resp.raise_for_status()
        return resp.json()["result"]["records"]

    async def lookup(self, location: GeocodeResult) -> ClearedPermitsEvidence:
        try:
            return await self._query(location)
        except Exception:
            return ClearedPermitsEvidence(
                permit_count=0, structural_count=0, structural_last_10y=0,
                years_since_last_permit=None, deferred_maintenance=False,
                chronic_issues=False, confidence="UNKNOWN", source="heuristic-fallback",
            )

    async def _query(self, location: GeocodeResult) -> ClearedPermitsEvidence:
        today = date.today()
        cutoff_10y = date(today.year - _STRUCTURAL_LOOKBACK_YEARS, today.month, today.day)
        cutoff_15y = date(today.year - _DEFERRED_MAINTENANCE_YEARS, today.month, today.day)

        async with httpx.AsyncClient(timeout=30.0) as client:
            await self._ensure_resource(client)
            if not self._resource_id:
                return ClearedPermitsEvidence(
                    permit_count=0, structural_count=0, structural_last_10y=0,
                    years_since_last_permit=None, deferred_maintenance=False,
                    chronic_issues=False, confidence="UNKNOWN", source="ckan-cleared-permits",
                )
            await self._discover_fields(client)
            records = await self._fetch_records(client, location)

        if not records:
            return ClearedPermitsEvidence(
                permit_count=0, structural_count=0, structural_last_10y=0,
                years_since_last_permit=None, deferred_maintenance=True,
                chronic_issues=False, confidence="LOW", source="ckan-cleared-permits",
            )

        structural_count = 0
        structural_last_10y = 0
        most_recent: date | None = None
        has_valid_date = False
        permits_in_last_15y = 0

        for rec in records:
            raw_work = str(rec.get(self._work_field, "") or "") if self._work_field else ""
            is_structural = _classify_work(raw_work) == "structural"
            if is_structural:
                structural_count += 1

            raw_date = rec.get(self._date_field) if self._date_field else None
            cleared_date = _parse_date(str(raw_date)) if raw_date else None
            if cleared_date:
                has_valid_date = True
                if most_recent is None or cleared_date > most_recent:
                    most_recent = cleared_date
                if cleared_date >= cutoff_15y:
                    permits_in_last_15y += 1
                if is_structural and cleared_date >= cutoff_10y:
                    structural_last_10y += 1

        years_since_last = (today - most_recent).days // 365 if most_recent else None
        deferred_maintenance = permits_in_last_15y == 0
        chronic_issues = structural_count >= _CHRONIC_ISSUES_THRESHOLD

        return ClearedPermitsEvidence(
            permit_count=len(records),
            structural_count=structural_count,
            structural_last_10y=structural_last_10y,
            years_since_last_permit=years_since_last,
            deferred_maintenance=deferred_maintenance,
            chronic_issues=chronic_issues,
            confidence="HIGH" if has_valid_date else "MEDIUM",
            source="ckan-cleared-permits",
        )
