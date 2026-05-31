from app.services.data_sources.models import ActivePermitsEvidence, ClearedPermitsEvidence, FloodEvidence
from tests.test_engine import base_input, make_engine


def _build(overrides=None):
    return make_engine().build(base_input(**(overrides or {})))


def _maintenance(result):
    return next(cs for cs in result.composite_signals if "Maintenance" in cs["signal_name"])


def _tax_pressure(result):
    return next(cs for cs in result.composite_signals if "Tax Pressure" in cs["signal_name"])


# ── Confidence is always Low ──────────────────────────────────────────────────

def test_maintenance_confidence_always_low():
    assert _maintenance(_build())["confidence"] == "Low"


def test_tax_pressure_confidence_always_low():
    assert _tax_pressure(_build())["confidence"] == "Low"


# ── Disclaimer always present ─────────────────────────────────────────────────

def test_maintenance_disclaimer_present():
    assert _maintenance(_build())["disclaimer"]


def test_tax_pressure_disclaimer_present():
    assert _tax_pressure(_build())["disclaimer"]


# ── Factor thresholds ─────────────────────────────────────────────────────────

def test_maintenance_low_with_no_factors():
    result = _build({
        "heritage": base_input().heritage.__class__(status="no_match", reason="", source="t"),
        "active_permits": ActivePermitsEvidence(0, 0, 0, [], "Low", "t"),
        "cleared_permits": ClearedPermitsEvidence(0, 0, 0, None, False, False, "Low", "t"),
        "flood": FloodEvidence("low", False, 0, "t"),
    })
    assert _maintenance(result)["value"] == "Low"


def test_maintenance_elevated_with_three_plus_factors():
    result = _build({
        "active_permits": ActivePermitsEvidence(2, 2, 0, ["structural"], "High", "t"),
        "cleared_permits": ClearedPermitsEvidence(10, 5, 5, 2, False, True, "High", "t"),
        "flood": FloodEvidence("elevated", True, 2500, "t"),
    })
    assert _maintenance(result)["value"] == "Elevated"


def test_tax_pressure_high_at_10_plus():
    result = _build({"development": base_input().development.__class__(
        application_count_500m=12, intensity="high", source="t"
    )})
    assert _tax_pressure(result)["value"] == "High"


def test_tax_pressure_medium_at_5_to_9():
    from app.services.data_sources.models import DevelopmentEvidence
    result = _build({"development": DevelopmentEvidence(7, "medium", "t")})
    assert _tax_pressure(result)["value"] == "Medium"


def test_tax_pressure_low_below_5():
    from app.services.data_sources.models import DevelopmentEvidence
    result = _build({"development": DevelopmentEvidence(3, "low", "t")})
    assert _tax_pressure(result)["value"] == "Low"


# ── Verdict derivation ────────────────────────────────────────────────────────

def test_verdict_red_on_active_structural():
    result = _build({"active_permits": ActivePermitsEvidence(1, 1, 0, ["structural"], "High", "t")})
    assert result.verdict_level == "RED"


def test_verdict_red_on_flood_elevated():
    result = _build({"flood": FloodEvidence("elevated", True, 2500, "t")})
    assert result.verdict_level == "RED"


def test_verdict_green_when_clean():
    from app.services.data_sources.models import DevelopmentEvidence
    result = _build({
        "heritage": base_input().heritage.__class__(status="no_match", reason="", source="t"),
        "active_permits": ActivePermitsEvidence(0, 0, 0, [], "Low", "t"),
        "cleared_permits": ClearedPermitsEvidence(0, 0, 0, None, False, False, "Low", "t"),
        "flood": FloodEvidence("low", False, 0, "t"),
        "development": DevelopmentEvidence(2, "low", "t"),
    })
    assert result.verdict_level == "GREEN"
