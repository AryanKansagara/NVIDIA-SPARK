"use client";

import { motion } from "framer-motion";
import { EASE } from "@/lib/motion";
import { Pill } from "@/components/ui/pill";
import { currency } from "@/lib/format";
import type { MeridianReport, ScenarioPoint } from "@/lib/report";

type CostBreakdownProps = {
  report: MeridianReport;
};

const SCENARIO_COLOR: Record<ScenarioPoint["scenario"], string> = {
  Bear: "var(--red)",
  Base: "var(--amber)",
  Bull: "var(--green)",
};
const SCENARIO_NOTE: Record<ScenarioPoint["scenario"], string> = {
  Bear: "Bear +1.5%",
  Base: "Base",
  Bull: "Bull −0.5%",
};

function Bar({
  label,
  value,
  pct,
  color,
  delay,
  green,
}: {
  label: string;
  value: number;
  pct: number;
  color: string;
  delay: number;
  green?: boolean;
}) {
  return (
    <div className="flex items-center gap-3">
      <span className="w-[88px] shrink-0 text-right text-[11px] font-medium text-secondary">
        {label}
      </span>
      <div className="h-[18px] flex-1 overflow-hidden rounded-[4px] bg-[var(--surface-frosted)]">
        <motion.div
          className="h-full rounded-[4px]"
          style={{ background: color }}
          initial={{ width: 0 }}
          animate={{ width: `${pct}%` }}
          transition={{ duration: 0.6, delay, ease: EASE }}
        />
      </div>
      <span
        className={`font-mono w-16 shrink-0 text-[11px] font-medium ${green ? "text-green" : "text-muted"}`}
      >
        {value < 0 ? "−" : ""}
        {currency(Math.abs(value))}
      </span>
    </div>
  );
}

export function CostBreakdown({ report }: CostBreakdownProps) {
  const { costRows, totalTenYear, scenarios, components } = report;

  // Scenario ladder: show Bear → Base → Bull (descending cost like the prototype).
  const ladder = [...scenarios].sort((a, b) => b.cost - a.cost);
  const maxScenario = Math.max(...ladder.map((s) => Math.abs(s.cost)), 1);
  const maxComponent = Math.max(...components.map((c) => Math.abs(c.value)), 1);

  return (
    <div className="grid gap-3 lg:grid-cols-2">
      {/* Cost table */}
      <div className="frosted overflow-hidden rounded-lg border border-line bg-surface">
        <table className="w-full border-collapse">
          <thead>
            <tr className="border-b border-line-faint bg-surface-raised text-left">
              <th className="px-5 py-3 text-[11px] font-medium uppercase tracking-[0.09em] text-muted">
                Category
              </th>
              <th className="px-5 py-3 text-right text-[11px] font-medium uppercase tracking-[0.09em] text-muted">
                Annual
              </th>
              <th className="px-5 py-3 text-right text-[11px] font-medium uppercase tracking-[0.09em] text-muted">
                10-Year
              </th>
              <th className="px-5 py-3 text-right text-[11px] font-medium uppercase tracking-[0.09em] text-muted">
                Conf.
              </th>
            </tr>
          </thead>
          <tbody>
            {costRows.map((row) => (
              <tr
                key={row.label}
                className="border-b border-line-faint transition-colors last:border-0 hover:bg-[var(--surface-frosted)]"
              >
                <td className="px-5 py-3.5 text-sm font-medium text-primary">
                  {row.label}
                </td>
                <td className="font-mono px-5 py-3.5 text-right text-[13px] text-secondary">
                  {row.annual === null ? "—" : currency(row.annual)}
                </td>
                <td
                  className={`font-mono px-5 py-3.5 text-right text-[13px] ${row.tenYear < 0 ? "text-green" : "text-secondary"}`}
                >
                  {row.tenYear < 0 ? "−" : ""}
                  {currency(Math.abs(row.tenYear))}
                </td>
                <td className="px-5 py-3.5 text-right">
                  <Pill tone={row.confidence === "unknown" ? "unknown" : row.confidence}>
                    {row.confidence}
                  </Pill>
                </td>
              </tr>
            ))}
            <tr className="border-t border-line bg-surface-raised">
              <td className="px-5 py-4 text-[15px] font-medium text-primary">
                True 10-year cost of ownership
              </td>
              <td className="px-5 py-4 text-right text-muted">—</td>
              <td className="font-mono px-5 py-4 text-right text-base font-medium text-red">
                {currency(totalTenYear)}
              </td>
              <td />
            </tr>
          </tbody>
        </table>
      </div>

      {/* Dual bar chart */}
      <div className="frosted flex flex-col rounded-lg border border-line bg-surface p-7">
        <p className="text-[11px] font-medium uppercase tracking-[0.09em] text-muted">
          Mortgage scenario ladder (10yr)
        </p>
        <div className="mt-5 flex flex-col gap-3.5">
          {ladder.map((s, i) => (
            <Bar
              key={s.scenario}
              label={SCENARIO_NOTE[s.scenario]}
              value={s.cost}
              pct={(Math.abs(s.cost) / maxScenario) * 100}
              color={SCENARIO_COLOR[s.scenario]}
              delay={i * 0.1}
            />
          ))}
        </div>

        <p className="mt-7 text-[11px] font-medium uppercase tracking-[0.09em] text-muted">
          Cost composition
        </p>
        <div className="mt-5 flex flex-col gap-3.5">
          {components.map((c, i) => (
            <Bar
              key={c.label}
              label={c.label}
              value={c.value}
              pct={(Math.abs(c.value) / maxComponent) * 100}
              color={c.value < 0 ? "var(--green)" : "var(--text-muted)"}
              delay={i * 0.08}
              green={c.value < 0}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
