from typing import Literal

from pydantic import BaseModel, Field


BuyerProfile = Literal["first_time", "investor", "downsizer"]
PropertyType = Literal["condo", "condo_townhouse", "semi_detached", "detached_urban", "detached_suburban"]
Severity = Literal["red", "yellow", "green", "info"]


class ReportRequest(BaseModel):
    address: str = Field(min_length=3)
    list_price: float = Field(gt=0)
    buyer_profile: BuyerProfile
    property_type: PropertyType = "detached_urban"
    down_payment_percent: float = Field(ge=5, le=100)
    mortgage_rate: float = Field(gt=0, le=30)
    amortization_years: int = Field(ge=5, le=35)


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
    true_10_year_cost: int
    cost_breakdown: list[CostComponent]
    mortgage_scenarios: list[ScenarioCost]
    flags: list[RiskFlag]
    warnings: list[str]
    evidence_summary: EvidenceSummary
    key_numbers: KeyNumbers
    summary_text: str | None = None
