"use client";

import { useState } from "react";
import { Info, Sparkles, Zap } from "lucide-react";
import type { MeridianReport } from "@/lib/report";

type SummaryCardProps = {
  report: MeridianReport;
  isGenerating?: boolean;
  horizon?: number;
  onSave?: () => void;
  saveStatus?: "idle" | "saving" | "saved" | "error";
};

function currency(value: number) {
  return new Intl.NumberFormat("en-CA", {
    style: "currency",
    currency: "CAD",
    maximumFractionDigits: 0,
  }).format(value);
}

function verdict(report: MeridianReport): { label: string; tone: "red" | "amber" | "green" } {
  if (report.flags.some((f) => f.severity === "red")) return { label: "RED", tone: "red" };
  if (report.flags.some((f) => f.severity === "yellow")) return { label: "YELLOW", tone: "amber" };
  return { label: "GREEN", tone: "green" };
}

const pillTone: Record<"red" | "amber" | "green", string> = {
  red: "bg-[color:var(--red-tint)] text-[color:var(--red)] border-[rgba(248,113,113,0.25)]",
  amber: "bg-[color:var(--amber-tint)] text-[color:var(--amber)] border-[rgba(251,191,36,0.25)]",
  green: "bg-[color:var(--green-tint)] text-[color:var(--green)] border-[rgba(52,211,153,0.25)]",
};

/* ── Rich markdown renderer ──────────────────────────────────── */
function RichMarkdown({ text }: { text: string }) {
  const lines = text.split("\n").filter(Boolean);
  return (
    <div className="space-y-2 text-[15px] leading-[1.8] text-[color:var(--text-secondary)]">
      {lines.map((line, i) => {
        if (line.startsWith("### ")) {
          return (
            <p key={i} className="mt-3 text-[13px] font-semibold uppercase tracking-[0.08em] text-[color:var(--text-primary)]">
              {line.slice(4)}
            </p>
          );
        }
        if (line.startsWith("## ")) {
          return (
            <p key={i} className="mt-4 font-semibold text-[color:var(--text-primary)]">
              {line.slice(3)}
            </p>
          );
        }
        if (line.startsWith("- ") || line.startsWith("* ")) {
          return (
            <div key={i} className="flex items-start gap-2">
              <span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-[color:var(--accent)]" />
              <span>{renderInline(line.slice(2))}</span>
            </div>
          );
        }
        return <p key={i}>{renderInline(line)}</p>;
      })}
    </div>
  );
}

function renderInline(text: string): React.ReactNode {
  const parts = text.split(/(\*\*[^*]+\*\*|\*[^*]+\*)/g);
  return (
    <>
      {parts.map((part, i) => {
        if (/^\*\*[^*]+\*\*$/.test(part)) {
          return (
            <strong key={i} className="font-semibold text-[color:var(--text-primary)]">
              {part.slice(2, -2)}
            </strong>
          );
        }
        if (/^\*[^*]+\*$/.test(part)) {
          return (
            <em key={i} className="italic">
              {part.slice(1, -1)}
            </em>
          );
        }
        return <span key={i}>{part}</span>;
      })}
    </>
  );
}

function NemotronBadge({ pulsing = false }: { pulsing?: boolean }) {
  return (
    <div className="inline-flex items-center gap-2 rounded-pill border border-[rgba(52,211,153,0.3)] bg-[color:var(--green-tint)] px-3 py-1.5">
      {pulsing ? (
        <Zap className="h-3 w-3 animate-pulse text-[color:var(--green)]" />
      ) : (
        <Sparkles className="h-3 w-3 text-[color:var(--green)]" />
      )}
      <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[color:var(--green)]">
        {pulsing ? "Generating · Nemotron" : "NVIDIA Nemotron-3 Nano · on-device"}
      </span>
    </div>
  );
}

function GeneratingSkeleton() {
  return (
    <div className="space-y-3">
      <NemotronBadge pulsing />
      <div className="space-y-2.5">
        <div className="h-2.5 w-full animate-shimmer rounded-full" />
        <div className="h-2.5 w-5/6 animate-shimmer rounded-full" />
        <div className="h-2.5 w-3/5 animate-shimmer rounded-full" />
      </div>
    </div>
  );
}

/* ── Info tooltip ──────────────────────────────────────────────── */
function Tooltip({ children, tip }: { children: React.ReactNode; tip: string }) {
  const [show, setShow] = useState(false);
  return (
    <span className="relative inline-flex items-center gap-1">
      {children}
      <button
        type="button"
        onMouseEnter={() => setShow(true)}
        onMouseLeave={() => setShow(false)}
        onFocus={() => setShow(true)}
        onBlur={() => setShow(false)}
        className="text-[color:var(--text-muted)] transition-colors hover:text-[color:var(--text-secondary)]"
        aria-label="More information"
      >
        <Info className="h-3 w-3" />
      </button>
      {show && (
        <span className="absolute bottom-full left-1/2 z-50 mb-2 w-64 -translate-x-1/2 rounded-lg border border-[color:var(--border)] bg-[color:var(--surface-raised)] px-3 py-2 text-[11px] leading-relaxed text-[color:var(--text-secondary)] shadow-panel">
          {tip}
          <span className="absolute left-1/2 top-full h-0 w-0 -translate-x-1/2 border-x-[5px] border-t-[5px] border-x-transparent border-t-[color:var(--border)]" />
        </span>
      )}
    </span>
  );
}

export function SummaryCard({
  report,
  isGenerating = false,
  horizon = 10,
  onSave,
  saveStatus = "idle",
}: SummaryCardProps) {
  const v = verdict(report);
  const horizonKey = `${horizon}y`;
  const horizonCost = report.horizonCosts[horizonKey] ?? report.trueCost;
  const hiddenPremium = horizonCost - report.inputs.listPrice;
  const horizonPropertyTax =
    report.costRowsByHorizon[horizonKey]?.find((r) => r.key === "property_tax")?.total ??
    report.keyNumbers.propertyTax10y;
  const hasLLM = report.summary.length > 60;

  return (
    <section className="print-block relative overflow-hidden rounded-xl border border-[color:var(--border)] bg-[color:var(--surface)] p-10">
      {/* soft radial glow */}
      <div
        className="pointer-events-none absolute left-1/2 top-[-80px] h-48 w-96 -translate-x-1/2"
        style={{ background: "radial-gradient(ellipse, rgba(52,211,153,0.07) 0%, transparent 70%)" }}
      />

      {/* verdict pill */}
      <div
        className={`absolute right-6 top-6 rounded-pill border px-3 py-1 text-[11px] font-medium uppercase tracking-[0.06em] ${pillTone[v.tone]}`}
      >
        {v.label}
      </div>

      {/* address + price */}
      <p className="flex items-center gap-2 text-[12px] font-medium uppercase tracking-[0.1em] text-[color:var(--text-muted)]">
        <span className="h-1.5 w-1.5 rounded-full bg-[color:var(--green)]" />
        {report.inputs.address} · {currency(report.inputs.listPrice)}
      </p>

      <p className="mt-5 text-[16px] text-[color:var(--text-secondary)]">
        You have negotiation leverage the seller doesn&apos;t know you know.
      </p>
      <div className="mt-2 font-mono text-5xl font-semibold tracking-tight text-[color:var(--green)] md:text-6xl">
        {currency(report.transitDividend > 0 ? report.transitDividend : Math.abs(hiddenPremium))}
      </div>
      <p className="mt-2 text-[16px] italic text-[color:var(--text-secondary)]">
        documented opportunity surfaced from city data
      </p>

      {/* Stats row */}
      <div className="mt-9 grid grid-cols-3 gap-px border-t border-[color:var(--border-faint)] pt-7">
        <Stat label={`True ${horizon}-Year Cost`} value={currency(horizonCost)} danger tip="The total true cost of ownership over the selected time period, including all mortgage payments, property taxes, land transfer tax, insurance premiums, risk loadings, and transit offsets. Powered by City of Toronto open data." />
        <Stat label="List Price" value={currency(report.inputs.listPrice)} tip="The listed asking price of the property as entered." />
        <Stat
          label="Hidden Premium"
          value={`${hiddenPremium >= 0 ? "+" : ""}${currency(hiddenPremium)}`}
          danger={hiddenPremium >= 0}
          tip="The difference between the true cost of ownership and the list price. This is what ownership actually costs beyond what the seller advertises."
        />
      </div>

      {/* AI narrative */}
      <div className="mt-8">
        {isGenerating ? (
          <GeneratingSkeleton />
        ) : hasLLM ? (
          <div className="space-y-3">
            <NemotronBadge />
            <RichMarkdown text={report.summary} />
          </div>
        ) : (
          <p className="text-[15px] leading-7 text-[color:var(--text-secondary)]">{report.summary}</p>
        )}
      </div>

      {/* Key numbers */}
      <div className="mt-8 grid gap-3 md:grid-cols-4">
        <KeyFigure
          label="Land Transfer Tax"
          value={currency(report.keyNumbers.ltt)}
          tip="Combined Ontario + Toronto Land Transfer Tax, minus the first-time buyer rebate ($8,475) if applicable. Based on 2026 provincial and municipal tax brackets."
        />
        <KeyFigure
          label={`${horizon}Y Property Tax`}
          value={currency(horizonPropertyTax)}
          tip="Cumulative property tax over the selected horizon using the 2026 Toronto mill rate (0.767311%) applied to 60% of assessed value, compounded at 3% annual growth — consistent with Toronto's historical average."
        />
        <KeyFigure
          label="CMHC Premium"
          value={currency(report.keyNumbers.insuredPremium)}
          tip="CMHC mortgage default insurance premium, required when the down payment is under 20%. Rate is 4% for <10%, 3.1% for 10-15%, 2.8% for 15-20% down. Added to the mortgage principal."
        />
        <KeyFigure
          label="Transit Dividend"
          value={currency(report.keyNumbers.baseMortgageCost10y > 0 ? report.transitDividend : 0)}
          tip="Estimated car-cost savings versus a car-dependent location, based on TTC proximity. Downtown addresses (King, Queen, Bloor, Yonge, etc.) save ~$87k over 10 years; other areas ~$28k vs a $120k baseline."
          positive
        />
      </div>

      {onSave && (
        <button
          onClick={onSave}
          disabled={saveStatus === "saving"}
          className="no-print mt-7 rounded-pill border border-[color:var(--border)] px-5 py-2.5 text-sm font-medium text-[color:var(--text-secondary)] transition-colors hover:border-[color:var(--border-focus)] hover:text-[color:var(--text-primary)] disabled:opacity-50"
        >
          {saveStatus === "saving"
            ? "Saving…"
            : saveStatus === "saved"
              ? "Saved ✓"
              : saveStatus === "error"
                ? "Save failed"
                : "Save report"}
        </button>
      )}
    </section>
  );
}

function Stat({
  label,
  value,
  danger,
  tip,
}: {
  label: string;
  value: string;
  danger?: boolean;
  tip?: string;
}) {
  return (
    <div className="px-1 first:pl-0">
      <p className="text-[11px] font-medium uppercase tracking-[0.09em] text-[color:var(--text-muted)]">
        {tip ? (
          <Tooltip tip={tip}>{label}</Tooltip>
        ) : (
          label
        )}
      </p>
      <p
        className={`mt-1.5 font-mono text-lg font-semibold tracking-tight ${danger ? "text-[color:var(--red)]" : "text-[color:var(--text-primary)]"}`}
      >
        {value}
      </p>
    </div>
  );
}

function KeyFigure({
  label,
  value,
  tip,
  positive,
}: {
  label: string;
  value: string;
  tip?: string;
  positive?: boolean;
}) {
  return (
    <div className="rounded-md border border-[color:var(--border-faint)] bg-[color:var(--surface-frosted)] p-4">
      <p className="flex items-center gap-1 text-[10px] font-medium uppercase tracking-[0.12em] text-[color:var(--text-muted)]">
        {tip ? <Tooltip tip={tip}>{label}</Tooltip> : label}
      </p>
      <p className={`mt-2 font-mono text-lg font-semibold ${positive ? "text-[color:var(--green)]" : "text-[color:var(--text-primary)]"}`}>
        {value}
      </p>
    </div>
  );
}
