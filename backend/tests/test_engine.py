from app.core.config import get_settings
from app.services.data_sources.models import DevelopmentEvidence, FloodEvidence, HeritageEvidence
from app.services.engine.report_engine import EngineInput, ReportEngine


def make_engine() -> ReportEngine:
    return ReportEngine(get_settings())


def base_input(**overrides):
    payload = EngineInput(
        list_price=850000,
        buyer_profile="first_time",
        down_payment_percent=10,
        mortgage_rate=4.79,
        amortization_years=25,
        address="401 Richmond St W, Toronto",
        heritage=HeritageEvidence(
            status="part_iv_or_sensitive_core",
            reason="test",
            source="test",
        ),
        flood=FloodEvidence(
            in_flood_zone=False,
            annual_risk_loading=0,
            source="test",
        ),
        development=DevelopmentEvidence(
            application_count_500m=14,
            intensity="high",
            source="test",
        ),
    )
    for key, value in overrides.items():
        setattr(payload, key, value)
    return payload


def test_land_transfer_tax_rebate_applied_for_first_time_buyer():
    engine = make_engine()
    result = engine.build(base_input(buyer_profile="first_time"))
    assert result.key_numbers.land_transfer_tax_total > 0
    investor = engine.build(base_input(buyer_profile="investor"))
    assert result.key_numbers.land_transfer_tax_total < investor.key_numbers.land_transfer_tax_total


def test_insured_mortgage_premium_thresholds():
    engine = make_engine()
    under_ten = engine.build(base_input(down_payment_percent=9))
    at_ten = engine.build(base_input(down_payment_percent=10))
    at_fifteen = engine.build(base_input(down_payment_percent=15))
    at_twenty = engine.build(base_input(down_payment_percent=20))
    assert under_ten.key_numbers.insured_mortgage_premium > at_ten.key_numbers.insured_mortgage_premium
    assert at_ten.key_numbers.insured_mortgage_premium > at_fifteen.key_numbers.insured_mortgage_premium
    assert at_twenty.key_numbers.insured_mortgage_premium == 0


def test_mortgage_scenario_ordering():
    engine = make_engine()
    result = engine.build(base_input())
    totals = {item.scenario: item.total_cost for item in result.scenarios}
    assert totals["bull"] <= totals["base"] <= totals["bear"]


def test_property_tax_projection_is_positive_and_stable():
    engine = make_engine()
    result = engine.build(base_input(list_price=1000000))
    assert result.key_numbers.property_tax_10y > 0
    higher = engine.build(base_input(list_price=1200000))
    assert higher.key_numbers.property_tax_10y > result.key_numbers.property_tax_10y


def test_cost_breakdown_contains_expected_components():
    engine = make_engine()
    result = engine.build(base_input())
    labels = [component.key for component in result.components]
    assert labels == [
        "mortgage_base",
        "land_transfer_tax",
        "property_tax_10y",
        "risk_adjustments",
        "transit_dividend",
    ]
