"""
Meridian RAG — authoritative source registry.

Each entry maps to one of the 7 legislative/regulatory knowledge domains
the agent must reason about. Tags drive filtered retrieval so the agent
pulls only relevant chunks per query type.
"""

from dataclasses import dataclass, field


@dataclass(frozen=True)
class RagSource:
    id: str
    name: str
    url: str
    fetch_type: str  # "html" | "pdf"
    tags: list[str] = field(default_factory=list)
    # Plain-language description used in the agent system prompt citation
    description: str = ""


SOURCES: list[RagSource] = [
    # ── 1. Ontario & Toronto Legislation ─────────────────────────────────────
    RagSource(
        id="ontario_ltt_act",
        name="Ontario Land Transfer Tax Act",
        url="https://www.ontario.ca/laws/statute/90l06",
        fetch_type="html",
        tags=["land_transfer_tax", "ontario", "legislation"],
        description="Ontario LTT Act — progressive brackets, exemptions, rebates",
    ),
    RagSource(
        id="toronto_mltt",
        name="Toronto Municipal Code Chapter 760 (MLTT)",
        url="https://www.toronto.ca/legdocs/municode/toronto-code-760.pdf",
        fetch_type="pdf",
        tags=["land_transfer_tax", "toronto", "legislation", "municipal"],
        description="Toronto Municipal Land Transfer Tax — brackets and first-time buyer provisions",
    ),
    RagSource(
        id="ontario_heritage_act",
        name="Ontario Heritage Act",
        url="https://www.ontario.ca/laws/statute/90o18",
        fetch_type="html",
        tags=["heritage", "ontario", "legislation", "renovation"],
        description="Ontario Heritage Act — legal obligations for designated properties",
    ),
    # ── 2. MPAC Assessment ───────────────────────────────────────────────────
    RagSource(
        id="mpac_guide",
        name="MPAC Understanding Your Assessment",
        url="https://www.mpac.ca/en/UnderstandingYourAssessment",
        fetch_type="html",
        tags=["mpac", "assessment", "property_tax", "valuation"],
        description="MPAC methodology — current value assessment, phase-in, how to appeal",
    ),
    # ── 3. First-Time Buyer Programs ─────────────────────────────────────────
    RagSource(
        id="fhsa_guide",
        name="First Home Savings Account (FHSA) — CRA Guide",
        url="https://www.canada.ca/en/revenue-agency/services/tax/individuals/topics/first-home-savings-account.html",
        fetch_type="html",
        tags=["first_time_buyer", "fhsa", "federal", "savings"],
        description="FHSA eligibility rules, contribution limits, withdrawal conditions",
    ),
    RagSource(
        id="rrsp_hbp",
        name="RRSP Home Buyers' Plan — CRA Guide",
        url="https://www.canada.ca/en/revenue-agency/services/tax/individuals/topics/rrsps-related-plans/what-home-buyers-plan.html",
        fetch_type="html",
        tags=["first_time_buyer", "rrsp", "hbp", "federal"],
        description="HBP withdrawal limit, repayment schedule, re-qualification rules",
    ),
    RagSource(
        id="ontario_ltt_refund",
        name="Ontario LTT Refund for First-Time Homebuyers",
        url="https://www.ontario.ca/page/land-transfer-tax-refunds-first-time-homebuyers",
        fetch_type="html",
        tags=["first_time_buyer", "land_transfer_tax", "ontario", "refund"],
        description="Ontario first-time buyer LTT refund — max $4,000, eligibility, application process",
    ),
    # ── 4. Toronto Zoning ────────────────────────────────────────────────────
    RagSource(
        id="toronto_zoning",
        name="Toronto Zoning By-law 569-2013",
        url="https://www.toronto.ca/city-government/planning-development/zoning-by-law-project/zoning-by-law-569-2013-as-amended/",
        fetch_type="html",
        tags=["zoning", "toronto", "renovation", "development", "bylaw"],
        description="Permitted uses, setbacks, height limits, minor variance process",
    ),
    # ── 5. TRCA Flood Risk ───────────────────────────────────────────────────
    RagSource(
        id="trca_flood",
        name="TRCA Flood Risk Management",
        url="https://trca.ca/conservation/flood-risk-management/",
        fetch_type="html",
        tags=["flood_risk", "trca", "insurance", "basement", "resale"],
        description="Floodplain regulations, permit requirements, insurance and basement implications",
    ),
    # ── 6. Mortgage Stress Test ──────────────────────────────────────────────
    RagSource(
        id="osfi_b20",
        name="OSFI Guideline B-20 — Residential Mortgage Underwriting",
        url="https://www.osfi-bsif.gc.ca/en/guidance/guidance-library/b-20",
        fetch_type="html",
        tags=["mortgage", "stress_test", "osfi", "qualification"],
        description="B-20 qualifying rate rules, LTV limits, amortization constraints",
    ),
    # ── 7. Toronto Heritage Designation Process ──────────────────────────────
    RagSource(
        id="toronto_heritage_planning",
        name="Toronto Heritage Planning Guidelines",
        url="https://www.toronto.ca/city-government/planning-development/heritage-preservation/",
        fetch_type="html",
        tags=["heritage", "toronto", "part_iv", "part_v", "designation", "renovation"],
        description="Part IV (individual) vs Part V (district) designation — permits, alterations, demolition",
    ),
]

# Quick lookup by id
SOURCES_BY_ID: dict[str, RagSource] = {s.id: s for s in SOURCES}

# Tag → source ids index (for filtered retrieval)
TAG_INDEX: dict[str, list[str]] = {}
for _src in SOURCES:
    for _tag in _src.tags:
        TAG_INDEX.setdefault(_tag, []).append(_src.id)
