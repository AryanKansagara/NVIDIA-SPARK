"use client";

import type { Confidence, CostRow } from "@/lib/report";

function fmtCad(value: number) {
  const abs = new Intl.NumberFormat("en-CA", {
    style: "currency",
    currency: "CAD",
    maximumFractionDigits: 0,
  }).format(Math.abs(value));
  return value < 0 ? `-${abs}` : abs;
}

const confTone: Record<Confidence, string> = {
  High: "bg-[color:var(--green-tint)] text-[color:var(--green)] border-[rgba(52,211,153,0.2)]",
  Medium: "bg-[color:var(--amber-tint)] text-[color:var(--amber)] border-[rgba(251,191,36,0.2)]",
  Low: "bg-[color:var(--red-tint)] text-[color:var(--red)] border-[rgba(248,113,113,0.2)]",
};

export function CostBreakdownTable({ rows, horizon }: { rows: CostRow[]; horizon: number }) {
  if (!rows || rows.length === 0) return null;
  const total = rows.reduce((sum, r) => sum + r.total, 0);

  return (
    <div className="overflow-hidden rounded-lg border border-[color:var(--border)] bg-[color:var(--surface)]">
      <table className="w-full border-collapse text-left">
        <thead>
          <tr className="border-b border-[color:var(--border-faint)] text-[10px] uppercase tracking-[0.12em] text-[color:var(--text-muted)]">
            <th className="px-5 py-3.5 font-medium">Category</th>
            <th className="px-5 py-3.5 text-right font-medium">Annual</th>
            <th className="px-5 py-3.5 text-right font-medium">{horizon}-year total</th>
            <th className="px-5 py-3.5 text-right font-medium">Confidence</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.key} className="border-b border-[color:var(--border-faint)] last:border-0">
              <td className="px-5 py-4 text-[14px] text-[color:var(--text-primary)]">{row.label}</td>
              <td className="px-5 py-4 text-right font-mono text-[13px] text-[color:var(--text-secondary)]">
                {row.oneTime || row.annual == null ? "—" : fmtCad(row.annual)}
              </td>
              <td
                className={`px-5 py-4 text-right font-mono text-[13px] ${
                  row.isCredit ? "text-[color:var(--green)]" : "text-[color:var(--text-primary)]"
                }`}
              >
                {fmtCad(row.total)}
              </td>
              <td className="px-5 py-4 text-right">
                <span
                  className={`inline-flex items-center gap-1.5 rounded-pill border px-2 py-0.5 text-[10px] font-medium ${confTone[row.confidence]}`}
                >
                  <span className="h-[4px] w-[4px] rounded-full bg-current" />
                  {row.confidence}
                </span>
              </td>
            </tr>
          ))}
          <tr className="bg-[color:var(--surface-raised)]">
            <td className="px-5 py-4 text-[14px] font-semibold text-[color:var(--text-primary)]">
              True {horizon}-year cost of ownership
            </td>
            <td className="px-5 py-4" />
            <td className="px-5 py-4 text-right font-mono text-[15px] font-semibold text-[color:var(--accent)]">
              {fmtCad(total)}
            </td>
            <td className="px-5 py-4" />
          </tr>
        </tbody>
      </table>
    </div>
  );
}
