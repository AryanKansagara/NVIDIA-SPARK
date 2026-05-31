from dataclasses import dataclass

from app.core.config import Settings
from app.schemas.report import CostComponent, KeyNumbers, RiskFlag, ScenarioCost, Severity
from app.services.data_sources.models import ActivePermitsEvidence, BuildingHealthEvidence, ClearedPermitsEvidence, CompositeSignal, DevelopmentEvidence, FloodEvidence, HCDEvidence, HeritageEvidence


@dataclass
class EngineInput:
    list_price: float
    buyer_profile: str
    property_type: str
    down_payment_percent: float
    mortgage_rate: float
    amortization_years: int
    address: str
    heritage: HeritageEvidence
    hcd: HCDEvidence
    active_permits: ActivePermitsEvidence
    cleared_permits: ClearedPermitsEvidence
    building_health: BuildingHealthEvidence
    flood: FloodEvidence
    development: DevelopmentEvidence


@dataclass
class EngineOutput:
    total_cost: int
    components: list[CostComponent]
    scenarios: list[ScenarioCost]
    flags: list[RiskFlag]
    key_numbers: KeyNumbers
    property_tax_meta: dict
    signals: list[dict]
    composite_signals: list[dict]
    verdict_level: str    # "RED" | "YELLOW" | "GREEN"
    verdict_headline: str


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

        property_tax_10y, av_low, av_mid, av_high = self._tax_projection_10y(
            payload.list_price, payload.buyer_profile, payload.property_type
        )
        insured_mortgage_premium = round(
            self._insured_premium(payload.list_price, payload.down_payment_percent, payload.amortization_years)
        )
        principal = (
            payload.list_price
            - payload.list_price * (payload.down_payment_percent / 100)
            + insured_mortgage_premium
        )

        mortgage_base = round(
            self._ten_year_mortgage_cost(
                principal,
                payload.mortgage_rate,
                payload.amortization_years,
                renewal_delta=0.0,
            )
        )
        mortgage_bull = round(
            self._ten_year_mortgage_cost(
                principal,
                payload.mortgage_rate,
                payload.amortization_years,
                renewal_delta=-0.5,
            )
        )
        mortgage_bear = round(
            self._ten_year_mortgage_cost(
                principal,
                payload.mortgage_rate,
                payload.amortization_years,
                renewal_delta=1.5,
            )
        )

        _HERITAGE_MATCH = {"part_iv", "part_v", "listed", "part_iv_or_sensitive_core"}
        hcd_loading = 20000 if payload.hcd.in_district and payload.heritage.status != "part_v" else 0
        permit_loading = (
            20000 if payload.active_permits.structural_count > 0
            else 8000 if payload.active_permits.permit_count > 0
            else 0
        )
        risk_adjustments = round(
            (payload.flood.internal_loading * 10)
            + (12000 if payload.heritage.status in _HERITAGE_MATCH else 0)
            + hcd_loading
            + permit_loading
            + (17000 if payload.development.intensity == "high" else 7000 if payload.development.intensity == "medium" else 0)
        )

        down_payment = round(payload.list_price * (payload.down_payment_percent / 100))
        transit_dividend = self._transit_dividend(payload.address)
        total_cost = round(
            down_payment
            + land_transfer_tax_total
            + property_tax_10y
            + mortgage_base
            + risk_adjustments
            - transit_dividend
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

        cmhc_pst = round(insured_mortgage_premium * 0.08)   # Ontario PST on premium, closing cost only
        biweekly_savings = self._biweekly_savings_10y(principal, payload.mortgage_rate, payload.amortization_years)
        flags = self._flags(payload, insured_mortgage_premium, cmhc_pst, biweekly_savings, transit_dividend)
        key_numbers = KeyNumbers(
            land_transfer_tax_total=land_transfer_tax_total,
            property_tax_10y=property_tax_10y,
            insured_mortgage_premium=insured_mortgage_premium,
            mortgage_cost_10y_base=mortgage_base,
            transit_dividend=transit_dividend,
        )

        signals = [
            vars(payload.heritage.to_signal()),
            vars(payload.hcd.to_signal()),
            vars(payload.active_permits.to_signal()),
            vars(payload.cleared_permits.to_signal()),
            vars(payload.building_health.to_signal()),
            vars(payload.flood.to_signal()),
            vars(payload.development.to_signal()),
        ]
        composite_signals = [
            vars(self._maintenance_complexity_signal(payload)),
            vars(self._future_tax_pressure_signal(payload)),
        ]

        verdict_level, verdict_headline = self._derive_verdict(payload, flags, composite_signals)

        return EngineOutput(
            total_cost=total_cost,
            components=components,
            scenarios=scenarios,
            flags=flags,
            key_numbers=key_numbers,
            property_tax_meta={
                "av_low": av_low,
                "av_mid": av_mid,
                "av_high": av_high,
                "disclaimer": self._PROPERTY_TAX_DISCLAIMER,
            },
            signals=signals,
            composite_signals=composite_signals,
            verdict_level=verdict_level,
            verdict_headline=verdict_headline,
        )

    def _flags(
        self,
        payload: EngineInput,
        insured_mortgage_premium: int,
        cmhc_pst: int,
        biweekly_savings: int,
        transit_dividend: int,
    ) -> list[RiskFlag]:
        _HERITAGE_MATCH = {"part_iv", "part_v", "listed", "part_iv_or_sensitive_core"}
        flags: list[RiskFlag] = []
        if payload.heritage.status in _HERITAGE_MATCH:
            flags.append(
                RiskFlag(
                    severity="red",
                    title="Heritage designation",
                    message=payload.heritage.reason,
                )
            )
        if payload.hcd.in_district:
            district = f" ({payload.hcd.district_name})" if payload.hcd.district_name else ""
            flags.append(
                RiskFlag(
                    severity="red",
                    title="Heritage Conservation District",
                    message=(
                        f"This property is in a Heritage Conservation District{district}. "
                        "Neighbourhood-level heritage restrictions apply — exterior alterations "
                        "require design review even without individual designation. "
                        "Budget for a $20,000–$40,000 renovation complexity premium."
                    ),
                )
            )
        ap = payload.active_permits
        if ap.structural_count > 0:
            long_open = f" {ap.elevated_risk_count} open more than 2 years." if ap.elevated_risk_count > 0 else ""
            flags.append(
                RiskFlag(
                    severity="red",
                    title="Active structural permits",
                    message=(
                        f"{ap.structural_count} active structural permit(s) found on this property.{long_open} "
                        "Unresolved permits transfer to the buyer at closing — review permit details before purchase."
                    ),
                )
            )
        elif ap.permit_count > 0:
            flags.append(
                RiskFlag(
                    severity="yellow",
                    title="Active building permits",
                    message=(
                        f"{ap.permit_count} active permit(s) found ({', '.join(ap.top_work_types)}). "
                        "Unresolved permits transfer to the buyer at closing."
                    ),
                )
            )
        elif ap.elevated_risk_count > 0:
            flags.append(
                RiskFlag(
                    severity="yellow",
                    title="Long-running permits",
                    message=f"{ap.elevated_risk_count} permit(s) open more than 2 years. Further due diligence recommended.",
                )
            )

        cp = payload.cleared_permits
        if cp.chronic_issues:
            flags.append(
                RiskFlag(
                    severity="yellow",
                    title="Elevated maintenance complexity signal",
                    message=(
                        f"This property has {cp.structural_count} structural permit(s) on record. "
                        "Elevated maintenance complexity signal — further due diligence recommended."
                    ),
                )
            )
        elif cp.deferred_maintenance and cp.permit_count == 0:
            flags.append(
                RiskFlag(
                    severity="yellow",
                    title="Deferred maintenance signal",
                    message=(
                        "No cleared building permits found for this property. "
                        "On older buildings this may indicate deferred maintenance — further due diligence recommended."
                    ),
                )
            )
        elif cp.deferred_maintenance:
            flags.append(
                RiskFlag(
                    severity="yellow",
                    title="Deferred maintenance signal",
                    message=(
                        f"No building permits in the last 15 years ({cp.permit_count} historical permit(s) on record). "
                        "Further due diligence recommended."
                    ),
                )
            )

        bh = payload.building_health
        if bh.message:
            severity: Severity = "red" if bh.status == "elevated" else "yellow"
            flags.append(
                RiskFlag(
                    severity=severity,
                    title="Building health" + (" (RentSafeTO)" if bh.path == "rentsafeto" else ""),
                    message=bh.message,
                )
            )

        if payload.flood.status == "elevated":
            flags.append(
                RiskFlag(
                    severity="red",
                    title="Flood Exposure: Elevated",
                    message=(
                        "This property intersects a TRCA flood-risk area. "
                        "Insurance implications vary significantly by insurer and property characteristics. "
                        "Verify coverage and premiums directly with your insurer."
                    ),
                )
            )
        elif payload.flood.status == "moderate":
            flags.append(
                RiskFlag(
                    severity="yellow",
                    title="Flood Exposure: Moderate",
                    message=(
                        "This property is near a TRCA flood-risk area. "
                        "Verify flood risk and insurance implications with your insurer."
                    ),
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
            pst_note = f" Ontario PST on the premium (${cmhc_pst:,}) is payable at closing and is not financed." if cmhc_pst > 0 else ""
            flags.append(
                RiskFlag(
                    severity="yellow",
                    title="Insured mortgage premium (CMHC)",
                    message=(
                        f"Down payment under 20% adds an estimated CMHC premium of ${insured_mortgage_premium:,} to principal.{pst_note}"
                    ),
                )
            )

        # Sub-signal 10a: Assumable mortgage (first-time buyers)
        if payload.buyer_profile == "first_time":
            flags.append(
                RiskFlag(
                    severity="green",
                    title="Assumable mortgage opportunity",
                    message=(
                        "Ask whether the seller has a locked-in mortgage rate below current market. "
                        "If assumable, you may be able to take over their mortgage — a direct negotiation advantage."
                    ),
                )
            )

        # Sub-signal 10b: IRD prepayment penalty warning
        flags.append(
            RiskFlag(
                severity="info",
                title="Seller prepayment penalty (IRD)",
                message=(
                    "If the seller breaks a fixed-rate mortgage early, they face an Interest Rate Differential (IRD) penalty. "
                    "A large IRD reduces the seller's flexibility to negotiate on price — ask your agent to investigate."
                ),
            )
        )

        # Sub-signal 10c: Amortization accelerator
        if biweekly_savings > 0:
            flags.append(
                RiskFlag(
                    severity="green",
                    title="Amortization accelerator",
                    message=(
                        f"Switching from monthly to accelerated bi-weekly payments saves an estimated "
                        f"${biweekly_savings:,} in interest over the first 10 years at your starting rate."
                    ),
                )
            )

        # Sub-signals 10d + 10e: First-time buyer programs
        if payload.buyer_profile == "first_time":
            flags.append(
                RiskFlag(
                    severity="green",
                    title="First Home Savings Account (FHSA)",
                    message=(
                        "You may be eligible for the FHSA: up to $40,000 tax-free ($8,000/yr limit). "
                        "Contributions are tax-deductible; withdrawals for a qualifying home purchase are tax-free."
                    ),
                )
            )
            flags.append(
                RiskFlag(
                    severity="green",
                    title="RRSP Home Buyers' Plan (HBP)",
                    message=(
                        "You may be eligible to withdraw up to $60,000 ($120,000/couple) from your RRSP tax-free. "
                        "Repayable over 15 years starting the second year after withdrawal."
                    ),
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

    def _derive_verdict(
        self,
        payload: "EngineInput",
        flags: list[RiskFlag],
        composite_signals: list[dict],
    ) -> tuple[str, str]:
        _RED_TRIGGERS = {
            "heritage": payload.heritage.status in {"part_iv", "part_iv_or_sensitive_core"},
            "structural": payload.active_permits.structural_count > 0,
            "flood": payload.flood.status == "elevated",
        }
        _YELLOW_TRIGGERS = {
            "medium_flag": any(f.severity == "yellow" for f in flags),
            "composite_elevated": any(
                cs.get("value") in {"Elevated", "High"} for cs in composite_signals
            ),
        }

        if any(_RED_TRIGGERS.values()):
            return "RED", "Elevated due-diligence recommended before this purchase."
        if any(_YELLOW_TRIGGERS.values()):
            return "YELLOW", "Some ownership risks identified — review flagged signals."
        return "GREEN", "No concerns identified in available city data."

    _HERITAGE_MATCH_SET = {"part_iv", "part_v", "listed", "part_iv_or_sensitive_core"}

    def _maintenance_complexity_signal(self, payload: "EngineInput") -> CompositeSignal:
        factors: list[str] = []
        if payload.active_permits.structural_count > 0:
            factors.append("Active structural permit")
        if payload.cleared_permits.chronic_issues:
            factors.append("Multiple structural permits")
        if payload.cleared_permits.deferred_maintenance:
            factors.append("Deferred maintenance signal")
        if payload.building_health.status == "elevated" and payload.building_health.path == "rentsafeto":
            factors.append("Low RentSafeTO score")
        if payload.heritage.status in self._HERITAGE_MATCH_SET:
            factors.append("Heritage designation")
        if payload.flood.status == "elevated":
            factors.append("Flood zone exposure")

        if len(factors) >= 3:
            value = "Elevated"
        elif len(factors) >= 1:
            value = "Medium"
        else:
            value = "Low"

        return CompositeSignal(
            signal_name="Maintenance Complexity Signal",
            signal_type="inferred",
            value=value,
            confidence="Low",
            factors=factors,
            disclaimer="This is an inferred signal and not evidence of a historical special assessment.",
        )

    def _future_tax_pressure_signal(self, payload: "EngineInput") -> CompositeSignal:
        count = payload.development.application_count_500m
        if count >= 10:
            value = "High"
            message_hint = "Significant redevelopment activity nearby may affect future neighbourhood character and values."
        elif count >= 5:
            value = "Medium"
            message_hint = "Early intensification signals detected nearby."
        else:
            value = "Low"
            message_hint = "Low development pressure near this property."

        return CompositeSignal(
            signal_name="Future Tax Pressure Signal",
            signal_type="inferred",
            value=value,
            confidence="Low",
            factors=[f"{count} active OZ/SA applications within 500m"],
            disclaimer="This is a neighbourhood signal, not an MPAC reassessment prediction.",
        )

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
        # Toronto MLTT brackets as of April 1, 2026
        bands = [
            (55000,          0.005),
            (250000,         0.010),
            (400000,         0.015),
            (2_000_000,      0.020),
            (3_000_000,      0.025),
            (4_000_000,      0.035),
            (5_000_000,      0.045),
            (float("inf"),   0.055),
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

    def _insured_premium(self, list_price: float, down_payment_percent: float, amortization_years: int) -> float:
        if list_price > 1_500_000:
            return 0.0  # No CMHC for homes above $1.5M
        borrowed = list_price - list_price * (down_payment_percent / 100)
        if down_payment_percent >= 20:
            return 0.0
        if down_payment_percent >= 15:
            rate = 0.028
        elif down_payment_percent >= 10:
            rate = 0.031
        else:
            rate = 0.04
        if amortization_years > 25:
            rate += 0.002
        return borrowed * rate

    def _biweekly_savings_10y(self, principal: float, rate_percent: float, amort_years: int) -> int:
        """Interest saved over 10 years by switching monthly → accelerated bi-weekly payments."""
        monthly = self._monthly_payment(principal, rate_percent, amort_years)
        monthly_rate = rate_percent / 100 / 12
        biweekly_rate = rate_percent / 100 / 26

        bal_m = principal
        interest_m = 0.0
        for _ in range(120):
            interest = bal_m * monthly_rate
            interest_m += interest
            bal_m -= monthly - interest

        biweekly = monthly / 2
        bal_bw = principal
        interest_bw = 0.0
        for _ in range(260):
            interest = bal_bw * biweekly_rate
            interest_bw += interest
            bal_bw -= biweekly - interest

        return max(0, round(interest_m - interest_bw))

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

    def _ten_year_mortgage_cost(
        self,
        principal: float,
        start_rate: float,
        amortization_years: int,
        renewal_delta: float,
    ) -> float:
        first_term_months = 60
        second_term_months = 60
        first_payment = self._monthly_payment(principal, start_rate, amortization_years)
        first_cost = first_payment * first_term_months
        remaining = self._remaining_balance(
            principal,
            start_rate,
            amortization_years,
            first_term_months,
        )
        second_rate = max(0.5, start_rate + renewal_delta)
        second_payment = self._monthly_payment(
            remaining,
            second_rate,
            max(1, amortization_years - 5),
        )
        return first_cost + second_payment * second_term_months

    _RATE_MULTI_RES = 0.01208792
    _AV_MULTIPLIERS: dict[str, float] = {
        "condo":              0.90,
        "condo_townhouse":    0.80,
        "semi_detached":      0.65,
        "detached_urban":     0.70,
        "detached_suburban":  0.55,
    }
    _PROPERTY_TAX_DISCLAIMER = (
        "Estimated using property-type proxy. Actual taxes depend on your MPAC assessed value. "
        "MPAC values are frozen at January 1, 2016. 10-year projection is an illustrative scenario "
        "based on recent rate trends — not a confirmed forecast."
    )

    def _tax_projection_10y(
        self, list_price: float, buyer_profile: str, property_type: str
    ) -> tuple[int, int, int, int]:
        """Returns (tax_10y, av_low, av_mid, av_high) all as rounded ints."""
        multiplier = self._AV_MULTIPLIERS.get(property_type, 0.70)
        av_mid = list_price * multiplier
        av_low = round(av_mid * 0.85)
        av_high = round(av_mid * 1.15)
        av_mid = round(av_mid)

        rate = self._RATE_MULTI_RES if buyer_profile == "investor" else self.settings.property_tax_rate
        annual_tax = av_mid * rate
        factor = ((1 + self.settings.property_tax_growth_rate) ** 10 - 1) / self.settings.property_tax_growth_rate
        return round(annual_tax * factor), av_low, av_mid, av_high

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
