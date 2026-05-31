from typing import Literal

from pydantic import BaseModel, Field

_REPORT_DISCLAIMER = (
    "Analysis based on publicly available data current as of 2026. "
    "Some sources reflect historical snapshots (MPAC assessed values frozen at "
    "January 1, 2016). This tool surfaces ownership-risk signals and "
    "due-diligence prompts — it is not financial, legal, or insurance advice."
)

BuyerProfile = Literal["first_time", "investor", "downsizer"]
PropertyType = Literal["condo", "condo_townhouse", "semi_detached", "detached_urban", "detached_suburban"]
Severity = Literal["red", "yellow", "green", "info"]


class ReportRequest(BaseModel):
    address: str = Field(min_length=3)
    list_price: float = Field(ge=100_000, le=10_000_000)
    buyer_profile: BuyerProfile
    property_type: PropertyType = "detached_urban"
    down_payment_percent: float = Field(ge=5, le=100)
    mortgage_rate: float = Field(ge=0.5, le=15.0)
    amortization_years: int = Field(ge=15, le=30)


class ResolvedProperty(BaseModel):
    address: str
    normalized_address: str
    latitude: float
    longitude: float
    ward: str | None = None


class CostComponent(BaseModel):
    key: str
    label: str
    amount: int


class ScenarioCost(BaseModel):
    scenario: Literal["bull", "base", "bear"]
    total_cost: int


class RiskFlag(BaseModel):
    severity: Severity
    title: str
    message: str


# Standardized signal output (PRD section 2.3)
class SignalOut(BaseModel):
    signal_name: str
    signal_type: Literal["observed", "inferred", "simulated"]
    value: str
    confidence: str
    source: str
    data_coverage: str
    message: str


class CompositeSignalOut(BaseModel):
    signal_name: str
    signal_type: Literal["inferred"] = "inferred"
    value: str
    confidence: str = "Low"
    factors: list[str] = []
    disclaimer: str = ""


class EvidenceSummary(BaseModel):
    geocoder: dict
    heritage: dict
    hcd: dict
    active_permits: dict
    cleared_permits: dict
    building_health: dict
    property_tax: dict
    flood: dict
    development: dict


class KeyNumbers(BaseModel):
    land_transfer_tax_total: int
    property_tax_10y: int
    insured_mortgage_premium: int
    mortgage_cost_10y_base: int
    transit_dividend: int


class ReportResponse(BaseModel):
    property: ResolvedProperty
    verdict_level: str       # "RED" | "YELLOW" | "GREEN"
    verdict_headline: str
    true_cost: int
    cash_outflow_10y: int
    cost_breakdown: list[CostComponent]
    mortgage_scenarios: list[ScenarioCost]
    flags: list[RiskFlag]
    warnings: list[str]
    evidence_summary: EvidenceSummary
    signals: list[SignalOut]
    composite_signals: list[CompositeSignalOut]
    key_numbers: KeyNumbers
    as_of: str = "2026"
    disclaimer: str = _REPORT_DISCLAIMER
    summary_text: str | None = None
