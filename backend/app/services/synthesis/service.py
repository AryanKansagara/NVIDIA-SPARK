import json
from dataclasses import dataclass

import httpx

from app.core.config import Settings
from app.schemas.report import MonteCarloResult
from app.services.data_sources.models import DevelopmentEvidence, FloodEvidence, HeritageEvidence
from app.services.engine.report_engine import EngineOutput

_SYSTEM_PROMPT = """\
You are Meridian's analysis pipeline. You receive JSON about a Toronto property's true 10-year cost of ownership. Respond with a single JSON object (no markdown) with exactly these keys:

"summary": a 3-paragraph buyer summary — direct, factual, no financial advice.
  Paragraph 1 (verdict): state the true 10-year cost, how far above list price that is as a percentage, and the single most important risk flag. If Monte Carlo data is provided, state the 10-year P10/P90 range. If 5/15-year horizons are provided, note how the cost grows across horizons.
  Paragraph 2 (cost drivers): explain the 2 largest costs beyond the mortgage in plain English, using the exact dollar figures provided.
  Paragraph 3 (action): give 2 specific steps the buyer should take before closing, based on their profile and the flags present. If land-law excerpts are provided, reference specific legal obligations.

"intake_reasoning": 2-3 sentences as "Agent 1 — Intake + Planning": restate the resolved property, buyer profile, and which data-source lookups you planned (heritage register, flood plain, development applications). Mention the property type if inferable.

"synthesis_reasoning": 2-3 sentences as "Agent 4 — Synthesis": state the verdict (GREEN/YELLOW/RED), the negotiation leverage you assembled from the flags (sum the leverage ranges), and that all dollar figures came from the deterministic engine, not invented.

Rules: use only numbers from the input. No jargon. summary max 300 words.\
"""


@dataclass
class SynthesisResult:
    summary: str | None = None
    intake_reasoning: str | None = None
    synthesis_reasoning: str | None = None


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
        monte_carlo: MonteCarloResult | None = None,
        horizons: dict[str, MonteCarloResult] | None = None,
        profile: dict | None = None,
    ) -> SynthesisResult:
        if not self.settings.nim_enabled:
            return SynthesisResult()
        try:
            return await self._call_nim(
                address, list_price, buyer_profile, engine_output, heritage, flood, development,
                law_context or [], monte_carlo, horizons or {}, profile or {},
            )
        except Exception as exc:
            import logging
            logging.getLogger(__name__).error("NIM synthesis failed: %s", exc, exc_info=True)
            return SynthesisResult()

    async def _call_nim(
        self,
        address: str,
        list_price: float,
        buyer_profile: str,
        engine_output: EngineOutput,
        heritage: HeritageEvidence,
        flood: FloodEvidence,
        development: DevelopmentEvidence,
        law_context: list[str],
        monte_carlo: MonteCarloResult | None,
        horizons: dict[str, MonteCarloResult],
        profile: dict,
    ) -> SynthesisResult:
        kn = engine_output.key_numbers
        above_list_pct = round((engine_output.total_cost - list_price) / list_price * 100)

        context: dict = {
            "address": address,
            "list_price": int(list_price),
            "buyer_profile": buyer_profile,
            "true_10_year_cost": engine_output.total_cost,
            "above_list_percent": above_list_pct,
            **({"land_law_excerpts": law_context} if law_context else {}),
            "key_numbers": {
                "land_transfer_tax": kn.land_transfer_tax_total,
                "property_tax_10y": kn.property_tax_10y,
                "insured_mortgage_premium": kn.insured_mortgage_premium,
                "mortgage_10y_base": kn.mortgage_cost_10y_base,
                "transit_dividend": kn.transit_dividend,
            },
            "flags": [
                {
                    "severity": f.severity,
                    "title": f.title,
                    "message": f.message,
                    "confidence": f.confidence,
                    **(
                        {"leverage_low": f.leverage_low, "leverage_high": f.leverage_high}
                        if f.leverage_low is not None
                        else {}
                    ),
                }
                for f in engine_output.flags
            ],
            "heritage_status": heritage.status,
            "flood_zone": flood.in_flood_zone,
            "development_applications_500m": development.application_count_500m,
            "development_intensity": development.intensity,
            "mortgage_scenarios": [
                {"scenario": s.scenario, "total_cost": s.total_cost}
                for s in engine_output.scenarios
            ],
        }

        if monte_carlo is not None:
            context["monte_carlo_simulation"] = {
                "trajectories": monte_carlo.trajectories_sampled,
                "p10": monte_carlo.p10,
                "p50": monte_carlo.p50,
                "p90": monte_carlo.p90,
                "mean": monte_carlo.mean,
            }

        if horizons:
            context["horizon_simulations"] = {
                h: {"p10": r.p10, "p50": r.p50, "p90": r.p90} for h, r in horizons.items()
            }

        if profile:
            buyer_situation = {k: v for k, v in profile.items() if v not in (None, "")}
            if buyer_situation:
                context["buyer_situation"] = buyer_situation

        model = self.settings.nim_model

        payload = {
            "model": model,
            "messages": [
                {"role": "system", "content": _SYSTEM_PROMPT},
                {"role": "user", "content": json.dumps(context)},
            ],
            "max_tokens": 650,
            "temperature": 0.3,
            "stream": False,
            "response_format": {"type": "json_object"},
            # Nemotron-3 Nano is a reasoning model; disable thinking so `content`
            # is the final answer, not the chain-of-thought.
            "chat_template_kwargs": {"enable_thinking": False},
        }

        # Local-only: the on-device Nemotron LLM (vLLM on :8080). No hosted fallback.
        async with httpx.AsyncClient(timeout=self.settings.nim_timeout_seconds) as client:
            resp = await client.post(
                f"{self.settings.nim_local_url}/chat/completions",
                json=payload,
            )
            resp.raise_for_status()
            content = resp.json()["choices"][0]["message"]["content"].strip()

        return self._parse(content)

    @staticmethod
    def _parse(content: str) -> SynthesisResult:
        """Parse the model's JSON object; tolerate stray prose around it."""
        try:
            start = content.index("{")
            end = content.rindex("}") + 1
            data = json.loads(content[start:end])
        except (ValueError, json.JSONDecodeError):
            # Not JSON — treat the whole thing as the summary narrative.
            return SynthesisResult(summary=content or None)

        def _clean(v: object) -> str | None:
            return v.strip() if isinstance(v, str) and v.strip() else None

        return SynthesisResult(
            summary=_clean(data.get("summary")),
            intake_reasoning=_clean(data.get("intake_reasoning")),
            synthesis_reasoning=_clean(data.get("synthesis_reasoning")),
        )
