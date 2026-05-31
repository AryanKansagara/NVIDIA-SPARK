from dataclasses import dataclass, field


# ---------------------------------------------------------------------------
# Standardized signal contract (PRD section 2.3)
# ---------------------------------------------------------------------------

@dataclass
class Signal:
    signal_name: str
    signal_type: str   # "observed" | "inferred" | "simulated"
    value: str
    confidence: str    # "High" | "Medium" | "Low" | "UNKNOWN"
    source: str
    data_coverage: str
    message: str


@dataclass
class CompositeSignal:
    signal_name: str
    signal_type: str   # always "inferred"
    value: str         # "Low" | "Medium" | "Elevated" (maintenance) or "Low"|"Medium"|"High" (tax)
    confidence: str    # always "Low" per spec
    factors: list[str] = field(default_factory=list)
    disclaimer: str = ""


# ---------------------------------------------------------------------------
# Evidence models (internal per-source results)
# ---------------------------------------------------------------------------

@dataclass
class HeritageEvidence:
    status: str
    reason: str
    source: str
    confidence: str = "UNKNOWN"

    def to_signal(self) -> Signal:
        _value_map = {
            "part_iv":                 "Part IV designated",
            "part_v":                  "Part V — Heritage Conservation District",
            "listed":                  "Listed (not yet designated)",
            "part_iv_or_sensitive_core": "Heritage-sensitive area",
            "no_match":                "No match",
        }
        return Signal(
            signal_name="Heritage Designation",
            signal_type="observed",
            value=_value_map.get(self.status, self.status),
            confidence=self.confidence,
            source=self.source,
            data_coverage="May 2026 snapshot — 12,320 properties, CKAN API",
            message=self.reason or f"No record found for this address in heritage-register. Manual verification recommended.",
        )


@dataclass
class HCDEvidence:
    in_district: bool
    district_name: str | None
    source: str
    confidence: str = "HIGH"

    def to_signal(self) -> Signal:
        if self.in_district:
            value = f"In district{f': {self.district_name}' if self.district_name else ''}"
            message = (
                f"This property is in a Heritage Conservation District"
                f"{f' ({self.district_name})' if self.district_name else ''}. "
                "Neighbourhood-level heritage restrictions apply."
            )
        else:
            value = "Not in district"
            message = "No Heritage Conservation District boundary intersects this property."
        return Signal(
            signal_name="Heritage Conservation District",
            signal_type="observed",
            value=value,
            confidence=self.confidence,
            source=self.source,
            data_coverage="~30 district polygons, CKAN API (March 2026)",
            message=message,
        )


@dataclass
class FloodEvidence:
    status: str            # "elevated" | "moderate" | "low"
    in_flood_zone: bool    # True for elevated only
    internal_loading: int  # engine cost estimate — never surface in output
    source: str

    def to_signal(self) -> Signal:
        _messages = {
            "elevated": (
                "Flood Exposure: Elevated. This property intersects a TRCA flood-risk area. "
                "Insurance implications vary significantly by insurer and property characteristics. "
                "Verify coverage and premiums directly with your insurer."
            ),
            "moderate": (
                "Flood Exposure: Moderate. This property is near a TRCA flood-risk area. "
                "Verify flood risk and insurance implications with your insurer."
            ),
            "low": "No TRCA flood zone intersection detected.",
        }
        return Signal(
            signal_name="Flood Zone Exposure",
            signal_type="observed",
            value=self.status.capitalize(),
            confidence="High" if "fallback" not in self.source else "UNKNOWN",
            source=self.source,
            data_coverage="2026 (live TRCA ArcGIS API)",
            message=_messages.get(self.status, ""),
        )


@dataclass
class ActivePermitsEvidence:
    permit_count: int
    structural_count: int
    elevated_risk_count: int   # permits open > 2 years
    top_work_types: list[str]
    confidence: str
    source: str

    def to_signal(self) -> Signal:
        if self.structural_count > 0:
            value = f"{self.structural_count} active structural permit(s)"
            message = f"{self.structural_count} active structural permit(s) found. Unresolved permits transfer to the buyer at closing."
        elif self.permit_count > 0:
            value = f"{self.permit_count} active permit(s)"
            message = f"{self.permit_count} active permit(s) found ({', '.join(self.top_work_types)}). Review before purchase."
        else:
            value = "No active permits"
            message = "No active building permits found for this address."
        return Signal(
            signal_name="Active Building Permits",
            signal_type="observed",
            value=value,
            confidence=self.confidence,
            source=self.source,
            data_coverage="228,573 records, daily refresh, CKAN API",
            message=message,
        )


@dataclass
class ClearedPermitsEvidence:
    permit_count: int
    structural_count: int
    structural_last_10y: int
    years_since_last_permit: int | None
    deferred_maintenance: bool
    chronic_issues: bool
    confidence: str
    source: str

    def to_signal(self) -> Signal:
        if self.chronic_issues:
            value = f"{self.structural_count} structural permits (elevated maintenance complexity)"
            message = "Elevated maintenance complexity signal — notable structural permit history."
        elif self.deferred_maintenance:
            value = "No permits in 15+ years"
            message = "Deferred maintenance signal — no building permits in the last 15 years."
        else:
            years_note = f" Last permit: {self.years_since_last_permit} years ago." if self.years_since_last_permit else ""
            value = f"{self.permit_count} historical permit(s)"
            message = f"No elevated permit history signals.{years_note}"
        return Signal(
            signal_name="Cleared Building Permits (Historical)",
            signal_type="observed",
            value=value,
            confidence=self.confidence,
            source=self.source,
            data_coverage="401,265 records, daily refresh, CKAN API",
            message=message,
        )


@dataclass
class BuildingHealthEvidence:
    path: str          # "rentsafeto" | "permit_history"
    status: str        # "elevated" | "due_diligence" | "pass"
    score: int | None
    message: str | None
    disclaimer: str
    confidence: str
    source: str

    def to_signal(self) -> Signal:
        path_label = "RentSafeTO" if self.path == "rentsafeto" else "Structural Permit History"
        score_note = f" (score: {self.score})" if self.score is not None else ""
        return Signal(
            signal_name=f"Building Health — {path_label}",
            signal_type="observed",
            value=f"{self.status.replace('_', ' ').title()}{score_note}",
            confidence=self.confidence,
            source=self.source,
            data_coverage="5,340 records (RentSafeTO) or permit history — daily refresh",
            message=self.message or "No building health concerns detected.",
        )


@dataclass
class DevelopmentEvidence:
    application_count_500m: int
    intensity: str
    source: str

    def to_signal(self) -> Signal:
        _messages = {
            "high": (
                "High neighbourhood intensification signal detected. Significant redevelopment "
                "activity is occurring nearby. This may affect future neighbourhood character, "
                "density, and property values."
            ),
            "medium": (
                "Neighbourhood showing early intensification signals. This may affect future "
                "neighbourhood character, density, and property values."
            ),
            "low": "Low development pressure — fewer than 5 active applications within 500m.",
        }
        return Signal(
            signal_name="Neighbourhood Intensification",
            signal_type="inferred",
            value=self.intensity.capitalize(),
            confidence="Medium",
            source=self.source,
            data_coverage="26,254 applications 2008–2026, daily refresh, CKAN API",
            message=_messages.get(self.intensity, ""),
        )
