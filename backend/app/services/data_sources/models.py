from dataclasses import dataclass


@dataclass
class HeritageEvidence:
    status: str
    reason: str
    source: str
    confidence: str = "UNKNOWN"


@dataclass
class HCDEvidence:
    in_district: bool
    district_name: str | None
    source: str
    confidence: str = "HIGH"


@dataclass
class FloodEvidence:
    status: str            # "elevated" | "moderate" | "low"
    in_flood_zone: bool    # True for elevated only (backward compat for engine cost calc)
    internal_loading: int  # engine cost estimate — never surface in output
    source: str


@dataclass
class ActivePermitsEvidence:
    permit_count: int
    structural_count: int
    elevated_risk_count: int   # permits open > 2 years
    top_work_types: list[str]
    confidence: str
    source: str


@dataclass
class ClearedPermitsEvidence:
    permit_count: int
    structural_count: int          # all-time structural permits
    structural_last_10y: int       # feeds Building Health Path B (param 7)
    years_since_last_permit: int | None
    deferred_maintenance: bool     # zero permits in last 15 years
    chronic_issues: bool           # 5+ structural permits
    confidence: str
    source: str


@dataclass
class BuildingHealthEvidence:
    path: str          # "rentsafeto" | "permit_history"
    status: str        # "elevated" | "due_diligence" | "pass"
    score: int | None  # RentSafeTO score if Path A; None for Path B
    message: str | None
    disclaimer: str
    confidence: str
    source: str


@dataclass
class DevelopmentEvidence:
    application_count_500m: int
    intensity: str
    source: str
