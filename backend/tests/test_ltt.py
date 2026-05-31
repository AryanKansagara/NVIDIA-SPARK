"""LTT oracle tests — values verified against ratehub.ca/land-transfer-tax-ontario."""
from app.services.engine.report_engine import ReportEngine
from app.core.config import get_settings

from tests.test_engine import base_input, make_engine


def test_oracle_500k_not_first_time():
    result = make_engine().build(base_input(list_price=500_000, buyer_profile="investor"))
    assert result.key_numbers.land_transfer_tax_total == 12_950


def test_oracle_750k_first_time():
    # $22,950 combined − $8,475 rebate = $14,475
    result = make_engine().build(base_input(list_price=750_000, buyer_profile="first_time"))
    assert result.key_numbers.land_transfer_tax_total == 14_475


def test_oracle_1200k_first_time():
    # $40,950 combined − $8,475 rebate = $32,475
    result = make_engine().build(base_input(list_price=1_200_000, buyer_profile="first_time"))
    assert result.key_numbers.land_transfer_tax_total == 32_475


def test_ltt_floor_zero():
    # Very cheap property — rebate cannot produce negative LTT
    result = make_engine().build(base_input(list_price=100_000, buyer_profile="first_time"))
    assert result.key_numbers.land_transfer_tax_total >= 0


def test_toronto_mltt_extra_tiers_above_2m():
    # Above $2M Toronto MLTT has additional tiers (2.5%, 3.5%, 4.5%, 5.5%)
    # Combined tax at $3M should be meaningfully higher than 2× Ontario alone
    engine = make_engine()
    r2m = engine.build(base_input(list_price=2_000_000, buyer_profile="investor"))
    r3m = engine.build(base_input(list_price=3_000_000, buyer_profile="investor"))
    # The extra $1M at Toronto tier 2.5% + Ontario tier 2.5% = $50K more
    assert r3m.key_numbers.land_transfer_tax_total - r2m.key_numbers.land_transfer_tax_total == 50_000


def test_rebate_only_for_first_time():
    engine = make_engine()
    ft   = engine.build(base_input(list_price=800_000, buyer_profile="first_time"))
    inv  = engine.build(base_input(list_price=800_000, buyer_profile="investor"))
    down = engine.build(base_input(list_price=800_000, buyer_profile="downsizer"))
    assert ft.key_numbers.land_transfer_tax_total < inv.key_numbers.land_transfer_tax_total
    assert down.key_numbers.land_transfer_tax_total == inv.key_numbers.land_transfer_tax_total
