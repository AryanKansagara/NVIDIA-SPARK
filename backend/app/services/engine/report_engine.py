from dataclasses import dataclass

from app.core.config import Settings
from app.schemas.report import CostComponent, KeyNumbers, RiskFlag, ScenarioCost
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
    horizon_totals: dict[str, int]  # {"5y": .., "10y": .., "15y": ..}


HORIZONS = (5, 10, 15)

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

        return EngineOutput(
            total_cost=total_cost,
            components=components,
            scenarios=scenarios,
            flags=flags,
            key_numbers=key_numbers,
            horizon_totals=horizon_totals,
        )

    def _flags(
        self,
        payload: EngineInput,
        insured_mortgage_premium: int,
        transit_dividend: int,
    ) -> list[RiskFlag]:
        flags: list[RiskFlag] = []
        if _heritage_sensitive(payload.heritage.status):
            flags.append(
                RiskFlag(
                    severity="red",
                    title="Heritage sensitivity",
                    message="This address triggered the heritage-sensitive preview path. Renovation and permit constraints should be reviewed.",
                )
            )
        if payload.flood.in_flood_zone:
            flags.append(
                RiskFlag(
                    severity="red",
                    title="Flood risk signal",
                    message="This property intersects the MVP flood-risk preview and carries additional annual loading.",
                )
            )
        if payload.development.intensity == "high":
            flags.append(
                RiskFlag(
                    severity="yellow",
                    title="Development pressure",
                    message=f"{payload.development.application_count_500m} nearby applications indicate high neighborhood change pressure.",
                )
            )
        elif payload.development.intensity == "medium":
            flags.append(
                RiskFlag(
                    severity="yellow",
                    title="Development pressure",
                    message=f"{payload.development.application_count_500m} nearby applications indicate moderate neighborhood change pressure.",
                )
            )

        if insured_mortgage_premium > 0:
            flags.append(
                RiskFlag(
                    severity="yellow",
                    title="Insured mortgage premium",
                    message=f"Down payment under 20% adds an estimated insured premium of ${insured_mortgage_premium:,} to principal.",
                )
            )

        flags.append(
            RiskFlag(
                severity="green",
                title="Transit dividend",
                message=f"Transit alignment offsets roughly ${transit_dividend:,} over 10 years in the current model.",
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
