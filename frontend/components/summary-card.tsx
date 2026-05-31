"use client";

import {
  ChevronRight,
  DollarSign,
  Sparkles,
  TrendingUp,
  Zap,
} from "lucide-react";
import type { ComponentType } from "react";
import { Panel } from "@/components/ui/panel";
import { Pill } from "@/components/ui/pill";
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

/* ── Inline markdown renderer (**bold** only) ─────────────────── */
function InlineMarkdown({ text }: { text: string }) {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return (
    <>
      {parts.map((part, i) => {
        const m = part.match(/^\*\*([^*]+)\*\*$/);
        return m ? (
          <strong key={i} className="font-semibold text-ink">
            {m[1]}
          </strong>
        ) : (
          <span key={i}>{part}</span>
        );
      })}
    </>
  );
}

/* ── LLM section parser ───────────────────────────────────────── */
type LLMSection = { header: string; body: string };

function parseLLMSections(text: string): LLMSection[] {
  const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);
  const sections: LLMSection[] = [];
  let currentHeader = "";
  let bodyLines: string[] = [];

  for (const line of lines) {
    // Match **Header** at start of line
    const m = line.match(/^\*\*([^*]+)\*\*\s*(.*)/);
    if (m) {
      if (currentHeader || bodyLines.length > 0) {
        sections.push({ header: currentHeader, body: bodyLines.join(" ").trim() });
        bodyLines = [];
      }
      currentHeader = m[1].trim();
      const rest = m[2].trim();
      if (rest) bodyLines.push(rest);
    } else {
      bodyLines.push(line);
    }
  }
  if (currentHeader || bodyLines.length > 0) {
    sections.push({ header: currentHeader, body: bodyLines.join(" ").trim() });
  }
  return sections.filter((s) => s.body.trim());
}

/* ── Section style map ────────────────────────────────────────── */
type SectionStyle = {
  icon: ComponentType<{ className?: string }>;
  labelClass: string;
  borderClass: string;
  bgClass: string;
  barColor: string;
};

const SECTION_STYLES: Record<string, SectionStyle> = {
  verdict: {
    icon: TrendingUp,
    labelClass: "text-ink",
    borderClass: "border-ink/15",
    bgClass: "bg-ink/[0.025]",
    barColor: "bg-ink",
  },
  "cost drivers": {
    icon: DollarSign,
    labelClass: "text-brass",
    borderClass: "border-brass/30",
    bgClass: "bg-brass/[0.06]",
    barColor: "bg-brass",
  },
  action: {
    icon: ChevronRight,
    labelClass: "text-moss",
    borderClass: "border-moss/30",
    bgClass: "bg-moss/[0.06]",
    barColor: "bg-moss",
  },
};

function getStyle(header: string): SectionStyle {
  const key = header.toLowerCase().replace(/[^a-z\s]/g, "").trim();
  return SECTION_STYLES[key] ?? SECTION_STYLES["action"];
}

/* ── Nemotron badge ───────────────────────────────────────────── */
function NemotronBadge({ pulsing = false }: { pulsing?: boolean }) {
  return (
    <div
      className={`nvidia-badge-glow inline-flex items-center gap-2 rounded-full border border-moss/40 bg-gradient-to-r from-moss/10 via-mist/60 to-mist/40 px-3 py-1.5 backdrop-blur-sm`}
    >
      {pulsing ? (
        <Zap className="h-3 w-3 animate-pulse text-moss" />
      ) : (
        <Sparkles className="h-3 w-3 text-moss" />
      )}
      <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-moss">
        {pulsing ? "Generating · Nemotron NIM" : "NVIDIA Nemotron · AI Analysis"}
      </span>
      {!pulsing && (
        <span className="ml-0.5 rounded-full bg-moss/15 px-1.5 py-0.5 text-[9px] font-semibold text-moss/80">
          GB10
        </span>
      )}
    </div>
  );
}

/* ── Skeleton while LLM is generating ────────────────────────── */
function GeneratingSkeleton() {
  return (
    <div className="space-y-3">
      <NemotronBadge pulsing />
      <div className="space-y-2.5 pt-1">
        {["Verdict", "Cost Drivers", "Action"].map((label, i) => (
          <div
            key={label}
            className="rounded-3xl border border-ink/10 bg-ink/[0.02] p-4"
            style={{ animationDelay: `${i * 120}ms` }}
          >
            <div className="mb-3 h-2.5 w-24 rounded-full animate-shimmer" />
            <div className="space-y-2">
              <div className="h-2.5 rounded-full animate-shimmer" />
              <div
                className="h-2.5 w-5/6 rounded-full animate-shimmer"
                style={{ animationDelay: "80ms" }}
              />
              <div
                className="h-2.5 w-3/5 rounded-full animate-shimmer"
                style={{ animationDelay: "160ms" }}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ── LLM narrative (3 sections) ──────────────────────────────── */
function LLMNarrative({ text }: { text: string }) {
  const sections = parseLLMSections(text);

  return (
    <div className="space-y-3">
      <NemotronBadge />
      <div className="space-y-2.5">
        {sections.map((section, i) => {
          const style = getStyle(section.header);
          const Icon = style.icon;
          return (
            <div
              key={i}
              className={`animate-slide-up rounded-3xl border p-4 transition-shadow hover:shadow-sm ${style.borderClass} ${style.bgClass}`}
              style={{ animationDelay: `${i * 90}ms` }}
            >
              {/* Section label row */}
              <div className={`mb-2 flex items-center gap-1.5 ${style.labelClass}`}>
                <div className={`h-0.5 w-4 rounded-full ${style.barColor} opacity-70`} />
                <Icon className="h-3 w-3" />
                <span className="text-[10px] font-bold uppercase tracking-[0.2em]">
                  {section.header}
                </span>
              </div>
              {/* Body with inline markdown */}
              <p className="text-sm leading-[1.8] text-slate">
                <InlineMarkdown text={section.body} />
              </p>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ── Plain text summary (preview / fallback) ─────────────────── */
function PlainSummary({ text }: { text: string }) {
  return (
    <div className="space-y-2">
      <div className="inline-flex items-center gap-1.5 rounded-full border border-[#D7E7E2] bg-mist/50 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-slate">
        Preview mode
      </div>
      <p className="text-sm leading-7 text-slate">{text}</p>
    </div>
  );
}

/* ── Stat / key number sub-components ────────────────────────── */
function StatBox({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-3xl border border-[#D7E7E2] bg-[#F7FAF8] p-4 transition-shadow hover:shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate">{label}</p>
      <p className="mt-2 font-display text-3xl text-ink">{value}</p>
      {sub && <p className="mt-1 text-[10px] text-slate/70">{sub}</p>}
    </div>
  );
}

function KeyFigure({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-3xl border border-[#D7E7E2] bg-[#F7FAF8] p-4 transition-shadow hover:shadow-sm">
      <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate">{label}</p>
      <p className="mt-2 text-lg font-semibold text-ink">{value}</p>
    </div>
  );
}

/* ── Main component ───────────────────────────────────────────── */
export function SummaryCard({
  report,
  isGenerating = false,
  horizon = 10,
  onSave,
  saveStatus = "idle",
}: SummaryCardProps) {
  const isLLMContent = report.summary.includes("**");
  const horizonKey = `${horizon}y`;
  const horizonCost = report.horizonCosts[horizonKey] ?? report.trueCost;
  const horizonMc = report.monteCarloHorizons[horizonKey] ?? report.monteCarlo;

  return (
    <Panel className="h-full">
      <div className="space-y-6">
        {/* Header */}
        <div className="space-y-4">
          <div className="flex items-center justify-between gap-2">
            <Pill tone="yellow">Summary</Pill>
            {onSave && (
              <button
                onClick={onSave}
                disabled={saveStatus === "saving"}
                className="rounded-full border border-ink/15 px-3 py-1.5 text-xs font-semibold text-ink transition-colors hover:bg-ink hover:text-mist disabled:opacity-50"
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
          </div>
          <h2 className="font-display text-3xl leading-tight text-ink">
            True {horizon}-year cost:{" "}
            <span className="text-ink/80">{currency(horizonCost)}</span>
          </h2>

          {/* AI narrative / skeleton / plain text */}
          {isGenerating ? (
            <GeneratingSkeleton />
          ) : isLLMContent ? (
            <LLMNarrative text={report.summary} />
          ) : (
            <PlainSummary text={report.summary} />
          )}
        </div>

        {/* Top stats row */}
        <div className="grid gap-3 sm:grid-cols-3">
          <StatBox
            label="Above List"
            value={`${report.aboveListPercent}%`}
          />
          <StatBox
            label="Transit Dividend"
            value={currency(report.transitDividend)}
          />
          {horizonMc ? (
            <div className="rounded-3xl border border-[#D7E7E2] bg-[#F7FAF8] p-4 transition-shadow hover:shadow-sm">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate">
                P50 Median ({horizon}y)
              </p>
              <p className="mt-2 font-display text-2xl text-ink">
                {currency(horizonMc.p50)}
              </p>
              <p className="mt-1 text-[10px] text-slate/70">
                P10 {currency(horizonMc.p10)} ·{" "}
                P90 {currency(horizonMc.p90)}
              </p>
            </div>
          ) : (
            <StatBox
              label="Mortgage Cases"
              value={String(report.scenarios.length)}
              sub="Bull · Base · Bear"
            />
          )}
        </div>

        {/* Key numbers row */}
        <div className="grid gap-3 md:grid-cols-3">
          <KeyFigure label="Land Transfer Tax" value={currency(report.keyNumbers.ltt)} />
          <KeyFigure label="10Y Property Tax" value={currency(report.keyNumbers.propertyTax10y)} />
          <KeyFigure label="Insured Premium" value={currency(report.keyNumbers.insuredPremium)} />
        </div>
      </div>
    </Panel>
  );
}
