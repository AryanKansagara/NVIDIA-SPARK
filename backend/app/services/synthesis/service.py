import json
import re

import httpx

from app.core.config import Settings
from app.services.data_sources.models import DevelopmentEvidence, FloodEvidence, HeritageEvidence
from app.services.engine.report_engine import EngineOutput
from app.services.wording import apply as wording_apply

_SYSTEM_PROMPT = """\
You are a property report synthesis agent for a Toronto home buyer.
Use ONLY the provided analysis JSON. Rules:
- Every claim references a specific finding in the input.
- Use the exact dollar figures provided. Never invent or recompute numbers.
- If a confidence is Medium or Low, say so explicitly.
- For each elevated flag, give ONE sentence of negotiation leverage with a dollar RANGE drawn from cost_breakdown.
- Never use "red flag" — say "elevated review recommended".
- If a category has no data, say "No concerns identified" for it. Never speculate.
- Tone: direct, clear, protective of the buyer.
Output valid JSON (no markdown fences) matching this schema exactly:
{"verdict_paragraph": "string", "flag_explanations": ["string", ...], "negotiation_leverage": [{"flag": "string", "dollar_low": int, "dollar_high": int, "script": "string"}]}
"""


def _extract_json(raw: str) -> dict | None:
    """Strip markdown fences, brace-extract, parse. Returns None on failure."""
    # Strip ```json ... ``` fences
    text = re.sub(r"```(?:json)?\s*", "", raw).strip().rstrip("`").strip()
    # Try direct parse first
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        pass
    # Brace extraction — find outermost { ... }
    start = text.find("{")
    end = text.rfind("}")
    if start != -1 and end > start:
        try:
            return json.loads(text[start : end + 1])
        except json.JSONDecodeError:
            pass
    return None


def _templated_summary(
    address: str,
    list_price: float,
    buyer_profile: str,
    engine_output: EngineOutput,
) -> str:
    """Deterministic fallback when LLM fails twice. Correct numbers, plain prose."""
    kn = engine_output.key_numbers
    above = round((engine_output.true_cost - list_price) / list_price * 100)
    red_flags = [f for f in engine_output.flags if f.severity == "red"]
    flag_lines = "\n".join(f"- {f.title}: {f.message}" for f in red_flags) or "- No elevated signals found."
    return (
        f"{address} — {engine_output.verdict_level} risk profile for a {buyer_profile} buyer. "
        f"True ownership cost: ${engine_output.true_cost:,} ({above:+d}% above list). "
        f"10-year cash outflow: ${engine_output.total_cost:,}. "
        f"Land transfer tax: ${kn.land_transfer_tax_total:,}. "
        f"10-year property tax: ${kn.property_tax_10y:,}. "
        f"Mortgage interest (10yr): ${kn.mortgage_cost_10y_base:,}.\n"
        f"Elevated signals:\n{flag_lines}"
    )


class SynthesisService:
    def __init__(self, settings: Settings) -> None:
        self.settings = settings

    async def synthesize(
        self,
        address: str,
        list_price: float,
        buyer_profile: str,
        engine_output: EngineOutput,
        heritage: HeritageEvidence,
        flood: FloodEvidence,
        development: DevelopmentEvidence,
        law_context: list[str] | None = None,
    ) -> str | None:
        if not self.settings.nim_enabled:
            return None
        try:
            return await self._call_with_retry(
                address, list_price, buyer_profile, engine_output,
                heritage, flood, development, law_context or [],
            )
        except httpx.ConnectError:
            # NIM not reachable — fall back to deterministic summary so the report still completes
            return _templated_summary(address, list_price, buyer_profile, engine_output)
        except Exception:
            return _templated_summary(address, list_price, buyer_profile, engine_output)

    async def _call_with_retry(
        self,
        address: str,
        list_price: float,
        buyer_profile: str,
        engine_output: EngineOutput,
        heritage: HeritageEvidence,
        flood: FloodEvidence,
        development: DevelopmentEvidence,
        law_context: list[str],
    ) -> str:
        messages = self._build_messages(
            address, list_price, buyer_profile, engine_output,
            heritage, flood, development, law_context,
        )
        raw = await self._call_nim(messages)
        parsed = _extract_json(raw)
        if parsed is None:
            # Retry once
            raw = await self._call_nim(messages)
            parsed = _extract_json(raw)

        if parsed is None:
            return _templated_summary(address, list_price, buyer_profile, engine_output)

        # Render structured JSON into a readable string and enforce wording rules
        parts = [parsed.get("verdict_paragraph", "")]
        parts += parsed.get("flag_explanations", [])
        for lev in parsed.get("negotiation_leverage", []):
            parts.append(lev.get("script", ""))
        combined = " ".join(p for p in parts if p)
        return wording_apply(combined)

    def _build_messages(
        self,
        address: str,
        list_price: float,
        buyer_profile: str,
        engine_output: EngineOutput,
        heritage: HeritageEvidence,
        flood: FloodEvidence,
        development: DevelopmentEvidence,
        law_context: list[str],
    ) -> list[dict]:
        kn = engine_output.key_numbers
        above_list_pct = round((engine_output.true_cost - list_price) / list_price * 100)

        context = {
            "address": address,
            "list_price": int(list_price),
            "buyer_profile": buyer_profile,
            "verdict_level": engine_output.verdict_level,
            "true_cost": engine_output.true_cost,
            "cash_outflow_10y": engine_output.total_cost,
            "above_list_percent": above_list_pct,
            "key_numbers": {
                "land_transfer_tax": kn.land_transfer_tax_total,
                "property_tax_10y": kn.property_tax_10y,
                "insured_mortgage_premium": kn.insured_mortgage_premium,
                "mortgage_interest_10y": kn.mortgage_cost_10y_base,
                "transit_dividend": kn.transit_dividend,
            },
            "elevated_flags": [
                {"title": f.title, "message": f.message}
                for f in engine_output.flags if f.severity == "red"
            ],
            "mortgage_scenarios": [
                {"scenario": s.scenario, "total_cost": s.total_cost}
                for s in engine_output.scenarios
            ],
            **({"rag_context": law_context} if law_context else {}),
        }

        return [
            {"role": "system", "content": _SYSTEM_PROMPT},
            {"role": "user", "content": json.dumps(context)},
        ]

    async def _call_nim(self, messages: list[dict]) -> str:
        payload = {
            "model": self.settings.nim_model,
            "messages": messages,
            "max_tokens": 600,
            "temperature": 0.3,
            "stream": False,
        }
        async with httpx.AsyncClient(timeout=self.settings.nim_timeout_seconds) as client:
            resp = await client.post(
                f"{self.settings.nim_base_url}/chat/completions",
                json=payload,
            )
            resp.raise_for_status()
            return resp.json()["choices"][0]["message"]["content"].strip()
