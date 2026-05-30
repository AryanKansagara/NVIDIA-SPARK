"""
Meridian RAG — prompt builder for Agent 4 (synthesis / NIM).

This module is the bridge between the RAG retrieval layer and the
existing NIM synthesis call. It:

  1. Detects which knowledge domains a given report needs (from flags + buyer profile).
  2. Retrieves the relevant legislative chunks from ChromaDB.
  3. Builds a structured context block that slots into the existing
     Agent 4 system prompt.

Usage in your existing NIM call (agent_4/synthesis.py or wherever you
currently call NIM):

    from app.rag.prompt import build_rag_context, TAG_MAP

    tags = TAG_MAP.from_report(report_input, flags)
    context_block = await build_rag_context(report_input.address, tags)

    # Then include context_block in your system prompt to NIM.
"""

from __future__ import annotations

import textwrap
from dataclasses import dataclass

from app.rag.service import retrieve


# ── Tag auto-detection ────────────────────────────────────────────────────────

@dataclass
class ReportSignals:
    """Thin struct carrying the signals Agent 4 already has."""
    is_first_time_buyer: bool = False
    has_heritage_flag: bool = False       # Part IV, Part V, or Listed
    has_flood_flag: bool = False
    has_development_pressure: bool = False
    down_payment_pct: float = 20.0        # % — used to decide stress test relevance
    list_price: float = 0.0


def detect_tags(signals: ReportSignals) -> list[str]:
    """
    Map report signals → retrieval tag filters.
    Always include land_transfer_tax and mpac (universal to every report).
    """
    tags = ["land_transfer_tax", "mpac", "mortgage", "stress_test"]

    if signals.is_first_time_buyer:
        tags += ["first_time_buyer", "fhsa", "rrsp"]

    if signals.has_heritage_flag:
        tags += ["heritage", "part_iv", "part_v", "renovation"]

    if signals.has_flood_flag:
        tags += ["flood_risk", "insurance", "basement"]

    if signals.has_development_pressure:
        tags += ["zoning", "development"]

    return list(dict.fromkeys(tags))  # dedupe, preserve order


# ── Context block builder ─────────────────────────────────────────────────────

_CONTEXT_HEADER = """\
You have access to the following excerpts from official Ontario, Toronto, Federal, \
OSFI, TRCA, and MPAC legislation and guidelines. \
When your narrative references any of these topics, cite the source by name and \
explain the LEGAL OR FINANCIAL IMPLICATION for this specific buyer — \
not just what the rule says, but what it means for their decision.\
"""

_CHUNK_TEMPLATE = """\
[{i}] {source_name}
URL: {url}
---
{text}
"""


async def build_rag_context(
    query: str,
    signals: ReportSignals,
    n_results: int = 8,
) -> str:
    """
    Retrieve relevant legislative chunks and format them as a context block
    ready to insert into the Agent 4 NIM system prompt.

    Args:
        query: a descriptive query derived from the report
               e.g. "heritage designation implications and LTT for first-time buyer
                    purchasing 123 Main St Toronto at $950,000"
        signals: flags and buyer profile from the Meridian engine output.
        n_results: total chunks to include (8 fits comfortably in ~2k tokens).

    Returns:
        A formatted multi-line string to inject into the NIM system prompt.
        Returns an empty string if retrieval fails — Agent 4 degrades gracefully.
    """
    tags = detect_tags(signals)

    try:
        hits = await retrieve(query, n_results=n_results, filter_tags=tags)
    except Exception:
        return ""

    if not hits:
        return ""

    chunk_blocks = "\n\n".join(
        _CHUNK_TEMPLATE.format(
            i=idx + 1,
            source_name=hit["source_name"],
            url=hit["url"],
            text=textwrap.fill(hit["text"], width=120),
        )
        for idx, hit in enumerate(hits)
    )

    return f"{_CONTEXT_HEADER}\n\n{chunk_blocks}"


# ── Convenience: query builder from engine output ─────────────────────────────

def build_query_from_report(
    address: str,
    list_price: float,
    signals: ReportSignals,
) -> str:
    """
    Construct a rich retrieval query from the report inputs so that
    semantic search finds the most relevant statute and guideline chunks.
    """
    parts = [f"Toronto property at {address} listed at ${list_price:,.0f}"]

    if signals.is_first_time_buyer:
        parts.append("first-time buyer FHSA RRSP Home Buyers Plan land transfer tax refund eligibility")
    if signals.has_heritage_flag:
        parts.append("heritage designation Part IV Part V renovation permit obligations Ontario Heritage Act")
    if signals.has_flood_flag:
        parts.append("flood zone TRCA permit insurance basement finishing restrictions resale")
    if signals.has_development_pressure:
        parts.append("zoning bylaw development application nearby renovation permissions")

    parts.append("land transfer tax Ontario Toronto MPAC assessed value property tax stress test mortgage qualification")

    return " ".join(parts)
