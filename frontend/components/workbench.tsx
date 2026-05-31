"use client";

import { useState } from "react";
import { AgentReasoningPanel } from "@/components/agent-reasoning-panel";
import { Charts } from "@/components/charts";
import { CostBreakdownTable } from "@/components/cost-breakdown-table";
import { FlagList } from "@/components/flag-list";
import { InputCard } from "@/components/input-card";
import { SummaryCard } from "@/components/summary-card";
import { fetchMeridianReport, getApiBaseUrl } from "@/lib/api";
import {
  buildPreviewReport,
  defaultFormState,
  type MeridianFormState,
} from "@/lib/report";

export function Workbench() {
  const [report, setReport] = useState(() =>
    buildPreviewReport(defaultFormState()),
  );
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(nextInputs: MeridianFormState) {
    setIsLoading(true);
    setError(null);

    try {
      const nextReport = await fetchMeridianReport(nextInputs);
      setReport(nextReport);
    } catch (submissionError) {
      setReport(buildPreviewReport(nextInputs));
      setError(
        submissionError instanceof Error
          ? `Live backend request failed. Showing local preview instead. ${submissionError.message}`
          : "Live backend request failed. Showing local preview instead.",
      );
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <>
      <section className="grid gap-6 lg:grid-cols-[0.9fr_1.1fr]">
        <InputCard
          initialValues={report.inputs}
          onSubmit={handleSubmit}
          isLoading={isLoading}
          apiBaseUrl={getApiBaseUrl()}
        />
        <SummaryCard report={report} />
      </section>
      {error ? (
        <div className="rounded-3xl border border-[#EDB6A4] bg-[#F9DDD4] px-4 py-3 text-sm text-[#8B341B]">
          {error}
        </div>
      ) : null}
      <FlagList flags={report.flags} />
      <CostBreakdownTable rows={report.breakdownRows} />
      <AgentReasoningPanel reasoning={report.reasoning} />
      <Charts components={report.components} scenarios={report.scenarios} />
    </>
  );
}
