"use client";

import { useState, useTransition } from "react";
import { Charts } from "@/components/charts";
import { FlagList } from "@/components/flag-list";
import { InputCard } from "@/components/input-card";
import { SummaryCard } from "@/components/summary-card";
import { buildPreviewReport, defaultFormState, type MeridianFormState } from "@/lib/report";
import { fetchReport } from "@/lib/api";

export function Workbench() {
  const [report, setReport] = useState(() => buildPreviewReport(defaultFormState()));
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

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

  return (
    <>
      <section className={`grid gap-6 lg:grid-cols-[0.9fr_1.1fr] transition-opacity ${isPending ? "opacity-60 pointer-events-none" : ""}`}>
        <InputCard initialValues={report.inputs} onSubmit={handleSubmit} />
        <SummaryCard report={report} />
      </section>
      {error && (
        <p className="rounded-xl border border-[#EDB6A4] bg-[#F9DDD4] px-4 py-3 text-sm text-[#9A381F]">
          Backend unavailable — showing client-side preview. ({error})
        </p>
      )}
      <FlagList flags={report.flags} />
      <Charts components={report.components} scenarios={report.scenarios} />
    </>
  );
}
