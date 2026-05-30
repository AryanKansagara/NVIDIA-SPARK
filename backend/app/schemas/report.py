from typing import Literal

from pydantic import BaseModel, Field


BuyerProfile = Literal["first_time", "investor", "downsizer"]
Severity = Literal["red", "yellow", "green", "info"]


class ReportRequest(BaseModel):
    address: str = Field(min_length=3)
    list_price: float = Field(gt=0)
    buyer_profile: BuyerProfile
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
    flood: dict
    development: dict


class KeyNumbers(BaseModel):
    land_transfer_tax_total: int
    property_tax_10y: int
    insured_mortgage_premium: int
    mortgage_cost_10y_base: int
    transit_dividend: int


class MonteCarloResult(BaseModel):
    p10: int
    p50: int
    p90: int
    mean: int
    trajectories_sampled: int
    elapsed_ms: float | None = None


class MapGeometry(BaseModel):
    property_lat: float
    property_lon: float
    flood_polygon_geojson: dict | None = None
    dev_pressure_radius_m: int = 500


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
    monte_carlo: MonteCarloResult | None = None
    map_geometry: MapGeometry | None = None
