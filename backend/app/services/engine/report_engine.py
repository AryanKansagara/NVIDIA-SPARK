from dataclasses import dataclass, field

from app.core.config import Settings
from app.schemas.report import (
    CompositeSignal,
    CostComponent,
    CostRow,
    KeyNumbers,
    RiskFlag,
    ScenarioCost,
)
from app.services.data_sources.models import DevelopmentEvidence, FloodEvidence, HeritageEvidence


@dataclass
class EngineInput:
    list_price: float
    buyer_profile: str
    down_payment_percent: float
    mortgage_rate: float
    amortization_years: int
    address: str
    heritage: HeritageEvidence
    flood: FloodEvidence
    development: DevelopmentEvidence


@dataclass
class EngineOutput:
    total_cost: int
    components: list[CostComponent]
    scenarios: list[ScenarioCost]
    flags: list[RiskFlag]
    key_numbers: KeyNumbers
    horizon_totals: dict[str, int]  # {"5y": .., "10y": .., "15y": .., "20y": ..}
    cost_rows_by_horizon: dict[str, list[CostRow]] = field(default_factory=dict)
    composite_signals: list[CompositeSignal] = field(default_factory=list)


HORIZONS = (5, 10, 15, 20)

# Heritage permit-approval leverage range ($ price-reduction support), by status.
_HERITAGE_LEVERAGE = {
    "part_iv": (40000, 60000),
    "part_v": (30000, 50000),
    "listed": (15000, 30000),
}

# Statuses that do NOT carry heritage risk (no designation on the register).
_HERITAGE_NOT_SENSITIVE = {"no_match", "no_match_preview", "removed", "duckdb-empty"}


def _heritage_sensitive(status: str) -> bool:
    return status not in _HERITAGE_NOT_SENSITIVE


class ReportEngine:
    def __init__(self, settings: Settings) -> None:
        self.settings = settings

    def build(self, payload: EngineInput) -> EngineOutput:
        land_transfer_tax_total = round(
            self._land_transfer_tax_ontario(payload.list_price)
            + self._land_transfer_tax_toronto(payload.list_price)
            - (8475 if payload.buyer_profile == "first_time" else 0)
        )
        land_transfer_tax_total = max(0, land_transfer_tax_total)

        insured_mortgage_premium = round(
            self._insured_premium(payload.list_price, payload.down_payment_percent)
        )
        principal = (
            payload.list_price
            - payload.list_price * (payload.down_payment_percent / 100)
            + insured_mortgage_premium
        )

        down_payment = round(payload.list_price * (payload.down_payment_percent / 100))
        transit_dividend_10y = self._transit_dividend(payload.address)

        def horizon_total(years: int, renewal_delta: float = 0.0) -> int:
            property_tax = self._tax_projection(payload.list_price, years)
            mortgage = self._mortgage_cost(
                principal, payload.mortgage_rate, payload.amortization_years, renewal_delta, years
            )
            # Year-scaled loadings: flood loading is annual; transit dividend is a 10-yr figure.
            risk = (
                payload.flood.annual_risk_loading * years
                + (12000 if _heritage_sensitive(payload.heritage.status) else 0)
                + (17000 if payload.development.intensity == "high" else 7000 if payload.development.intensity == "medium" else 0)
            )
            transit = transit_dividend_10y * (years / 10)
            return round(
                down_payment + land_transfer_tax_total + property_tax + mortgage + risk - transit
            )

        horizon_totals = {f"{y}y": horizon_total(y) for y in HORIZONS}

        # 10-year figures stay the canonical headline (back-compat).
        property_tax_10y = round(self._tax_projection(payload.list_price, 10))
        mortgage_base = round(
            self._mortgage_cost(principal, payload.mortgage_rate, payload.amortization_years, 0.0, 10)
        )
        risk_adjustments = round(
            (payload.flood.annual_risk_loading * 10)
            + (12000 if _heritage_sensitive(payload.heritage.status) else 0)
            + (17000 if payload.development.intensity == "high" else 7000 if payload.development.intensity == "medium" else 0)
        )
        transit_dividend = transit_dividend_10y
        total_cost = horizon_totals["10y"]

        mortgage_bull = round(
            self._mortgage_cost(principal, payload.mortgage_rate, payload.amortization_years, -0.5, 10)
        )
        mortgage_bear = round(
            self._mortgage_cost(principal, payload.mortgage_rate, payload.amortization_years, 1.5, 10)
        )

        components = [
            CostComponent(key="mortgage_base", label="Mortgage", amount=mortgage_base),
            CostComponent(key="land_transfer_tax", label="Transfer Tax", amount=land_transfer_tax_total),
            CostComponent(key="property_tax_10y", label="Property Tax", amount=property_tax_10y),
            CostComponent(key="risk_adjustments", label="Risk Loadings", amount=risk_adjustments),
            CostComponent(key="transit_dividend", label="Transit Dividend", amount=-transit_dividend),
        ]
        scenarios = [
            ScenarioCost(
                scenario="bull",
                total_cost=round(
                    down_payment
                    + land_transfer_tax_total
                    + property_tax_10y
                    + mortgage_bull
                    + risk_adjustments
                    - transit_dividend
                ),
            ),
            ScenarioCost(scenario="base", total_cost=total_cost),
            ScenarioCost(
                scenario="bear",
                total_cost=round(
                    down_payment
                    + land_transfer_tax_total
                    + property_tax_10y
                    + mortgage_bear
                    + risk_adjustments
                    - transit_dividend
                ),
            ),
        ]

        flags = self._flags(payload, insured_mortgage_premium, transit_dividend)
        key_numbers = KeyNumbers(
            land_transfer_tax_total=land_transfer_tax_total,
            property_tax_10y=property_tax_10y,
            insured_mortgage_premium=insured_mortgage_premium,
            mortgage_cost_10y_base=mortgage_base,
            transit_dividend=transit_dividend,
        )

        # Per-horizon cost-breakdown rows (Category × Annual × N-year total × Confidence).
        # This is its own ownership-cost view (mortgage + property tax + LTT + CMHC −
        # transit credit); it excludes the down-payment (equity) and uncertain risk
        # loadings, which surface as flags. Mirrors the reference cost-breakdown table.
        gross_ontario = self._land_transfer_tax_ontario(payload.list_price)
        gross_toronto = self._land_transfer_tax_toronto(payload.list_price)
        ontario_rebate = 4000 if payload.buyer_profile == "first_time" else 0
        toronto_rebate = 4475 if payload.buyer_profile == "first_time" else 0
        ontario_ltt = max(0, round(gross_ontario - ontario_rebate))
        toronto_ltt = max(0, round(gross_toronto - toronto_rebate))
        cmhc_pst = round(insured_mortgage_premium * 0.08)
        cmhc_total = insured_mortgage_premium + cmhc_pst
        rate_label = f"{payload.mortgage_rate:.2f}%"

        def cost_rows(years: int) -> list[CostRow]:
            mortgage = round(
                self._mortgage_cost(
                    principal, payload.mortgage_rate, payload.amortization_years, 0.0, years
                )
            )
            property_tax = round(self._tax_projection(payload.list_price, years))
            transit = round(transit_dividend_10y * (years / 10))
            return [
                CostRow(
                    key="mortgage_base",
                    label=f"Mortgage (base scenario, {rate_label})",
                    annual=round(mortgage / years),
                    total=mortgage,
                    confidence="High",
                ),
                CostRow(
                    key="property_tax",
                    label="Property tax (AV proxy, 3.5% growth)",
                    annual=round(property_tax / years),
                    total=property_tax,
                    confidence="High",
                ),
                CostRow(
                    key="ontario_ltt",
                    label="Ontario LTT (one-time)",
                    annual=None,
                    total=ontario_ltt,
                    confidence="High",
                    one_time=True,
                ),
                CostRow(
                    key="toronto_mltt",
                    label="Toronto MLTT (one-time)",
                    annual=None,
                    total=toronto_ltt,
                    confidence="High",
                    one_time=True,
                ),
                CostRow(
                    key="cmhc_premium",
                    label="CMHC premium + PST",
                    annual=None,
                    total=cmhc_total,
                    confidence="High",
                    one_time=True,
                ),
                CostRow(
                    key="transit_dividend",
                    label="Transit dividend",
                    annual=-round(transit / years),
                    total=-transit,
                    confidence="Medium",
                    is_credit=True,
                ),
            ]

        cost_rows_by_horizon = {f"{y}y": cost_rows(y) for y in HORIZONS}
        composite_signals = self._composite_signals(payload)

        return EngineOutput(
            total_cost=total_cost,
            components=components,
            scenarios=scenarios,
            flags=flags,
            key_numbers=key_numbers,
            horizon_totals=horizon_totals,
            cost_rows_by_horizon=cost_rows_by_horizon,
            composite_signals=composite_signals,
        )

    def _composite_signals(self, payload: EngineInput) -> list[CompositeSignal]:
        heritage_sensitive = _heritage_sensitive(payload.heritage.status)
        intensity = payload.development.intensity
        in_flood = payload.flood.in_flood_zone

        # --- Maintenance Complexity (inferred; always Low confidence) ---
        maint_factors: list[str] = []
        if heritage_sensitive:
            maint_factors.append("Heritage designation (permit-constrained alterations)")
        if intensity == "high":
            maint_factors.append("High nearby redevelopment activity")
        elif intensity == "medium":
            maint_factors.append("Moderate nearby redevelopment activity")
        if in_flood:
            maint_factors.append("Flood-zone exposure")
        maint_score = len(maint_factors)
        maint_value = "Elevated" if maint_score >= 2 else "Medium" if maint_score == 1 else "Low"
        if not maint_factors:
            maint_factors = ["No elevated maintenance signals from available data"]

        # --- Future Tax Pressure (inferred; always Low confidence) ---
        count = payload.development.application_count_500m
        tax_factors: list[str] = []
        if count:
            tax_factors.append(f"{count} development applications within 500 m")
        if heritage_sensitive:
            tax_factors.append("Heritage / zoning constraints in the area")
        tax_value = "High" if intensity == "high" else "Medium" if intensity == "medium" else "Low"
        if not tax_factors:
            tax_factors = ["Low nearby development application density"]

        return [
            CompositeSignal(
                signal_name="Maintenance Complexity Signal",
                value=maint_value,
                label=f"{maint_value} maintenance complexity signal",
                factors=maint_factors,
                disclaimer=(
                    "This is an inferred signal and not evidence of a historical "
                    "special assessment."
                ),
            ),
            CompositeSignal(
                signal_name="Future Tax Pressure Signal",
                value=tax_value,
                label=f"{tax_value} future tax pressure signal",
                factors=tax_factors,
                disclaimer=(
                    "This is a neighbourhood signal, not an MPAC reassessment prediction."
                ),
            ),
        ]

    def _flags(
        self,
        payload: EngineInput,
        insured_mortgage_premium: int,
        transit_dividend: int,
    ) -> list[RiskFlag]:
        flags: list[RiskFlag] = []
        status = payload.heritage.status
        if _heritage_sensitive(status):
            label = (
                "Part IV (individual designation)"
                if status == "part_iv"
                else "Part V (heritage conservation district)"
                if status == "part_v"
                else "Heritage Register listing"
            )
            low, high = _HERITAGE_LEVERAGE.get(status, (15000, 30000))
            flags.append(
                RiskFlag(
                    severity="red",
                    title="Heritage designation",
                    message=f"This property carries a {label} on the Toronto Heritage Register.",
                    confidence="High",
                    detail=(
                        "This property is designated under the Ontario Heritage Act. "
                        "Any exterior alterations — window replacements, facade repairs, "
                        "additions — require City Heritage Permit approval. Approvals "
                        "typically add 6–18 months and a meaningful premium to any "
                        "exterior renovation budget."
                    ),
                    say_at_table=(
                        "The heritage designation means we're buying a property with "
                        "permanent renovation constraints. I'd like to reflect the heritage "
                        "approval premium in the purchase price."
                    ),
                    leverage_low=low,
                    leverage_high=high,
                    source="Toronto Heritage Register (CKAN)",
                )
            )
        if payload.flood.in_flood_zone:
            flags.append(
                RiskFlag(
                    severity="red",
                    title="TRCA flood plain",
                    message="This property intersects a TRCA regulated flood-risk area.",
                    confidence="Medium",
                    detail=(
                        "The geocoded location intersects a TRCA regulatory flood plain. "
                        "Insurance implications vary significantly by insurer and property "
                        "characteristics — verify coverage and premiums directly with your "
                        "insurer. Development and grading near the regulated area may also "
                        "require TRCA permits."
                    ),
                    say_at_table=(
                        "The property sits in a TRCA flood-risk area, which affects "
                        "insurability and any future grading work. I'd like that reflected "
                        "in the offer."
                    ),
                    leverage_low=8000,
                    leverage_high=12000,
                    source="TRCA Floodline (ArcGIS)",
                )
            )
        intensity = payload.development.intensity
        count = payload.development.application_count_500m
        if intensity in ("high", "medium"):
            low, high = (15000, 25000) if intensity == "high" else (7000, 12000)
            word = "high" if intensity == "high" else "moderate"
            flags.append(
                RiskFlag(
                    severity="yellow",
                    title="Active development pressure",
                    message=f"{count} active applications within 500 m indicate {word} neighbourhood change pressure.",
                    confidence="High",
                    detail=(
                        f"{count} active development applications were found within 500 m. "
                        "Significant nearby redevelopment may affect future neighbourhood "
                        "character, density, construction disruption, and property values."
                    ),
                    say_at_table=(
                        "There's notable redevelopment activity nearby that brings years of "
                        "construction and density change. I'd factor that disruption into "
                        "the price."
                    ),
                    leverage_low=low,
                    leverage_high=high,
                    source="Toronto Development Applications (CKAN)",
                )
            )

        if insured_mortgage_premium > 0:
            flags.append(
                RiskFlag(
                    severity="yellow",
                    title="Insured mortgage premium",
                    message=f"Down payment under 20% adds an estimated insured premium of ${insured_mortgage_premium:,} to principal.",
                    confidence="High",
                    detail=(
                        "CMHC default insurance is mandatory when the down payment is under "
                        "20%. The premium is added to the mortgage principal, and Ontario "
                        "PST on the premium is payable at closing."
                    ),
                    source="CMHC premium schedule",
                )
            )

        flags.append(
            RiskFlag(
                severity="green",
                title="Transit dividend",
                message=f"Transit alignment offsets roughly ${transit_dividend:,} over 10 years in the current model.",
                confidence="Medium",
                detail=(
                    "Estimated transport-cost savings versus a car-dependent location, based "
                    "on proximity to TTC rapid-transit corridors."
                ),
                source="TTC routes & schedules (GTFS)",
            )
        )
        return flags

    def _land_transfer_tax_ontario(self, price: float) -> float:
        bands = [
            (55000, 0.005),
            (250000, 0.01),
            (400000, 0.015),
            (2000000, 0.02),
            (float("inf"), 0.025),
        ]
        return self._progressive_tax(price, bands)

    def _land_transfer_tax_toronto(self, price: float) -> float:
        bands = [
            (55000, 0.005),
            (250000, 0.01),
            (400000, 0.015),
            (2000000, 0.02),
            (float("inf"), 0.025),
        ]
        return self._progressive_tax(price, bands)

    def _progressive_tax(self, price: float, bands: list[tuple[float, float]]) -> float:
        total = 0.0
        previous = 0.0
        for limit, rate in bands:
            taxable = min(price, limit) - previous
            if taxable > 0:
                total += taxable * rate
                previous = limit
            if price <= limit:
                break
        return total

    def _insured_premium(self, list_price: float, down_payment_percent: float) -> float:
        borrowed = list_price - list_price * (down_payment_percent / 100)
        if down_payment_percent >= 20:
            rate = 0.0
        elif down_payment_percent >= 15:
            rate = 0.028
        elif down_payment_percent >= 10:
            rate = 0.031
        else:
            rate = 0.04
        return borrowed * rate

    def _monthly_payment(self, principal: float, annual_rate_percent: float, years: int) -> float:
        monthly_rate = annual_rate_percent / 100 / 12
        total_months = years * 12
        if monthly_rate == 0:
            return principal / total_months
        factor = (1 + monthly_rate) ** total_months
        return principal * ((monthly_rate * factor) / (factor - 1))

    def _remaining_balance(
        self,
        principal: float,
        annual_rate_percent: float,
        years: int,
        months_paid: int,
    ) -> float:
        monthly_rate = annual_rate_percent / 100 / 12
        total_months = years * 12
        payment = self._monthly_payment(principal, annual_rate_percent, years)
        if monthly_rate == 0:
            return principal - payment * months_paid
        factor_paid = (1 + monthly_rate) ** months_paid
        factor_total = (1 + monthly_rate) ** total_months
        return principal * ((factor_total - factor_paid) / (factor_total - 1))

    def _mortgage_cost(
        self,
        principal: float,
        start_rate: float,
        amortization_years: int,
        renewal_delta: float,
        horizon_years: int,
    ) -> float:
        """Mortgage cost over `horizon_years` using rolling 60-month (5-yr) terms.

        The starting rate applies to the first term; each renewal adds
        `renewal_delta` (floored at 0.5%). At 10 years this matches the original
        two-term model exactly.
        """
        months_left = horizon_years * 12
        balance = principal
        amort_left = float(amortization_years)
        rate = start_rate
        cost = 0.0
        term = 0
        while months_left > 0 and balance > 0:
            if term > 0:
                rate = max(0.5, rate + renewal_delta)
            months = min(60, months_left)
            payment = self._monthly_payment(balance, rate, max(1.0, amort_left))
            cost += payment * months
            balance = self._remaining_balance(balance, rate, max(1.0, amort_left), months)
            amort_left -= months / 12
            months_left -= months
            term += 1
        return cost

    def _tax_projection(self, list_price: float, years: int) -> float:
        annual_tax = list_price * self.settings.assessed_value_factor * self.settings.property_tax_rate
        g = self.settings.property_tax_growth_rate
        factor = ((1 + g) ** years - 1) / g
        return annual_tax * factor

    def _transit_dividend(self, address: str) -> int:
        lower = address.lower()
        downtown_keywords = (
            "king",
            "queen",
            "richmond",
            "yonge",
            "front",
            "union",
            "osgoode",
            "spadina",
            "bloor",
        )
        return (
            self.settings.transit_dividend_downtown
            if any(token in lower for token in downtown_keywords)
            else self.settings.transit_dividend_default
        )
