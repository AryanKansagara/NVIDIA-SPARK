"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Panel } from "@/components/ui/panel";
import { MonteCarloChart } from "@/components/monte-carlo-chart";
import type { BreakdownPoint, MonteCarloDistribution, ScenarioPoint } from "@/lib/report";

function currency(value: number) {
  return new Intl.NumberFormat("en-CA", {
    style: "currency",
    currency: "CAD",
    maximumFractionDigits: 0,
  }).format(value);
}

type ChartsProps = {
  components: BreakdownPoint[];
  scenarios: ScenarioPoint[];
  monteCarlo?: MonteCarloDistribution | null;
  listPrice?: number;
};

export function Charts({ components, scenarios, monteCarlo = null, listPrice = 0 }: ChartsProps) {
  return (
    <div className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
      <Panel>
        <div className="space-y-4">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.2em] text-slate">
              Cost Composition
            </p>
            <h3 className="mt-2 font-display text-3xl text-ink">
              What actually drives the number
            </h3>
          </div>
          <div className="h-80">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={components} margin={{ left: -16, right: 12 }}>
                <CartesianGrid strokeDasharray="4 4" stroke="#d7e7e2" />
                <XAxis dataKey="label" tick={{ fill: "#5D7382", fontSize: 12 }} />
                <YAxis
                  tick={{ fill: "#5D7382", fontSize: 12 }}
                  tickFormatter={(value) => `$${Math.round(value / 1000)}k`}
                />
                <Tooltip formatter={(value: number) => currency(value)} />
                <Bar dataKey="value" radius={[18, 18, 0, 0]}>
                  {components.map((entry) => (
                    <Cell key={entry.label} fill={entry.fill} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </Panel>
      <Panel>
        <div className="space-y-4">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.2em] text-slate">
              {monteCarlo ? "Simulation Results" : "Renewal Risk"}
            </p>
            <h3 className="mt-2 font-display text-3xl text-ink">
              {monteCarlo ? "10,000-trajectory distribution" : "Mortgage scenario ladder"}
            </h3>
          </div>
          <MonteCarloChart
            distribution={monteCarlo}
            scenarios={scenarios}
            listPrice={listPrice}
          />
        </div>
      </Panel>
    </div>
  );
}
