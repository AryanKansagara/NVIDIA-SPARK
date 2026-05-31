"use client";

import { useEffect, useState } from "react";
import { Panel } from "@/components/ui/panel";
import { Pill } from "@/components/ui/pill";
import { listReports, type SavedReportSummary } from "@/lib/api";

function currency(value: number | null) {
  if (value == null) return "—";
  return new Intl.NumberFormat("en-CA", {
    style: "currency",
    currency: "CAD",
    maximumFractionDigits: 0,
  }).format(value);
}

export default function ReportsPage() {
  const [reports, setReports] = useState<SavedReportSummary[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    listReports()
      .then(setReports)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="mx-auto max-w-3xl">
      <Panel>
        <div className="space-y-5">
          <div className="space-y-2">
            <Pill tone="yellow">Saved</Pill>
            <h1 className="font-display text-3xl text-ink">Saved reports</h1>
            <p className="text-sm text-slate">Reports you saved are stored on-device in DuckDB.</p>
          </div>

          {loading ? (
            <p className="text-sm text-slate">Loading…</p>
          ) : reports.length === 0 ? (
            <p className="text-sm text-slate">No saved reports yet. Generate one and hit “Save report”.</p>
          ) : (
            <div className="flex flex-col gap-3">
              {reports.map((r) => (
                <div
                  key={r.report_id}
                  className="flex items-center justify-between rounded-2xl border border-[#D7E7E2] bg-[#F7FAF8] px-4 py-3"
                >
                  <div>
                    <p className="font-semibold text-ink">{r.address ?? "Unknown address"}</p>
                    <p className="text-xs text-slate">
                      {r.buyer_profile} · list {currency(r.list_price)} · {r.created_at.slice(0, 16)}
                    </p>
                  </div>
                  <p className="font-display text-xl text-ink">{currency(r.true_10y_cost)}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      </Panel>
    </div>
  );
}
