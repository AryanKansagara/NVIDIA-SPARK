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


def test_cost_rows_present_for_all_horizons():
    engine = make_engine()
    result = engine.build(base_input())
    assert set(result.cost_rows_by_horizon) == {"5y", "10y", "15y", "20y"}
    for rows in result.cost_rows_by_horizon.values():
        keys = [r.key for r in rows]
        assert keys == [
            "mortgage_base",
            "property_tax",
            "ontario_ltt",
            "toronto_mltt",
            "cmhc_premium",
            "transit_dividend",
        ]


def test_recurring_cost_rows_scale_with_horizon():
    engine = make_engine()
    result = engine.build(base_input())
    mortgage_5 = next(r for r in result.cost_rows_by_horizon["5y"] if r.key == "mortgage_base")
    mortgage_20 = next(r for r in result.cost_rows_by_horizon["20y"] if r.key == "mortgage_base")
    assert mortgage_20.total > mortgage_5.total
    # annual × years ≈ total for recurring rows
    assert mortgage_5.annual is not None
    assert abs(mortgage_5.annual * 5 - mortgage_5.total) <= 5


def test_one_time_rows_flagged_and_constant_across_horizons():
    engine = make_engine()
    result = engine.build(base_input())
    for key in ("ontario_ltt", "toronto_mltt", "cmhc_premium"):
        r5 = next(r for r in result.cost_rows_by_horizon["5y"] if r.key == key)
        r20 = next(r for r in result.cost_rows_by_horizon["20y"] if r.key == key)
        assert r5.one_time is True
        assert r5.annual is None
        assert r5.total == r20.total


def test_transit_row_is_a_credit():
    engine = make_engine()
    row = next(r for r in engine.build(base_input()).cost_rows_by_horizon["10y"] if r.key == "transit_dividend")
    assert row.is_credit is True
    assert row.total < 0


def test_composite_signals_always_low_confidence():
    engine = make_engine()
    signals = engine.build(base_input()).composite_signals
    names = {s.signal_name for s in signals}
    assert names == {"Maintenance Complexity Signal", "Future Tax Pressure Signal"}
    assert all(s.confidence == "Low" for s in signals)
    assert all(s.disclaimer for s in signals)


def test_heritage_flag_carries_leverage_range():
    engine = make_engine()
    result = engine.build(base_input(heritage=HeritageEvidence(status="part_iv", reason="t", source="t")))
    heritage_flag = next(f for f in result.flags if f.title == "Heritage designation")
    assert heritage_flag.leverage_low == 40000
    assert heritage_flag.leverage_high == 60000
    assert heritage_flag.say_at_table
    assert heritage_flag.source == "Toronto Heritage Register (CKAN)"
