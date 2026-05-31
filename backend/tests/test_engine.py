from app.core.config import get_settings
from app.services.data_sources.models import (
    ActivePermitsEvidence,
    BuildingHealthEvidence,
    ClearedPermitsEvidence,
    DevelopmentEvidence,
    FloodEvidence,
    HCDEvidence,
    HeritageEvidence,
)
from app.services.engine.report_engine import EngineInput, ReportEngine


def make_engine() -> ReportEngine:
    return ReportEngine(get_settings())


def base_input(**overrides) -> EngineInput:
    payload = EngineInput(
        list_price=850_000,
        buyer_profile="first_time",
        property_type="detached_urban",
        down_payment_percent=10,
        mortgage_rate=4.79,
        amortization_years=25,
        address="401 Richmond St W, Toronto",
        heritage=HeritageEvidence(status="part_iv", reason="test", source="test", confidence="High"),
        hcd=HCDEvidence(in_district=False, district_name=None, source="test"),
        active_permits=ActivePermitsEvidence(
            permit_count=0, structural_count=0, elevated_risk_count=0,
            top_work_types=[], confidence="Low", source="test",
        ),
        cleared_permits=ClearedPermitsEvidence(
            permit_count=0, structural_count=0, structural_last_10y=0,
            years_since_last_permit=None, deferred_maintenance=False,
            chronic_issues=False, confidence="Low", source="test",
        ),
        building_health=BuildingHealthEvidence(
            path="permit_history", status="pass", score=None, message=None,
            disclaimer="", confidence="Medium", source="test",
        ),
        flood=FloodEvidence(status="low", in_flood_zone=False, internal_loading=0, source="test"),
        development=DevelopmentEvidence(application_count_500m=14, intensity="high", source="test"),
    )
    for key, value in overrides.items():
        setattr(payload, key, value)
    return payload


# ── LTT oracle values (verified against ratehub.ca) ──────────────────────────

def test_ltt_not_first_time_500k():
    # $500K, not first-time → combined $12,950, no rebate
    engine = make_engine()
    result = engine.build(base_input(list_price=500_000, buyer_profile="investor"))
    assert result.key_numbers.land_transfer_tax_total == 12_950


def test_ltt_first_time_750k():
    # $750K, first-time → combined $22,950 − $8,475 rebate = $14,475
    engine = make_engine()
    result = engine.build(base_input(list_price=750_000, buyer_profile="first_time"))
    assert result.key_numbers.land_transfer_tax_total == 14_475


def test_ltt_first_time_1200k():
    # $1.2M, first-time → combined $40,950 − $8,475 = $32,475
    engine = make_engine()
    result = engine.build(base_input(list_price=1_200_000, buyer_profile="first_time"))
    assert result.key_numbers.land_transfer_tax_total == 32_475


def test_ltt_rebate_floor_zero():
    # Rebate can never produce negative LTT
    engine = make_engine()
    result = engine.build(base_input(list_price=150_000, buyer_profile="first_time"))
    assert result.key_numbers.land_transfer_tax_total >= 0


def test_ltt_toronto_mltt_above_2m():
    # Toronto MLTT has extra tiers above $2M — combined should be > 2× Ontario
    engine = make_engine()
    result_3m = engine.build(base_input(list_price=3_000_000, buyer_profile="investor"))
    result_2m = engine.build(base_input(list_price=2_000_000, buyer_profile="investor"))
    assert result_3m.key_numbers.land_transfer_tax_total > result_2m.key_numbers.land_transfer_tax_total


def test_ltt_investor_higher_than_first_time():
    engine = make_engine()
    first_time = engine.build(base_input(buyer_profile="first_time"))
    investor = engine.build(base_input(buyer_profile="investor"))
    assert first_time.key_numbers.land_transfer_tax_total < investor.key_numbers.land_transfer_tax_total


# ── Mortgage ──────────────────────────────────────────────────────────────────

def test_mortgage_scenario_ordering():
    engine = make_engine()
    result = engine.build(base_input())
    totals = {s.scenario: s.total_cost for s in result.scenarios}
    assert totals["bull"] <= totals["base"] <= totals["bear"]


def test_insured_premium_thresholds():
    engine = make_engine()
    under_ten = engine.build(base_input(down_payment_percent=9))
    at_ten    = engine.build(base_input(down_payment_percent=10))
    at_fifteen = engine.build(base_input(down_payment_percent=15))
    at_twenty  = engine.build(base_input(down_payment_percent=20))
    assert under_ten.key_numbers.insured_mortgage_premium > at_ten.key_numbers.insured_mortgage_premium
    assert at_ten.key_numbers.insured_mortgage_premium > at_fifteen.key_numbers.insured_mortgage_premium
    assert at_twenty.key_numbers.insured_mortgage_premium == 0


def test_cmhc_not_applied_above_1_5m():
    engine = make_engine()
    result = engine.build(base_input(list_price=1_600_000, down_payment_percent=10))
    assert result.key_numbers.insured_mortgage_premium == 0


def test_amortization_over_25_increases_premium():
    engine = make_engine()
    at_25 = engine.build(base_input(down_payment_percent=10, amortization_years=25))
    at_30 = engine.build(base_input(down_payment_percent=10, amortization_years=30))
    assert at_30.key_numbers.insured_mortgage_premium > at_25.key_numbers.insured_mortgage_premium


# ── Property tax ─────────────────────────────────────────────────────────────

def test_property_tax_positive_and_scales():
    engine = make_engine()
    low  = engine.build(base_input(list_price=500_000))
    high = engine.build(base_input(list_price=1_000_000))
    assert low.key_numbers.property_tax_10y > 0
    assert high.key_numbers.property_tax_10y > low.key_numbers.property_tax_10y


def test_investor_property_tax_higher():
    engine = make_engine()
    residential = engine.build(base_input(buyer_profile="first_time"))
    investor    = engine.build(base_input(buyer_profile="investor"))
    assert investor.key_numbers.property_tax_10y > residential.key_numbers.property_tax_10y


def test_property_type_multiplier_affects_tax():
    engine = make_engine()
    condo    = engine.build(base_input(property_type="condo"))
    suburban = engine.build(base_input(property_type="detached_suburban"))
    # condo multiplier (0.90) > suburban (0.55) → higher assessed value → higher tax
    assert condo.key_numbers.property_tax_10y > suburban.key_numbers.property_tax_10y


# ── Composite signals ─────────────────────────────────────────────────────────

def test_composite_confidence_always_low():
    engine = make_engine()
    result = engine.build(base_input())
    for cs in result.composite_signals:
        assert cs["confidence"] == "Low"


def test_composite_disclaimer_present():
    engine = make_engine()
    result = engine.build(base_input())
    for cs in result.composite_signals:
        assert cs["disclaimer"]


def test_maintenance_elevated_with_multiple_factors():
    engine = make_engine()
    result = engine.build(base_input(
        active_permits=ActivePermitsEvidence(
            permit_count=2, structural_count=2, elevated_risk_count=0,
            top_work_types=["structural"], confidence="High", source="test",
        ),
        cleared_permits=ClearedPermitsEvidence(
            permit_count=10, structural_count=5, structural_last_10y=5,
            years_since_last_permit=2, deferred_maintenance=False, chronic_issues=True,
            confidence="High", source="test",
        ),
        flood=FloodEvidence(status="elevated", in_flood_zone=True, internal_loading=2500, source="test"),
    ))
    maintenance = next(cs for cs in result.composite_signals if "Maintenance" in cs["signal_name"])
    assert maintenance["value"] == "Elevated"


# ── Cost breakdown ───────────────────────────────────────────────────────────

def test_cost_breakdown_keys():
    engine = make_engine()
    result = engine.build(base_input())
    keys = [c.key for c in result.components]
    assert "mortgage_base" in keys
    assert "land_transfer_tax" in keys
    assert "property_tax_10y" in keys
