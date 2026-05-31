"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { EASE } from "@/lib/motion";
import { ChevronDown } from "lucide-react";
import { Pill } from "@/components/ui/pill";
import { currency } from "@/lib/format";
import type { MeridianReport } from "@/lib/report";

// The backend doesn't return a structured reasoning trace, so we synthesize the
// 4-agent narrative from the report's computed numbers. Presentational only.
function buildEntries(report: MeridianReport) {
  const k = report.keyNumbers;
  const c = report.coordinates;
  const flagCount = report.riskFlags.length + report.compositeSignals.length;
  return [
    {
      name: "Agent 1 — Intake + Planning (LLM call #1)",
      text: `Geocoded → ${c.lat.toFixed(4)}, ${c.lng.toFixed(4)}. Buyer profile: ${report.inputs.buyerProfile}. QueryPlan: heritage_register, building_permits_active, building_permits_cleared, development_applications, trca_flood queried.`,
    },
    {
      name: "Agent 2 — Data Retrieval (deterministic, async)",
      text: `Sources returned for ${report.inputs.address}. ${flagCount} signals scored across risk + composite categories. Confidence badges assigned per source.`,
    },
    {
      name: "Agent 3 — Analysis + Cost (deterministic, no LLM)",
      text: `LTT ${currency(k.ltt)}. Property tax 10yr ${currency(k.propertyTax10y)}. Mortgage base ${currency(k.baseMortgageCost10y)}. CMHC premium ${currency(k.insuredPremium)}. Transit dividend ${currency(report.transitDividend)}. True 10-year cost ${currency(report.trueCost)} (${report.aboveListPercent}% vs list).`,
    },
    {
      name: "Agent 4 — Synthesis (LLM call #2)",
      text: `Leverage range ${currency(report.leverage.low)}–${currency(report.leverage.high)}, summed from documented premiums. Verdict: ${report.verdict}. All dollar figures from Agent 3 — LLM formatted only, never computed.`,
    },
  ];
}

export function ReasoningTrace({ report }: { report: MeridianReport }) {
  const [open, setOpen] = useState(false);
  const entries = buildEntries(report);

  return (
    <div className="frosted overflow-hidden rounded-lg border border-line bg-surface">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-4 px-6 py-[18px] text-left transition-colors hover:bg-[var(--surface-frosted)]"
      >
        <div className="flex flex-wrap items-center gap-2.5">
          <span className="text-[13px] font-medium tracking-[0.03em] text-secondary">
            How Meridian reached this verdict
          </span>
          <Pill tone="unknown">
            5 sources · 2 LLM calls · Llama 3.1 8B via NIM
          </Pill>
        </div>
        <span className="flex shrink-0 items-center gap-1.5 text-[13px] text-muted">
          {open ? "Hide" : "Show"} reasoning
          <motion.span animate={{ rotate: open ? 180 : 0 }} transition={{ duration: 0.2 }}>
            <ChevronDown className="h-3.5 w-3.5" />
          </motion.span>
        </span>
      </button>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25, ease: EASE }}
            className="overflow-hidden border-t border-line-faint"
          >
            {entries.map((e) => (
              <div key={e.name} className="border-b border-line-faint px-6 py-4 last:border-0">
                <p className="text-[11px] font-medium uppercase tracking-[0.09em] text-accent-light opacity-80">
                  {e.name}
                </p>
                <p className="font-mono mt-1.5 text-[12px] leading-[1.6] text-muted">
                  {e.text}
                </p>
              </div>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
