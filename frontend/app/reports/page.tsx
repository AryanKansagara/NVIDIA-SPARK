"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { RotateCcw, Trash2, ChevronRight, BarChart3 } from "lucide-react";
import { listReports, type SavedReportSummary } from "@/lib/api";

const cad = (v: number | null) =>
  v == null
    ? "—"
    : new Intl.NumberFormat("en-CA", { style: "currency", currency: "CAD", maximumFractionDigits: 0 }).format(v);

const PROFILE_LABEL: Record<string, string> = {
  first_time: "First-time buyer",
  investor: "Investor",
};

async function deleteReport(id: string) {
  await fetch(`/api/v1/reports/${id}`, { method: "DELETE" });
}

export default function ReportsPage() {
  const router = useRouter();
  const [reports, setReports] = useState<SavedReportSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState<string | null>(null);

  useEffect(() => {
    listReports()
      .then(setReports)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  async function handleDelete(e: React.MouseEvent, id: string) {
    e.stopPropagation();
    setDeleting(id);
    try {
      await deleteReport(id);
      setReports((prev) => prev.filter((r) => r.report_id !== id));
    } catch {
      /* ignore */
    } finally {
      setDeleting(null);
    }
  }

  function handleReanalyze(e: React.MouseEvent, r: SavedReportSummary) {
    e.stopPropagation();
    const params = new URLSearchParams();
    if (r.address) params.set("address", r.address);
    if (r.list_price) params.set("price", String(r.list_price));
    if (r.buyer_profile) params.set("profile", r.buyer_profile);
    router.push(`/analyze?${params.toString()}`);
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      {/* Header */}
      <div className="space-y-2">
        <span className="inline-flex items-center gap-1.5 rounded-pill border border-[color:var(--border-faint)] px-3 py-1 text-[11px] font-medium uppercase tracking-[0.12em] text-[color:var(--text-muted)]">
          <BarChart3 className="h-3 w-3" /> Saved
        </span>
        <h1 className="font-display text-3xl font-medium tracking-tight text-[color:var(--text-primary)]">
          Saved reports
        </h1>
        <p className="text-sm text-[color:var(--text-secondary)]">
          All reports are stored on-device in DuckDB — nothing leaves your device.
        </p>
      </div>

      {loading ? (
        <div className="space-y-2">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-20 animate-shimmer rounded-xl border border-[color:var(--border-faint)]" />
          ))}
        </div>
      ) : reports.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-xl border border-[color:var(--border-faint)] bg-[color:var(--surface)] py-16 text-center">
          <BarChart3 className="h-8 w-8 text-[color:var(--text-muted)]" />
          <p className="text-sm text-[color:var(--text-muted)]">No saved reports yet.</p>
          <button
            onClick={() => router.push("/analyze")}
            className="mt-1 rounded-pill border border-[color:var(--border)] px-4 py-2 text-sm text-[color:var(--text-secondary)] hover:text-[color:var(--text-primary)]"
          >
            Analyze a property
          </button>
        </div>
      ) : (
        <div className="space-y-2">
          {reports.map((r) => (
            <div
              key={r.report_id}
              className="group relative flex cursor-pointer items-center gap-4 rounded-xl border border-[color:var(--border-faint)] bg-[color:var(--surface)] px-5 py-4 transition-all hover:border-[color:var(--border)] hover:shadow-sm"
              onClick={() => handleReanalyze({ stopPropagation: () => {} } as React.MouseEvent, r)}
            >
              {/* left accent */}
              <div className="h-12 w-1 shrink-0 rounded-full bg-[color:var(--accent)] opacity-60" />

              <div className="min-w-0 flex-1">
                <p className="truncate font-medium text-[color:var(--text-primary)]">
                  {r.address ?? "Unknown address"}
                </p>
                <p className="mt-0.5 text-xs text-[color:var(--text-muted)]">
                  {PROFILE_LABEL[r.buyer_profile ?? ""] ?? r.buyer_profile} ·{" "}
                  list {cad(r.list_price)} ·{" "}
                  {r.created_at.slice(0, 16).replace("T", " at ")}
                </p>
              </div>

              <div className="shrink-0 text-right">
                <p className="font-mono text-lg font-semibold text-[color:var(--text-primary)]">
                  {cad(r.true_10y_cost)}
                </p>
                <p className="text-[10px] text-[color:var(--text-muted)]">true 10y cost</p>
              </div>

              {/* action buttons — appear on hover */}
              <div className="flex shrink-0 items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                <button
                  onClick={(e) => handleReanalyze(e, r)}
                  title="Re-analyze"
                  className="flex h-8 w-8 items-center justify-center rounded-full border border-[color:var(--border-faint)] bg-[color:var(--surface-raised)] text-[color:var(--text-muted)] transition-colors hover:border-[color:var(--accent)] hover:text-[color:var(--accent)]"
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                </button>
                <button
                  onClick={(e) => handleDelete(e, r.report_id)}
                  title="Delete"
                  disabled={deleting === r.report_id}
                  className="flex h-8 w-8 items-center justify-center rounded-full border border-[color:var(--border-faint)] bg-[color:var(--surface-raised)] text-[color:var(--text-muted)] transition-colors hover:border-[rgba(248,113,113,0.5)] hover:text-[color:var(--red)] disabled:opacity-50"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
                <ChevronRight className="h-4 w-4 text-[color:var(--text-muted)]" />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
