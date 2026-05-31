"use client";

import dynamic from "next/dynamic";
import { useState, useTransition } from "react";
import { Charts } from "@/components/charts";
import { FlagList } from "@/components/flag-list";
import { InputCard } from "@/components/input-card";
import { SummaryCard } from "@/components/summary-card";
import { buildPreviewReport, defaultFormState, type MeridianFormState } from "@/lib/report";
import { fetchReport } from "@/lib/api";
import { fetchPipelineRefresh, type PipelineStatus } from "@/lib/pipeline-api";

// Leaflet uses `window` — must be client-only with no SSR
const PropertyMap = dynamic(
  () => import("@/components/property-map").then((m) => ({ default: m.PropertyMap })),
  { ssr: false },
);

export function Workbench() {
  const [report, setReport] = useState(() => buildPreviewReport(defaultFormState()));
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [pipelineStatus, setPipelineStatus] = useState<PipelineStatus | null>(null);
  const [isRefreshing, startRefreshTransition] = useTransition();

  function handleSubmit(nextInputs: MeridianFormState) {
    setError(null);
    startTransition(async () => {
      try {
        setReport(await fetchReport(nextInputs));
      } catch (e) {
        setError(e instanceof Error ? e.message : "Backend unavailable");
        setReport(buildPreviewReport(nextInputs));
      }
    });
  }

  function handleRefreshPipeline() {
    startRefreshTransition(async () => {
      try {
        const status = await fetchPipelineRefresh();
        setPipelineStatus(status);
      } catch (e) {
        setError(
          `Pipeline refresh failed: ${e instanceof Error ? e.message : "Unknown error"}`,
        );
      }
    });
  }

  return (
    <>
      <section className="grid gap-6 lg:grid-cols-[0.9fr_1.1fr]">
        {/* Input card dims while pending so user knows to wait */}
        <div className={`transition-opacity duration-300 ${isPending ? "opacity-50 pointer-events-none" : ""}`}>
          <InputCard
            initialValues={report.inputs}
            onSubmit={handleSubmit}
            onRefreshPipeline={handleRefreshPipeline}
            pipelineStatus={pipelineStatus}
            isRefreshing={isRefreshing}
          />
        </div>
        {/* Summary card shows its own generating skeleton */}
        <SummaryCard report={report} isGenerating={isPending} />
      </section>
      {error && (
        <p className="rounded-xl border border-[#EDB6A4] bg-[#F9DDD4] px-4 py-3 text-sm text-[#9A381F]">
          {error}
        </p>
      )}
      <FlagList flags={report.flags} />
      <Charts
        components={report.components}
        scenarios={report.scenarios}
        monteCarlo={report.monteCarlo}
        listPrice={report.inputs.listPrice}
      />
      <PropertyMap geometry={report.mapGeometry} />
    </>
  );
}
