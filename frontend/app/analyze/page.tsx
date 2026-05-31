"use client";

import dynamic from "next/dynamic";
import { Suspense, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { AlertCircle, RotateCcw } from "lucide-react";
import { AgentsPanel } from "@/components/agents-panel";
import { AgentsWorking } from "@/components/agents-working";
import { Charts } from "@/components/charts";
import { CompositeSignals } from "@/components/composite-signals";
import { CostBreakdownTable } from "@/components/cost-breakdown-table";
import { FlagList } from "@/components/flag-list";
import { InputCard } from "@/components/input-card";
import { SummaryCard } from "@/components/summary-card";
import { EXPORT_PDF_EVENT } from "@/components/top-bar";
import { BUYER_PROFILE_KEY } from "@/components/onboarding-modal";
import { fetchReport, saveReport } from "@/lib/api";
import { useApp } from "@/lib/app-context";
import {
  defaultFormState,
  HORIZONS,
  type BuyerProfile,
  type MeridianFormState,
  type MeridianReport,
} from "@/lib/report";
import { cn } from "@/lib/utils";

const PropertyMap = dynamic(
  () => import("@/components/property-map").then((m) => ({ default: m.PropertyMap })),
  { ssr: false },
);

type Screen = "input" | "working" | "verdict";

function seededDefaults(searchParams: URLSearchParams | null): MeridianFormState {
  const base = defaultFormState();
  if (typeof window !== "undefined") {
    const saved = localStorage.getItem(BUYER_PROFILE_KEY) as BuyerProfile | null;
    if (saved === "first_time" || saved === "investor") base.buyerProfile = saved;
  }
  if (searchParams) {
    const addr = searchParams.get("address");
    const price = searchParams.get("price");
    const profile = searchParams.get("profile") as BuyerProfile | null;
    if (addr) base.address = addr;
    if (price && !isNaN(Number(price))) base.listPrice = Number(price);
    if (profile === "first_time" || profile === "investor") base.buyerProfile = profile;
  }
  return base;
}

function AnalyzePageInner() {
  const searchParams = useSearchParams();
  const { setActiveReport } = useApp();
  const [screen, setScreen] = useState<Screen>("input");
  const [form, setForm] = useState<MeridianFormState>(defaultFormState);
  const [report, setReport] = useState<MeridianReport | null>(null);
  const [workingPhase, setWorkingPhase] = useState<"running" | "done">("running");
  const [error, setError] = useState<string | null>(null);
  const [horizon, setHorizon] = useState(10);
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const reportRef = useRef<HTMLDivElement>(null);

  // Seed form from onboarding + URL query params (for re-analyze from saved reports).
  useEffect(() => setForm(seededDefaults(searchParams)), [searchParams]);

  // PDF export — listens for the TopBar event and renders the report region to a
  // downloadable PDF. html2canvas captures on-screen styles (it ignores @media
  // print), so we flip the page into a light "pdf-export" theme for the duration
  // of the capture and skip interactive-only elements (controls + the Leaflet map,
  // which html2canvas can't rasterize). The saved file lands in the browser's
  // download folder on the user's local drive.
  useEffect(() => {
    async function onExport() {
      if (!reportRef.current || !report) return;
      const slug = report.inputs.address.split(",")[0].replace(/\s+/g, "-").toLowerCase() || "report";
      const html2pdf = (await import("html2pdf.js")).default;
      const root = document.documentElement;
      root.classList.add("pdf-export");
      // `pagebreak` is a valid html2pdf option but missing from the bundled types.
      const opts = {
        margin: [10, 10, 12, 10],
        filename: `meridian-${slug}.pdf`,
        image: { type: "jpeg", quality: 0.98 },
        html2canvas: {
          scale: 2,
          backgroundColor: "#ffffff",
          useCORS: true,
          logging: false,
          // Drop screen-only controls + anything html2canvas can't render
          // (the interactive map tiles) so the PDF has no blank blocks.
          ignoreElements: (el: Element) =>
            el.classList?.contains("no-print") ||
            el.classList?.contains("leaflet-container") ||
            !!el.closest?.(".leaflet-container"),
        },
        jsPDF: { unit: "mm", format: "a4", orientation: "portrait" },
        pagebreak: { mode: ["css", "legacy"], avoid: ".print-block" },
      };
      try {
        await html2pdf()
          .set(opts as Parameters<ReturnType<typeof html2pdf>["set"]>[0])
          .from(reportRef.current)
          .save();
      } catch (err) {
        console.error("PDF export failed:", err);
      } finally {
        root.classList.remove("pdf-export");
      }
    }
    window.addEventListener(EXPORT_PDF_EVENT, onExport);
    return () => window.removeEventListener(EXPORT_PDF_EVENT, onExport);
  }, [report]);

  async function runAnalysis(inputs: MeridianFormState) {
    setForm(inputs);
    setError(null);
    setSaveStatus("idle");
    setWorkingPhase("running");
    setScreen("working");

    // Real pipeline only. The animation is a progress indicator over this call;
    // there is no preview/mock fallback — failures surface as an error screen.
    const startedAt = Date.now();
    try {
      const real = await fetchReport(inputs);
      // Keep the working animation visible briefly so all four steps register.
      const minMs = 1800;
      const elapsed = Date.now() - startedAt;
      if (elapsed < minMs) await new Promise((r) => setTimeout(r, minMs - elapsed));
      setReport(real);
      setActiveReport(real);
      setWorkingPhase("done");
      setTimeout(() => setScreen("verdict"), 650);
    } catch (e) {
      setError(e instanceof Error ? e.message : "The analysis pipeline is unavailable.");
      setScreen("input");
    }
  }

  async function handleSave() {
    if (!report) return;
    setSaveStatus("saving");
    try {
      await saveReport(report);
      setSaveStatus("saved");
      setTimeout(() => setSaveStatus("idle"), 2500);
    } catch {
      setSaveStatus("error");
    }
  }

  if (screen === "working") {
    return <AgentsWorking address={form.address} phase={workingPhase} trace={report?.pipelineTrace} />;
  }

  if (screen === "input" || !report) {
    const isAddressError = error
      ? error.includes("No geocoding result") || error.includes("Invalid address") || error.includes("400")
      : false;

    return (
      <div className="py-4 md:py-8 flex flex-col items-center justify-center min-h-[calc(100vh-160px)] w-full">
        {error && !isAddressError && (
          <div className="mx-auto mb-6 flex w-full max-w-5xl items-start gap-3 rounded-md border border-[rgba(248,113,113,0.3)] bg-[color:var(--red-tint)] px-4 py-3 text-sm text-[color:var(--red)]">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <div>
              <p className="font-medium">Analysis couldn&apos;t complete</p>
              <p className="mt-0.5 text-[color:var(--text-secondary)]">{error}</p>
              <p className="mt-1 text-xs text-[color:var(--text-muted)]">
                Meridian only shows real pipeline output — start the backend and try again.
              </p>
            </div>
          </div>
        )}
        <InputCard
          initialValues={form}
          onSubmit={runAnalysis}
          error={isAddressError ? error : null}
        />
      </div>
    );
  }

  // ── Verdict screen ──
  const horizonKey = `${horizon}y`;
  const selectedMc = report.monteCarloHorizons[horizonKey] ?? report.monteCarlo;
  const selectedRows = report.costRowsByHorizon[horizonKey] ?? [];

  return (
    <div className="animate-fade-in space-y-3">
      <div ref={reportRef} className="space-y-3">
        <div className="print-block">
          <SummaryCard
            report={report}
            horizon={horizon}
            onSave={handleSave}
            saveStatus={saveStatus}
          />
        </div>

        <div className="no-print flex items-center gap-2 px-1 pt-2">
          <span className="text-[11px] font-medium uppercase tracking-[0.14em] text-[color:var(--text-muted)]">
            Horizon
          </span>
          {HORIZONS.map((h) => (
            <button
              key={h}
              onClick={() => setHorizon(h)}
              className={cn(
                "rounded-pill px-4 py-1.5 text-sm font-medium transition-colors",
                horizon === h
                  ? "bg-[color:var(--accent)] text-white"
                  : "border border-[color:var(--border-faint)] text-[color:var(--text-muted)] hover:border-[color:var(--border)]",
              )}
            >
              {h}-year
            </button>
          ))}
        </div>

        <div className="print-block space-y-3">
          <SectionLabel>Risk flags</SectionLabel>
          <FlagList flags={report.flags} />
        </div>

        {report.compositeSignals.length > 0 && (
          <div className="print-block space-y-3">
            <SectionLabel>Composite signals</SectionLabel>
            <CompositeSignals signals={report.compositeSignals} />
          </div>
        )}

        <div className="print-block space-y-3">
          <SectionLabel>Cost breakdown &amp; projections ({horizon}-year)</SectionLabel>
          <div className="grid gap-3 lg:grid-cols-2">
            {selectedRows.length > 0 && <CostBreakdownTable rows={selectedRows} horizon={horizon} />}
            <Charts
              components={report.components}
              scenarios={report.scenarios}
              monteCarlo={selectedMc}
              listPrice={report.inputs.listPrice}
              horizon={horizon}
            />
          </div>
        </div>

        <div className="print-block space-y-3">
          <SectionLabel>Agent reasoning</SectionLabel>
          <AgentsPanel trace={report.pipelineTrace} reasoning={report.agentReasoning} />
        </div>

        {report.mapGeometry && (
          <div className="no-print space-y-3">
            <SectionLabel>Property map</SectionLabel>
            <PropertyMap geometry={report.mapGeometry} address={report.inputs.address} />
          </div>
        )}
      </div>

      <div className="no-print flex justify-center pt-4">
        <button
          onClick={() => {
            setScreen("input");
            setReport(null);
          }}
          className="flex items-center gap-2 rounded-pill border border-[color:var(--border)] px-5 py-2.5 text-sm font-medium text-[color:var(--text-secondary)] transition-colors hover:text-[color:var(--text-primary)]"
        >
          <RotateCcw className="h-4 w-4" /> New analysis
        </button>
      </div>
    </div>
  );
}

export default function AnalyzePage() {
  return (
    <Suspense>
      <AnalyzePageInner />
    </Suspense>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3 pt-6">
      <span className="whitespace-nowrap text-[11px] font-medium uppercase tracking-[0.1em] text-[color:var(--text-muted)]">
        {children}
      </span>
      <span className="h-px flex-1 bg-[color:var(--border-faint)]" />
    </div>
  );
}
