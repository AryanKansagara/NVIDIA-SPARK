from typing import Literal

from pydantic import BaseModel, Field


BuyerProfile = Literal["first_time", "investor", "downsizer"]
Severity = Literal["red", "yellow", "green", "info"]


class ReportRequest(BaseModel):
    address: str = Field(min_length=3)
    list_price: float = Field(gt=0)
    buyer_profile: BuyerProfile
    down_payment_percent: float = Field(default=20.0, ge=5, le=100)
    mortgage_rate: float = Field(default=5.5, gt=0, le=30)
    amortization_years: int = Field(default=25, ge=5, le=35)
    # When the address was chosen from an autocomplete suggestion the client sends
    # the exact coordinates so the backend can skip the ambiguous re-geocode and pin
    # the map precisely where the user selected.
    latitude: float | None = Field(default=None, ge=-90, le=90)
    longitude: float | None = Field(default=None, ge=-180, le=180)


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
    confidence: Literal["High", "Medium", "Low"] = "High"
    detail: str | None = None  # long evidence explanation rendered in the card body
    say_at_table: str | None = None  # negotiation script ("say this at the table")
    leverage_low: int | None = None  # supports $X price-reduction request (low end)
    leverage_high: int | None = None  # supports $X price-reduction request (high end)
    source: str | None = None  # dataset / API the evidence came from


class CompositeSignal(BaseModel):
    signal_name: str
    signal_type: Literal["inferred"] = "inferred"
    value: Literal["Low", "Medium", "Elevated", "High"]
    label: str
    factors: list[str]
    disclaimer: str
    confidence: Literal["Low"] = "Low"


class CostRow(BaseModel):
    key: str
    label: str
    annual: int | None = None  # None for one-time costs (LTT, CMHC premium)
    total: int  # total over the selected horizon
    confidence: Literal["High", "Medium", "Low"]
    one_time: bool = False
    is_credit: bool = False  # transit dividend renders as a credit (negative)


class AgentReasoning(BaseModel):
    agent: str  # "intake" | "data_retrieval" | "analysis" | "synthesis"
    title: str  # "AGENT 1 — INTAKE + PLANNING"
    mode: str  # "LLM CALL #1" | "DETERMINISTIC, ASYNC" | ...
    body: str


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


class CommunityInsight(BaseModel):
    headline: str
    median_estimate: int
    typical_range_low: int
    typical_range_high: int
    price_per_sqft_estimate: int
    trend: Literal["rising", "stable", "cooling"]
    notes: list[str]


class PipelineStep(BaseModel):
    name: str
    started_ms: float  # offset from pipeline start
    elapsed_ms: float
    parallel_group: int  # steps sharing a group ran concurrently


class MapGeometry(BaseModel):
    property_lat: float
    property_lon: float
    flood_polygon_geojson: dict | None = None
    dev_pressure_radius_m: int = 500
    community_insights: CommunityInsight | None = None


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
    monte_carlo_horizons: dict[str, MonteCarloResult] = Field(default_factory=dict)
    horizon_costs: dict[str, int] = Field(default_factory=dict)
    composite_signals: list[CompositeSignal] = Field(default_factory=list)
    cost_rows_by_horizon: dict[str, list[CostRow]] = Field(default_factory=dict)
    agent_reasoning: list[AgentReasoning] = Field(default_factory=list)
    map_geometry: MapGeometry | None = None
    pipeline_trace: list[PipelineStep] = Field(default_factory=list)
