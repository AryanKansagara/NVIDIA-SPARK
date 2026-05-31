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
