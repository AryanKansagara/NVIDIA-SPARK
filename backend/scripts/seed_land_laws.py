#!/usr/bin/env python3
"""Generate starter land-law PDFs into data/land_laws/ for RAG grounding.

These are concise, factual reference notes on Toronto/Ontario property law so the
RAG pipeline has real content to retrieve out of the box. Replace or add your own
PDFs in the same folder, then run `python scripts/ingest_docs.py`.

    python scripts/seed_land_laws.py
"""
from pathlib import Path

from reportlab.lib.pagesizes import letter
from reportlab.lib.styles import getSampleStyleSheet
from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer

DOCS: dict[str, list[str]] = {
    "ontario_toronto_land_transfer_tax.pdf": [
        "Land Transfer Tax in Toronto — Reference Note",
        "A buyer of land in Toronto pays TWO land transfer taxes: the provincial Ontario "
        "Land Transfer Tax (LTT) and the Municipal Land Transfer Tax (MLTT). Both are payable "
        "on closing and are calculated on the purchase price (value of the consideration).",
        "Ontario LTT marginal rates: 0.5% on the first $55,000; 1.0% on $55,000–$250,000; "
        "1.5% on $250,000–$400,000; 2.0% on $400,000–$2,000,000; 2.5% on the amount over "
        "$2,000,000 for one or two single-family residences.",
        "Toronto MLTT mirrors the provincial bracket structure on the same consideration and, "
        "for high-value homes, adds further luxury brackets above $3,000,000.",
        "First-time home buyers may claim a refund of up to $4,000 of the Ontario LTT and up to "
        "$4,475 of the Toronto MLTT, for a combined maximum first-time rebate of $8,475. To "
        "qualify the buyer must be at least 18, must occupy the home as a principal residence "
        "within nine months, and must never have owned a home anywhere in the world.",
        "Land transfer tax is a closing cost that is not financeable into the mortgage and must "
        "be paid from the buyer's own funds, materially increasing the true cost of ownership.",
    ],
    "ontario_heritage_act.pdf": [
        "Ontario Heritage Act — Buyer Reference Note",
        "The Ontario Heritage Act lets municipalities identify and protect property of cultural "
        "heritage value. In Toronto a property may be 'listed' on the Heritage Register or "
        "formally 'designated' under Part IV (individual property) or Part V (within a Heritage "
        "Conservation District).",
        "Designation under Part IV restricts alteration: the owner must obtain Council consent "
        "before altering any heritage attribute, and cannot demolish or remove a designated "
        "structure without Council approval. These approvals add time, cost, and uncertainty to "
        "any renovation.",
        "Listed (non-designated) properties carry a 60-day demolition notice requirement, giving "
        "Council time to consider designation before a permit is issued.",
        "Heritage Conservation District (Part V) properties are subject to district guidelines "
        "governing materials, additions, and streetscape character. Heritage permits are "
        "required for visible exterior work.",
        "For a buyer, heritage status can constrain redevelopment potential, raise maintenance "
        "and renovation costs (period-appropriate materials), and lengthen permit timelines. It "
        "is a material risk flag for the true 10-year cost of ownership.",
    ],
    "trca_flood_regulation.pdf": [
        "TRCA Flood Regulation & Floodlines — Buyer Reference Note",
        "The Toronto and Region Conservation Authority (TRCA) regulates development near "
        "watercourses, valleys, shorelines, and flood-prone areas under Ontario Regulation 166/06 "
        "(Development, Interference with Wetlands and Alterations to Shorelines and Watercourses).",
        "Property within a TRCA regulated area or Regulatory Floodline may require a TRCA permit "
        "before development, grading, or shoreline alteration. Permits can restrict additions, "
        "basements, and new structures, and may require flood-proofing.",
        "Properties in or near the Regulatory Floodline can face higher property-insurance "
        "premiums, restricted or denied overland flood coverage, and added annual risk loadings "
        "for water damage and remediation.",
        "The Don River, Humber River, and waterfront areas contain significant regulated "
        "floodplains. Buyers near these systems should confirm floodline status and insurability "
        "before closing.",
        "Flood exposure is treated as an annual risk loading in the cost engine because it "
        "recurs every year of ownership, not just at purchase.",
    ],
    "fhsa_first_home_savings_account.pdf": [
        "First Home Savings Account (FHSA) — First-Time Buyer Reference Note",
        "Source: Canada Revenue Agency (canada.ca), current for the 2026 tax year. The First "
        "Home Savings Account (FHSA) is a registered plan that helps first-time home buyers save "
        "for a qualifying home tax-free. Contributions are tax-deductible (like an RRSP) and "
        "qualifying withdrawals to buy a first home are non-taxable (like a TFSA).",
        "Eligibility — a 'qualifying individual' must be a resident of Canada, at least 18 years "
        "old, and 71 or younger as of December 31 of the year the FHSA is opened. They must be a "
        "first-time home buyer: they did not live in a qualifying home that they (or their spouse "
        "or common-law partner) owned as their principal place of residence at any time in the "
        "current calendar year or the previous four calendar years.",
        "Contribution limits — the annual FHSA participation room is $8,000. The lifetime limit "
        "on contributions and transfers in is $40,000. Unused annual room carries forward to the "
        "following year up to a maximum of $8,000 carry-forward, so a holder can contribute up to "
        "$16,000 in a single year. Over-contributions are subject to a 1% per-month penalty tax "
        "on the excess.",
        "Tax treatment — contributions are deductible against income and the deduction can be "
        "carried forward to a future year. Investment growth inside the FHSA is tax-sheltered. A "
        "qualifying withdrawal (to buy a qualifying home — a housing unit in Canada, including a "
        "home under construction) is completely tax-free and does not have to be repaid, unlike "
        "the RRSP Home Buyers' Plan.",
        "Combining with the RRSP Home Buyers' Plan (HBP) — a buyer can make a qualifying FHSA "
        "withdrawal AND withdraw from their RRSP under the HBP for the SAME qualifying home, as "
        "long as all conditions for each withdrawal are met. The HBP currently allows an RRSP "
        "withdrawal of up to $60,000, repayable over 15 years; the FHSA portion never has to be "
        "repaid. Together they can materially increase a first-time buyer's down payment.",
        "Maximum participation period and unused funds — an FHSA must be closed by December 31 of "
        "the year in which the earliest of these occurs: the 15th anniversary of opening the "
        "first FHSA, the year the holder turns 71, or the year following the first qualifying "
        "withdrawal. If the funds are not used to buy a home, they can be transferred tax-free "
        "into an RRSP or RRIF (without affecting RRSP contribution room); otherwise a non-"
        "qualifying withdrawal is taxable as income.",
        "Why it matters for the true cost of ownership — the FHSA reduces the effective cost of "
        "assembling a down payment by giving a tax deduction on the way in and tax-free growth "
        "and withdrawal on the way out. A larger down payment can lower or eliminate CMHC "
        "mortgage-default insurance (required below 20% down) and reduce total mortgage interest.",
    ],
    "toronto_home_energy_loan_program.pdf": [
        "Toronto Home Energy Loan Program (HELP) — Sustainability & Cost Reference Note",
        "Source: City of Toronto (toronto.ca), current for 2026. The Home Energy Loan Program "
        "(HELP) lets Toronto homeowners borrow up to $125,000 to pay for home energy improvements. "
        "Through the enhanced program, zero-interest loans are available for a limited time.",
        "Repayment terms are up to 15 years, extended to 20 years for retrofits that include "
        "rooftop solar PV, geothermal systems, new windows, or electric heat pumps. The loan is "
        "repaid through the homeowner's property tax bill as a Local Improvement Charge (LIC) "
        "under City by-laws 1105-2013 and 1330-2013, and can be paid off at any time.",
        "Eligible high-impact measures include replacing a furnace with an electric heat pump, "
        "insulating from attic to basement, upgrading windows and doors, air sealing (weather "
        "stripping and caulking), rooftop solar PV, and geothermal. HELP also helps homeowners "
        "stack utility-company and federal rebates.",
        "Property eligibility: you must own a detached, semi-detached, row house, duplex, triplex, "
        "or any low-rise residential building of at most three storeys and six units located in "
        "Toronto (postal code starting with 'M').",
        "Cost-of-ownership angle: because the loan is repaid as a charge on the property tax bill, "
        "a green retrofit becomes a predictable financed carrying cost while lowering monthly "
        "energy bills — directly relevant to the true 10-year cost of ownership and to a buyer's "
        "sustainability profile.",
    ],
    "energuide_home_energy_evaluation.pdf": [
        "EnerGuide Home Energy Evaluation — Sustainability Reference Note",
        "Source: Natural Resources Canada / City of Toronto (Better Homes Toronto), current for "
        "2026. An EnerGuide Home Energy Evaluation is a top-to-bottom assessment of a home's "
        "energy performance carried out by an NRCan-registered energy advisor, inspecting "
        "insulation, heating and cooling systems, air leakage, and overall energy use.",
        "The evaluation produces an EnerGuide rating (the home's estimated annual energy "
        "consumption) and a homeowner report listing recommended upgrades ranked by impact. A "
        "pre-retrofit and a post-retrofit evaluation are typically required to qualify for and "
        "verify savings under most retrofit rebate and loan programs.",
        "The EnerGuide Rating System is the standard NRCan uses to assess eligibility for energy "
        "programs, including CMHC's Eco Plus and Eco Improvement premium refunds.",
        "Cost-of-ownership angle: a lower EnerGuide rating means lower ongoing energy costs across "
        "the ownership horizon, and the rating is an increasingly visible sustainability signal at "
        "resale. Getting an evaluation is the first step before financing efficiency upgrades.",
    ],
    "toronto_green_standard.pdf": [
        "Toronto Green Standard (TGS) — Sustainable Building Reference Note",
        "Source: City of Toronto (toronto.ca), current for 2026. The Toronto Green Standard is the "
        "City's set of sustainable design and performance requirements for new private and "
        "city-owned developments, in place since 2010. Version 4 took effect on May 1, 2022 for "
        "new planning applications.",
        "The Standard is tiered: Tier 1 is mandatory and applied through the planning-approval "
        "process, while higher tiers are voluntary and can be encouraged through incentives. The "
        "tiers cover energy and greenhouse-gas performance, climate resilience, water, air "
        "quality, and ecology.",
        "For low-rise residential buildings, TGS requires design and construction to meet ENERGY "
        "STAR for New Homes version 17.1 or R-2000, or the CHBA Net Zero Home labelling program, "
        "or the Passive House standard.",
        "Cost-of-ownership angle: homes built to the Toronto Green Standard are more energy "
        "efficient and lower-emitting, which reduces operating costs over the ownership period and "
        "strengthens a buyer's sustainability story for a newer or new-build property.",
    ],
    "cmhc_eco_plus_green_premium_refund.pdf": [
        "CMHC Eco Plus & Eco Improvement — Green Mortgage Premium Refund Reference Note",
        "Source: Canada Mortgage and Housing Corporation (cmhc-schl.gc.ca), current for 2026. CMHC "
        "Eco Plus offers a 25% partial refund of the mortgage loan insurance premium to "
        "CMHC-insured borrowers who buy an energy-efficient home — a direct reduction of the CMHC "
        "premium that applies when the down payment is below 20%.",
        "As of July 8, 2025, CMHC Eco Plus is available only for newly built homes that have an "
        "energy-efficiency certificate or rating. Eligibility is assessed using the Natural "
        "Resources Canada (NRCan) EnerGuide Rating System and the home must meet the energy "
        "efficiency target.",
        "CMHC Eco Improvement offers the same 25% partial premium refund to borrowers who buy an "
        "existing home and make energy-efficient improvements to it.",
        "To claim, eligible borrowers have up to two years after closing the mortgage to submit "
        "the refund request and supporting documentation directly to CMHC.",
        "Cost-of-ownership angle: because Meridian's engine computes the CMHC insured premium as a "
        "real cost, a 25% Eco refund is a concrete sustainability-linked saving — buying or "
        "upgrading to an energy-efficient home lowers both the premium and ongoing energy bills.",
    ],
    "toronto_property_tax_and_development.pdf": [
        "Toronto Property Tax & Development Pressure — Buyer Reference Note",
        "Toronto property tax is levied annually as a percentage of the property's assessed value "
        "as determined by the Municipal Property Assessment Corporation (MPAC). The total rate "
        "combines the City, education, and city-building levies and is in the order of 0.7% of "
        "assessed value, rising over time with budget increases and reassessment.",
        "Because property tax is charged every year, a decade of property tax is one of the "
        "largest non-mortgage costs of ownership and compounds with assessed-value growth.",
        "Active development applications near a property (rezonings, site-plan approvals, and "
        "committee-of-adjustment minor variances) signal neighbourhood change. A high "
        "concentration of nearby applications can mean construction disruption, shadowing, and "
        "shifting amenity and traffic patterns over the ownership horizon.",
        "Development pressure cuts both ways: it can raise long-run land value but also introduce "
        "years of construction impact. The cost engine flags high application counts within a "
        "500-metre radius as a neighbourhood-change risk.",
        "CMHC mortgage default insurance is required when the down payment is below 20%. The "
        "premium is added to the mortgage principal and increases total interest paid over the "
        "amortization, another hidden cost beyond the list price.",
    ],
}


def build() -> None:
    out_dir = Path(__file__).resolve().parent.parent / "data" / "land_laws"
    out_dir.mkdir(parents=True, exist_ok=True)
    styles = getSampleStyleSheet()
    for filename, blocks in DOCS.items():
        path = out_dir / filename
        doc = SimpleDocTemplate(str(path), pagesize=letter, title=filename)
        flow = [Paragraph(blocks[0], styles["Title"]), Spacer(1, 12)]
        for para in blocks[1:]:
            flow.append(Paragraph(para, styles["BodyText"]))
            flow.append(Spacer(1, 8))
        doc.build(flow)
        print(f"wrote {path}")


if __name__ == "__main__":
    build()
