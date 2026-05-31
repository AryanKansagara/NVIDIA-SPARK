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
  if (!distribution) return <ScenarioLadder scenarios={scenarios} />;

  const range = distribution.p90 - distribution.p10;
  const pct = (v: number) => Math.round(((v - listPrice) / listPrice) * 100);

  const bands = [
    { label: "P90 (high)", value: distribution.p90, color: "var(--red)", width: 100 },
    { label: "P50 (median)", value: distribution.p50, color: "var(--amber)", width: 72 },
    { label: "P10 (low)", value: distribution.p10, color: "var(--green)", width: 48 },
  ];

  return (
    <div className="flex flex-col gap-4">
      <p className="font-mono text-[11px] text-[color:var(--text-muted)]">
        {distribution.trajectoriesSampled.toLocaleString()} simulations
        {distribution.elapsedMs ? ` · ${distribution.elapsedMs.toFixed(0)} ms` : ""}
      </p>
      <div className="flex flex-col gap-3">
        {bands.map((b) => (
          <div key={b.label} className="flex flex-col gap-1">
            <div className="flex items-baseline justify-between">
              <span className="text-xs text-[color:var(--text-muted)]">{b.label}</span>
              <span className="text-sm font-semibold text-[color:var(--text-primary)]">
                {CAD.format(b.value)}
                <span className="ml-1 text-xs font-normal text-[color:var(--text-muted)]">
                  {pct(b.value) >= 0 ? "+" : ""}
                  {pct(b.value)}%
                </span>
              </span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-[color:var(--surface-raised)]">
              <div
                className="h-full rounded-full transition-all duration-700"
                style={{ width: `${b.width}%`, backgroundColor: b.color }}
              />
            </div>
          </div>
        ))}
      </div>
      <div className="rounded-md border border-[color:var(--border-faint)] bg-[color:var(--surface-frosted)] p-3">
        <p className="text-[11px] leading-relaxed text-[color:var(--text-secondary)]">
          P10–P90 spread:{" "}
          <span className="font-semibold text-[color:var(--text-primary)]">{CAD.format(range)}</span>.
          Drivers include property-tax growth, reserve needs, insurance, and rate-renewal sensitivity.
        </p>
      </div>
    </div>
  );
}

function ScenarioLadder({ scenarios }: { scenarios: ScenarioPoint[] }) {
  const widths: Record<string, number> = { Bull: 72, Base: 84, Bear: 96 };
  const colors: Record<string, string> = { Bull: "var(--green)", Base: "var(--amber)", Bear: "var(--red)" };
  return (
    <div className="flex flex-col gap-3">
      {scenarios.map((s) => (
        <div
          key={s.scenario}
          className="flex flex-col gap-1 rounded-md border border-[color:var(--border-faint)] p-3"
        >
          <div className="flex items-baseline justify-between">
            <span className="text-xs text-[color:var(--text-muted)]">{s.scenario}</span>
            <span className="text-sm font-semibold text-[color:var(--text-primary)]">
              {CAD.format(s.cost)}
            </span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-[color:var(--surface-raised)]">
            <div
              className="h-full rounded-full"
              style={{ width: `${widths[s.scenario]}%`, backgroundColor: colors[s.scenario] }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}
