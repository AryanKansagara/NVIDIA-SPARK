"use client";

import { useState } from "react";
import { Charts } from "@/components/charts";
import { FlagList } from "@/components/flag-list";
import { InputCard } from "@/components/input-card";
import { SummaryCard } from "@/components/summary-card";
import { buildPreviewReport, defaultFormState, type MeridianFormState } from "@/lib/report";

export function Workbench() {
  const [report, setReport] = useState(() => buildPreviewReport(defaultFormState()));

  function handleSubmit(nextInputs: MeridianFormState) {
    setReport(buildPreviewReport(nextInputs));
  }

  return (
    <>
      <section className="grid gap-6 lg:grid-cols-[0.9fr_1.1fr]">
        <InputCard initialValues={report.inputs} onSubmit={handleSubmit} />
        <SummaryCard report={report} />
      </section>
      <FlagList flags={report.flags} />
      <Charts components={report.components} scenarios={report.scenarios} />
    </>
  );
}
