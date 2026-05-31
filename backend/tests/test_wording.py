from app.services.wording import apply, validate


def test_apply_removes_red_flag():
    assert "elevated review recommended" in apply("This is a red flag situation.")
    assert "red flag" not in apply("This is a red flag situation.")


def test_apply_removes_hard_red_flag():
    result = apply("hard red flag detected")
    assert "hard red flag" not in result
    assert "elevated" in result


def test_apply_removes_special_assessment_risk():
    result = apply("High special assessment risk identified.")
    assert "high special assessment risk" not in result.lower()
    assert "elevated maintenance complexity signal" in result


def test_apply_removes_tax_increases():
    result = apply("Watch for potential tax increases in this area.")
    assert "potential tax increases" not in result
    assert "potential neighbourhood change" in result


def test_apply_removes_major_issues():
    result = apply("The building has major issues.")
    assert "major issues" not in result
    assert "further due diligence recommended" in result


def test_apply_removes_dollar_3500():
    result = apply("Estimated flood loading of $3,500 per year.")
    assert "$3,500" not in result


def test_apply_removes_insurance_loading():
    result = apply("Annual insurance loading applies.")
    assert "insurance loading" not in result


def test_apply_idempotent():
    text = "This is a red flag situation with major issues."
    once  = apply(text)
    twice = apply(once)
    assert once == twice


def test_validate_catches_banned():
    found = validate("This red flag is a major issues situation with insurance loading.")
    assert len(found) >= 2


def test_validate_clean_text():
    clean = "Elevated review recommended. Further due diligence recommended."
    assert validate(clean) == []
