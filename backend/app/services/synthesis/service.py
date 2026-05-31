import json

import httpx

from app.core.config import Settings
from app.schemas.report import MonteCarloResult
from app.services.data_sources.models import DevelopmentEvidence, FloodEvidence, HeritageEvidence
from app.services.engine.report_engine import EngineOutput

_SYSTEM_PROMPT = """\
You are Meridian's synthesis agent. You receive JSON about a Toronto property's true 10-year cost of ownership. Write a 3-paragraph buyer summary — direct, factual, no financial advice.

Paragraph 1 (verdict): State the true 10-year cost, how far above list price that is as a percentage, and the single most important risk flag. If Monte Carlo simulation data is provided, state the 10-year P10/P90 range: "Across 10,000 simulations, outcomes range from $P10 to $P90." If 5-year and 15-year horizons are provided, note how the cost grows across the 5/10/15-year horizons.
Paragraph 2 (cost drivers): Explain the 2 largest costs beyond the mortgage in plain English, using the exact dollar figures provided.
Paragraph 3 (action): Give 2 specific steps this buyer should take before closing, based on their profile and the flags present. If relevant land-law excerpts are provided, reference specific legal obligations the buyer should be aware of.

Rules: use only numbers from the input. No jargon, no methodology, no mention of data sources. Max 300 words total.\
"""


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
    ) -> str | None:
        if not self.settings.nim_enabled:
            return None
        try:
            return await self._call_nim(
                address, list_price, buyer_profile, engine_output, heritage, flood, development,
                law_context or [], monte_carlo, horizons or {}, profile or {},
            )
        except Exception as exc:
            import logging
            logging.getLogger(__name__).error("NIM synthesis failed: %s", exc, exc_info=True)
            return None

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
    ) -> str:
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
                {"severity": f.severity, "title": f.title, "message": f.message}
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
            "max_tokens": 450,
            "temperature": 0.3,
            "stream": False,
            # Nemotron-3 Nano is a reasoning model; disable thinking so `content`
            # is the final narrative, not the chain-of-thought.
            "chat_template_kwargs": {"enable_thinking": False},
        }

        # Local-only: the on-device Nemotron LLM (vLLM on :8080). No hosted fallback.
        async with httpx.AsyncClient(timeout=self.settings.nim_timeout_seconds) as client:
            resp = await client.post(
                f"{self.settings.nim_local_url}/chat/completions",
                json=payload,
            )
            resp.raise_for_status()
            return resp.json()["choices"][0]["message"]["content"].strip()
