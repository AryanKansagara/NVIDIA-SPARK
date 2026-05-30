import asyncio
from datetime import date, datetime

import httpx

from app.services.data_sources.models import ActivePermitsEvidence, ClearedPermitsEvidence
from app.services.geocoding.service import GeocodeResult

_CKAN_BASE = "https://ckan0.cf.opendata.inter.prod-toronto.ca/api/3/action"
_PACKAGE = "building-permits-active-permits"

# Permit open > 2 years = elevated risk per spec
_ELEVATED_RISK_DAYS = 365 * 2

# Cut-off before which APPLICATION_DATE is considered incomplete per dataset docs
_INCOMPLETE_DATE_CUTOFF = date(1999, 10, 1)

_STRUCTURAL = frozenset(["structural", "foundation", "framing", "addition", "demolit", "new build", "unsafe", "major repair", "emergency"])
_ELECTRICAL = frozenset(["electric"])
_PLUMBING   = frozenset(["plumb", "drain", "sewer", "water service"])
_MECHANICAL = frozenset(["mechanical", "hvac", "heat", "ventil"])


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
    """Extract street number + first street name word for CKAN full-text search."""
    parts = location.normalized_address.split(",")[0].split()
    return " ".join(parts[:2]) if len(parts) >= 2 else parts[0]


class ActivePermitsService:
    def __init__(self) -> None:
        self._resource_id: str | None = None
        self._date_field: str | None = None
        self._work_field: str | None = None
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

    async def lookup(self, location: GeocodeResult) -> ActivePermitsEvidence:
        try:
            return await self._query(location)
        except Exception:
            return ActivePermitsEvidence(
                permit_count=0,
                structural_count=0,
                elevated_risk_count=0,
                top_work_types=[],
                confidence="UNKNOWN",
                source="heuristic-fallback",
            )

    async def _query(self, location: GeocodeResult) -> ActivePermitsEvidence:
        search_term = _address_search_term(location)
        today = date.today()

        async with httpx.AsyncClient(timeout=30.0) as client:
            await self._ensure_resource(client)
            if not self._resource_id:
                return ActivePermitsEvidence(
                    permit_count=0,
                    structural_count=0,
                    elevated_risk_count=0,
                    top_work_types=[],
                    confidence="UNKNOWN",
                    source="ckan-active-permits",
                )

            await self._discover_fields(client)

            resp = await client.get(
                f"{_CKAN_BASE}/datastore_search",
                params={"resource_id": self._resource_id, "q": search_term, "limit": 100},
            )
            resp.raise_for_status()
            records = resp.json()["result"]["records"]

        if not records:
            return ActivePermitsEvidence(
                permit_count=0,
                structural_count=0,
                elevated_risk_count=0,
                top_work_types=[],
                confidence="LOW",
                source="ckan-active-permits",
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

        # Spec confidence rules
        if not has_date:
            confidence = "MEDIUM"
        elif incomplete_date:
            confidence = "MEDIUM"
        else:
            confidence = "HIGH"

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

_CLEARED_PACKAGE = "building-permits-cleared-permits"
_DEFERRED_MAINTENANCE_YEARS = 15
_CHRONIC_ISSUES_THRESHOLD = 5
_STRUCTURAL_LOOKBACK_YEARS = 10


class ClearedPermitsService:
    def __init__(self) -> None:
        self._resource_id: str | None = None
        self._date_field: str | None = None
        self._work_field: str | None = None
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

        # Prefer cleared/completed date over application date for recency signal
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

    async def lookup(self, location: GeocodeResult) -> ClearedPermitsEvidence:
        try:
            return await self._query(location)
        except Exception:
            return ClearedPermitsEvidence(
                permit_count=0,
                structural_count=0,
                structural_last_10y=0,
                years_since_last_permit=None,
                deferred_maintenance=False,
                chronic_issues=False,
                confidence="UNKNOWN",
                source="heuristic-fallback",
            )

    async def _query(self, location: GeocodeResult) -> ClearedPermitsEvidence:
        search_term = _address_search_term(location)
        today = date.today()
        cutoff_10y = date(today.year - _STRUCTURAL_LOOKBACK_YEARS, today.month, today.day)
        cutoff_15y = date(today.year - _DEFERRED_MAINTENANCE_YEARS, today.month, today.day)

        async with httpx.AsyncClient(timeout=30.0) as client:
            await self._ensure_resource(client)
            if not self._resource_id:
                return ClearedPermitsEvidence(
                    permit_count=0,
                    structural_count=0,
                    structural_last_10y=0,
                    years_since_last_permit=None,
                    deferred_maintenance=False,
                    chronic_issues=False,
                    confidence="UNKNOWN",
                    source="ckan-cleared-permits",
                )

            await self._discover_fields(client)

            resp = await client.get(
                f"{_CKAN_BASE}/datastore_search",
                params={"resource_id": self._resource_id, "q": search_term, "limit": 200},
            )
            resp.raise_for_status()
            records = resp.json()["result"]["records"]

        if not records:
            return ClearedPermitsEvidence(
                permit_count=0,
                structural_count=0,
                structural_last_10y=0,
                years_since_last_permit=None,
                deferred_maintenance=True,   # no permits ever found = deferred maintenance signal
                chronic_issues=False,
                confidence="LOW",
                source="ckan-cleared-permits",
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

        years_since_last = (
            (today - most_recent).days // 365 if most_recent else None
        )
        deferred_maintenance = permits_in_last_15y == 0
        chronic_issues = structural_count >= _CHRONIC_ISSUES_THRESHOLD
        confidence = "HIGH" if has_valid_date else "MEDIUM"

        return ClearedPermitsEvidence(
            permit_count=len(records),
            structural_count=structural_count,
            structural_last_10y=structural_last_10y,
            years_since_last_permit=years_since_last,
            deferred_maintenance=deferred_maintenance,
            chronic_issues=chronic_issues,
            confidence=confidence,
            source="ckan-cleared-permits",
        )
