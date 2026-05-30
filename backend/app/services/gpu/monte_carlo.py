"""Monte Carlo 10-year cost simulator — CuPy GPU path with numpy fallback.

Runs ~10,000 trajectories and returns P10/P50/P90 distribution.
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

YEARS = 10


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
        base_cost: int,
        property_tax_base: float,
        flood_zone: bool,
        dev_density_score: float,  # 0–1 derived from application count
        assessed_value: float,
        base_tax_rate: float = 0.00767311,
        tax_growth_base: float = 0.03,
    ) -> MonteCarloResult:
        return await asyncio.to_thread(
            self._simulate,
            base_cost,
            property_tax_base,
            flood_zone,
            dev_density_score,
            assessed_value,
            base_tax_rate,
            tax_growth_base,
        )

    def _simulate(
        self,
        base_cost: int,
        property_tax_base: float,
        flood_zone: bool,
        dev_density_score: float,
        assessed_value: float,
        base_tax_rate: float,
        tax_growth_base: float,
    ) -> MonteCarloResult:
        t0 = time.perf_counter()
        xp = cp if self.use_gpu else np
        n = self.n_sims

        # ---- Property tax trajectories ----
        # annual growth = base + N(0,0.005) + dev_density upward bias
        tax_growth = (
            tax_growth_base
            + xp.random.normal(0, 0.005, (n, YEARS))
            + 0.002 * dev_density_score
        )
        tax_growth = xp.clip(tax_growth, 0.0, 0.12)
        # assessed value grows with the trajectory
        av = assessed_value
        tax_trajectories = xp.zeros((n, YEARS))
        av_sim = xp.full(n, av)
        for yr in range(YEARS):
            av_sim = av_sim * (1 + tax_growth[:, yr])
            tax_trajectories[:, yr] = av_sim * base_tax_rate

        prop_tax_total = tax_trajectories.sum(axis=1)

        # ---- Maintenance / reserve fund ----
        maintenance = xp.random.normal(8_000, 2_000, (n, YEARS)).clip(2_000, 25_000)
        maintenance_total = maintenance.sum(axis=1)

        # ---- Insurance ----
        insurance_base = 3_500 + (1_000 if flood_zone else 0)
        insurance = xp.random.normal(insurance_base, 500, (n, YEARS)).clip(1_000, 15_000)
        insurance_total = insurance.sum(axis=1)

        # ---- Interest-rate shock at year-5 renewal ----
        rate_shock = xp.random.normal(0, 0.15, n)
        interest_shock_cost = xp.maximum(rate_shock, 0) * assessed_value * 0.5  # rough impact

        # ---- Total trajectory (stochastic components only; add deterministic base at end) ----
        total = (
            prop_tax_total
            + maintenance_total
            + insurance_total
            + interest_shock_cost
            + base_cost
        )

        if self.use_gpu:
            total_cpu = total.get()
        else:
            total_cpu = np.asarray(total)

        elapsed_ms = (time.perf_counter() - t0) * 1000

        return MonteCarloResult(
            p10=int(np.percentile(total_cpu, 10)),
            p50=int(np.percentile(total_cpu, 50)),
            p90=int(np.percentile(total_cpu, 90)),
            mean=int(np.mean(total_cpu)),
            n=n,
            elapsed_ms=round(elapsed_ms, 1),
        )
