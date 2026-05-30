import asyncio

import httpx

from app.services.data_sources.models import (
    ActivePermitsEvidence,
    BuildingHealthEvidence,
    ClearedPermitsEvidence,
)
from app.services.geocoding.service import GeocodeResult

_CKAN_BASE = "https://ckan0.cf.opendata.inter.prod-toronto.ca/api/3/action"
_RENTSAFETO_PACKAGE = "apartment-building-evaluation"

_DISCLAIMER = (
    "No RentSafeTO score available does not indicate lower risk — "
    "condos, co-ops, and smaller buildings are not covered by this program."
)


class BuildingHealthService:
    def __init__(self) -> None:
        self._resource_id: str | None = None
        self._score_field: str | None = None
        self._addr_field: str | None = None
        self._year_field: str | None = None
        self._name_field: str | None = None
        self._lock = asyncio.Lock()

    async def _ensure_resource(self, client: httpx.AsyncClient) -> None:
        if self._resource_id is not None:
            return
        async with self._lock:
            if self._resource_id is not None:
                return
            pkg = await client.get(f"{_CKAN_BASE}/package_show", params={"id": _RENTSAFETO_PACKAGE})
            pkg.raise_for_status()
            resources = pkg.json()["result"]["resources"]
            self._resource_id = next(
                (r["id"] for r in resources if r.get("datastore_active")), None
            ) or next(
                (r["id"] for r in resources if r.get("format", "").upper() in ("CSV", "JSON")),
                None,
            )

    async def _discover_fields(self, client: httpx.AsyncClient) -> None:
        if self._score_field is not None:
            return
        resp = await client.get(
            f"{_CKAN_BASE}/datastore_search",
            params={"resource_id": self._resource_id, "limit": 1},
        )
        resp.raise_for_status()
        fields = [f["id"] for f in resp.json()["result"].get("fields", [])]
        upper = [f.upper() for f in fields]

        self._score_field = next(
            (fields[i] for i, u in enumerate(upper) if "SCORE" in u), None
        )
        self._addr_field = next(
            (fields[i] for i, u in enumerate(upper) if "ADDR" in u or "ADDRESS" in u), None
        )
        self._year_field = next(
            (fields[i] for i, u in enumerate(upper) if "YEAR" in u or "DATE" in u), None
        )
        self._name_field = next(
            (fields[i] for i, u in enumerate(upper) if "SITE" in u or "NAME" in u or "BUILDING" in u), None
        )

    async def lookup(
        self,
        location: GeocodeResult,
        active_permits: ActivePermitsEvidence | None = None,
        cleared_permits: ClearedPermitsEvidence | None = None,
    ) -> BuildingHealthEvidence:
        # Try Path A (RentSafeTO) first
        try:
            result = await self._path_a(location)
            if result is not None:
                return result
        except Exception:
            pass

        # Fall back to Path B (structural permit history)
        return self._path_b(active_permits, cleared_permits)

    async def _path_a(self, location: GeocodeResult) -> BuildingHealthEvidence | None:
        search_term = location.normalized_address.split(",")[0].split()
        search_str = " ".join(search_term[:2]) if len(search_term) >= 2 else search_term[0]

        async with httpx.AsyncClient(timeout=20.0) as client:
            await self._ensure_resource(client)
            if not self._resource_id:
                return None

            await self._discover_fields(client)

            resp = await client.get(
                f"{_CKAN_BASE}/datastore_search",
                params={"resource_id": self._resource_id, "q": search_str, "limit": 10},
            )
            resp.raise_for_status()
            records = resp.json()["result"]["records"]

        if not records:
            return None

        rec = records[0]
        raw_score = rec.get(self._score_field) if self._score_field else None
        try:
            score = int(float(raw_score)) if raw_score is not None else None
        except (TypeError, ValueError):
            score = None

        if score is None:
            return None

        if score < 70:
            status = "elevated"
            message = "Elevated review recommended."
        elif score <= 85:
            status = "due_diligence"
            message = "Further due diligence recommended."
        else:
            status = "pass"
            message = None

        return BuildingHealthEvidence(
            path="rentsafeto",
            status=status,
            score=score,
            message=message,
            disclaimer=_DISCLAIMER,
            confidence="MEDIUM",
            source="ckan-rentsafeto",
        )

    def _path_b(
        self,
        active_permits: ActivePermitsEvidence | None,
        cleared_permits: ClearedPermitsEvidence | None,
    ) -> BuildingHealthEvidence:
        structural_active = active_permits.structural_count if active_permits else 0
        structural_cleared_10y = cleared_permits.structural_last_10y if cleared_permits else 0

        if structural_active > 0:
            status = "elevated"
            message = "Active structural permit found. Review permit details before purchase."
        elif structural_cleared_10y >= 3:
            status = "due_diligence"
            message = (
                "Further due diligence recommended — this property has a notable structural permit history."
            )
        else:
            status = "pass"
            message = None

        return BuildingHealthEvidence(
            path="permit_history",
            status=status,
            score=None,
            message=message,
            disclaimer=_DISCLAIMER,
            confidence="MEDIUM",
            source="ckan-building-permits",
        )
