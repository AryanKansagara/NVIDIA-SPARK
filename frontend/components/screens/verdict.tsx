"use client";

import { VerdictCard } from "@/components/verdict-card";
import { FlagCards } from "@/components/flag-card";
import { CostBreakdown } from "@/components/cost-breakdown";
import { ReasoningTrace } from "@/components/reasoning-trace";
import { PropertyMap } from "@/components/property-map";
import type { MeridianReport } from "@/lib/report";

type VerdictProps = {
  report: MeridianReport;
  usedFallback: boolean;
};

function SectionLabel({ children }: { children: string }) {
  return (
    <div className="mb-3 mt-8 flex items-center gap-3">
      <p className="whitespace-nowrap text-[11px] font-medium uppercase tracking-[0.1em] text-muted">
        {children}
      </p>
      <span className="h-px flex-1 bg-line-faint" />
    </div>
  );
}

export function Verdict({ report, usedFallback }: VerdictProps) {
  return (
    <section className="mx-auto max-w-[1060px] px-8 pb-32 pt-[120px]">
      {usedFallback && (
        <p className="mb-5 rounded-md border border-amber/40 bg-amber-tint px-4 py-2.5 text-[13px] text-amber">
          Backend unavailable — showing the client-side preview.
        </p>
      )}

      <VerdictCard report={report} />

      {report.riskFlags.length > 0 && (
        <>
          <SectionLabel>Risk flags</SectionLabel>
          <FlagCards flags={report.riskFlags} firstOpen />
        </>
      )}

      {report.compositeSignals.length > 0 && (
        <>
          <SectionLabel>Composite signals</SectionLabel>
          <FlagCards flags={report.compositeSignals} />
        </>
      )}

      <SectionLabel>10-year cost breakdown</SectionLabel>
      <CostBreakdown report={report} />

      <SectionLabel>Agent reasoning</SectionLabel>
      <ReasoningTrace report={report} />

      <SectionLabel>Property map</SectionLabel>
      <PropertyMap report={report} />
    </section>
  );
}
