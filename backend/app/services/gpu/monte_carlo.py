"""Monte Carlo cost simulator — CuPy GPU path with numpy fallback.

Runs ~10,000 trajectories out to 15 years in a single GPU pass, then slices
cumulative outcomes at the 5/10/15-year horizons. Returns a P10/P50/P90
distribution per horizon.
"""
from __future__ import annotations

import asyncio
import logging
import time

import numpy as np

logger = logging.getLogger(__name__)

try:
    import cupy as cp  # type: ignore
    _GPU = True
    logger.info("Monte Carlo GPU enabled (CuPy)")
except ImportError:
    cp = None
    _GPU = False
    logger.info("Monte Carlo GPU unavailable — using numpy fallback")

HORIZONS = (5, 10, 15)
MAX_YEARS = max(HORIZONS)


class MonteCarloResult:
    def __init__(self, p10: int, p50: int, p90: int, mean: int, n: int, elapsed_ms: float) -> None:
        self.p10 = p10
        self.p50 = p50
        self.p90 = p90
        self.mean = mean
        self.trajectories_sampled = n
        self.elapsed_ms = elapsed_ms


class MonteCarloSimulator:
    def __init__(self, n_sims: int = 10_000, gpu_enabled: bool = True) -> None:
        self.n_sims = n_sims
        self.use_gpu = _GPU and gpu_enabled

    async def run(
        self,
        base_costs: dict[int, int],
        flood_zone: bool,
        dev_density_score: float,  # 0–1 derived from application count
        assessed_value: float,
        base_tax_rate: float = 0.00767311,
        tax_growth_base: float = 0.03,
    ) -> dict[str, MonteCarloResult]:
        """base_costs maps horizon (5/10/15) → deterministic engine total for that horizon."""
        return await asyncio.to_thread(
            self._simulate,
            base_costs,
            flood_zone,
            dev_density_score,
            assessed_value,
            base_tax_rate,
            tax_growth_base,
        )

    def _simulate(
        self,
        base_costs: dict[int, int],
        flood_zone: bool,
        dev_density_score: float,
        assessed_value: float,
        base_tax_rate: float,
        tax_growth_base: float,
    ) -> dict[str, MonteCarloResult]:
        t0 = time.perf_counter()
        xp = cp if self.use_gpu else np
        n = self.n_sims

        # ---- Property tax trajectories (per year, out to MAX_YEARS) ----
        tax_growth = (
            tax_growth_base
            + xp.random.normal(0, 0.005, (n, MAX_YEARS))
            + 0.002 * dev_density_score
        )
        tax_growth = xp.clip(tax_growth, 0.0, 0.12)
        tax_per_year = xp.zeros((n, MAX_YEARS))
        av_sim = xp.full(n, assessed_value)
        for yr in range(MAX_YEARS):
            av_sim = av_sim * (1 + tax_growth[:, yr])
            tax_per_year[:, yr] = av_sim * base_tax_rate

        # ---- Maintenance / reserve fund (per year) ----
        maintenance = xp.random.normal(8_000, 2_000, (n, MAX_YEARS)).clip(2_000, 25_000)

        # ---- Insurance (per year) ----
        insurance_base = 3_500 + (1_000 if flood_zone else 0)
        insurance = xp.random.normal(insurance_base, 500, (n, MAX_YEARS)).clip(1_000, 15_000)

        # ---- Per-year stochastic costs, cumulative over time ----
        per_year = tax_per_year + maintenance + insurance
        cumulative = xp.cumsum(per_year, axis=1)  # shape (n, MAX_YEARS)

        # ---- Interest-rate shock at the year-5 renewal (applies from year 10+) ----
        rate_shock = xp.random.normal(0, 0.15, n)
        interest_shock_cost = xp.maximum(rate_shock, 0) * assessed_value * 0.5

        results: dict[str, MonteCarloResult] = {}
        for h in HORIZONS:
            stochastic = cumulative[:, h - 1]
            if h >= 10:
                stochastic = stochastic + interest_shock_cost
            total = stochastic + base_costs[h]
            total_cpu = total.get() if self.use_gpu else np.asarray(total)
            results[f"{h}y"] = MonteCarloResult(
                p10=int(np.percentile(total_cpu, 10)),
                p50=int(np.percentile(total_cpu, 50)),
                p90=int(np.percentile(total_cpu, 90)),
                mean=int(np.mean(total_cpu)),
                n=n,
                elapsed_ms=0.0,  # set below (shared across horizons)
            )

        elapsed_ms = round((time.perf_counter() - t0) * 1000, 1)
        for r in results.values():
            r.elapsed_ms = elapsed_ms
        return results
