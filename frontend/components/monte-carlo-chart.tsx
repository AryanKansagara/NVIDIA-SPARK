"use client";

import type { MonteCarloDistribution, ScenarioPoint } from "@/lib/report";

const CAD = new Intl.NumberFormat("en-CA", {
  style: "currency",
  currency: "CAD",
  maximumFractionDigits: 0,
});

type Props = {
  distribution: MonteCarloDistribution | null;
  scenarios: ScenarioPoint[];
  listPrice: number;
};

export function MonteCarloChart({ distribution, scenarios, listPrice }: Props) {
  if (!distribution) {
    return <_ScenarioLadder scenarios={scenarios} />;
  }

  const range = distribution.p90 - distribution.p10;
  const p10Pct = Math.round(((distribution.p10 - listPrice) / listPrice) * 100);
  const p50Pct = Math.round(((distribution.p50 - listPrice) / listPrice) * 100);
  const p90Pct = Math.round(((distribution.p90 - listPrice) / listPrice) * 100);

  const bands = [
    { label: "P90 (high)", value: distribution.p90, pct: p90Pct, color: "#E16B47", width: 100 },
    { label: "P50 (median)", value: distribution.p50, pct: p50Pct, color: "#B99239", width: 72 },
    { label: "P10 (low)", value: distribution.p10, pct: p10Pct, color: "#2B6A57", width: 48 },
  ];

  return (
    <div className="flex flex-col gap-4">
      <div>
        <p className="text-xs font-semibold text-slate uppercase tracking-wide">
          Monte Carlo distribution
        </p>
        <p className="text-[10px] text-slate/70 mt-0.5">
          {distribution.trajectoriesSampled.toLocaleString()} simulations
          {distribution.elapsedMs ? ` · ${distribution.elapsedMs.toFixed(0)} ms` : ""}
        </p>
      </div>

      <div className="flex flex-col gap-3">
        {bands.map((b) => (
          <div key={b.label} className="flex flex-col gap-1">
            <div className="flex justify-between items-baseline">
              <span className="text-xs text-slate">{b.label}</span>
              <span className="text-sm font-semibold text-ink">
                {CAD.format(b.value)}
                <span className="text-xs font-normal text-slate ml-1">+{b.pct}%</span>
              </span>
            </div>
            <div className="h-2 rounded-full bg-mist overflow-hidden">
              <div
                className="h-full rounded-full transition-all duration-700"
                style={{ width: `${b.width}%`, backgroundColor: b.color }}
              />
            </div>
          </div>
        ))}
      </div>

      <div className="mt-1 p-3 rounded-2xl bg-mist/50 border border-[#C8E0D8]">
        <p className="text-[11px] text-slate leading-relaxed">
          P10–P90 spread:{" "}
          <span className="font-semibold text-ink">{CAD.format(range)}</span>. Drivers include
          property-tax growth variability, reserve-fund needs, insurance, and rate-renewal
          sensitivity.
        </p>
      </div>
    </div>
  );
}

function _ScenarioLadder({ scenarios }: { scenarios: ScenarioPoint[] }) {
  const widths = { Bull: 72, Base: 84, Bear: 96 };
  const colors = { Bull: "#2B6A57", Base: "#B99239", Bear: "#E16B47" };

  return (
    <div className="flex flex-col gap-3">
      {scenarios.map((s) => (
        <div
          key={s.scenario}
          className="flex flex-col gap-1 p-3 rounded-2xl border border-[#E2EDE9] animate-rise"
        >
          <div className="flex justify-between items-baseline">
            <span className="text-xs text-slate">{s.scenario}</span>
            <span className="text-sm font-semibold text-ink">
              {s.cost.toLocaleString("en-CA", {
                style: "currency",
                currency: "CAD",
                maximumFractionDigits: 0,
              })}
            </span>
          </div>
          <div className="h-2 rounded-full bg-mist overflow-hidden">
            <div
              className="h-full rounded-full"
              style={{
                width: `${widths[s.scenario]}%`,
                backgroundColor: colors[s.scenario],
              }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}
