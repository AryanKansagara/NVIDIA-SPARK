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
import type { BreakdownPoint, ScenarioPoint } from "@/lib/report";

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
};

export function Charts({ components, scenarios }: ChartsProps) {
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
              Renewal Risk
            </p>
            <h3 className="mt-2 font-display text-3xl text-ink">
              Mortgage scenario ladder
            </h3>
          </div>
          <div className="space-y-3">
            {scenarios.map((item, index) => (
              <div
                key={item.scenario}
                className="animate-rise rounded-3xl border border-[#D7E7E2] bg-[#F7FAF8] p-4"
                style={{ animationDelay: `${index * 90}ms` }}
              >
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate">
                      {item.scenario}
                    </p>
                    <p className="mt-2 font-display text-3xl text-ink">
                      {currency(item.cost)}
                    </p>
                  </div>
                  <div className="w-28 rounded-full bg-[#DDEEE3] p-1">
                    <div
                      className="h-2 rounded-full bg-moss"
                      style={{
                        width: `${72 + index * 12}%`,
                      }}
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </Panel>
    </div>
  );
}
