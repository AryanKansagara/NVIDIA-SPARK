"use client";

import { Panel } from "@/components/ui/panel";
import { MonteCarloChart } from "@/components/monte-carlo-chart";
import type { BreakdownPoint, MonteCarloDistribution, ScenarioPoint } from "@/lib/report";

const CAD = new Intl.NumberFormat("en-CA", {
  style: "currency",
  currency: "CAD",
  maximumFractionDigits: 0,
});

type ChartsProps = {
  components: BreakdownPoint[];
  scenarios: ScenarioPoint[];
  monteCarlo?: MonteCarloDistribution | null;
  listPrice?: number;
  horizon?: number;
};

// Map engine fills to palette colours + labels for the composition bars.
const COMPONENT_META: Record<string, { color: string; label: string }> = {
  "#10212B": { color: "var(--text-primary)", label: "Mortgage" },
  "#B99239": { color: "var(--amber)", label: "Property Tax" },
  "#E16B47": { color: "var(--red)", label: "LTT (net)" },
  "#8C5B4A": { color: "var(--text-muted)", label: "Risk Loadings" },
  "#2B6A57": { color: "var(--green)", label: "Transit" },
};

function CostCompositionBars({ components }: { components: BreakdownPoint[] }) {
  const items = (components ?? []).map((c) => ({
    label: COMPONENT_META[c.fill]?.label ?? c.label,
    color: COMPONENT_META[c.fill]?.color ?? "var(--accent)",
    value: c.value,
  }));
  const maxAbs = Math.max(...items.map((i) => Math.abs(i.value)), 1);

  return (
    <div className="flex flex-col gap-3">
      {items.map((item) => (
        <div key={item.label} className="flex items-center gap-3">
          <span className="w-28 shrink-0 text-xs text-[color:var(--text-muted)]">{item.label}</span>
          <div className="relative h-2.5 flex-1 overflow-hidden rounded-full bg-[color:var(--surface-raised)]">
            <div
              className="h-full rounded-full"
              style={{
                width: `${(Math.abs(item.value) / maxAbs) * 100}%`,
                backgroundColor: item.color,
              }}
            />
          </div>
          <span
            className="w-24 shrink-0 text-right font-mono text-xs font-semibold"
            style={{ color: item.color }}
          >
            {item.value < 0 ? `-${CAD.format(Math.abs(item.value))}` : CAD.format(item.value)}
          </span>
        </div>
      ))}
    </div>
  );
}

export function Charts({ components, scenarios, monteCarlo = null, listPrice = 0, horizon = 10 }: ChartsProps) {
  return (
    <div className="flex flex-col gap-3">
      <Panel>
        <p className="text-[11px] font-medium uppercase tracking-[0.1em] text-[color:var(--text-muted)]">
          Mortgage Scenario Ladder ({horizon}YR)
        </p>
        <div className="mt-4">
          <MonteCarloChart distribution={monteCarlo} scenarios={scenarios} listPrice={listPrice} />
        </div>
      </Panel>
      <Panel>
        <p className="text-[11px] font-medium uppercase tracking-[0.1em] text-[color:var(--text-muted)]">
          Cost Composition
        </p>
        <div className="mt-4">
          <CostCompositionBars components={components} />
        </div>
      </Panel>
    </div>
  );
}
