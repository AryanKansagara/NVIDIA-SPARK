import { Panel } from "@/components/ui/panel";
import { Pill } from "@/components/ui/pill";
import type { MeridianReport } from "@/lib/report";

type SummaryCardProps = {
  report: MeridianReport;
};

function currency(value: number) {
  return new Intl.NumberFormat("en-CA", {
    style: "currency",
    currency: "CAD",
    maximumFractionDigits: 0,
  }).format(value);
}

export function SummaryCard({ report }: SummaryCardProps) {
  return (
    <Panel className="h-full bg-ink text-white">
      <div className="space-y-6">
        <div className="space-y-2">
          <Pill tone="yellow">Preview Summary</Pill>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-white/55">
            True Ownership Cost
          </p>
          <p className="font-display text-5xl leading-none text-white">
            {currency(report.trueCost)}
          </p>
          <p className="max-w-xl text-sm leading-7 text-white/78">
            {report.summary}
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <div className="rounded-3xl border border-white/10 bg-white/6 p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-white/55">
              Above List
            </p>
            <p className="mt-2 font-display text-3xl text-white">
              {report.aboveListPercent}%
            </p>
          </div>
          <div className="rounded-3xl border border-white/10 bg-white/6 p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-white/55">
              10yr Cash Outflow
            </p>
            <p className="mt-2 font-display text-3xl text-white">
              {currency(report.cashOutflow10y)}
            </p>
          </div>
          <div className="rounded-3xl border border-white/10 bg-white/6 p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-white/55">
              Transit Dividend
            </p>
            <p className="mt-2 font-display text-3xl text-white">
              {currency(report.transitDividend)}
            </p>
          </div>
        </div>

        <div className="grid gap-3 md:grid-cols-3">
          <div className="rounded-3xl border border-white/10 bg-white/6 p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-white/55">
              LTT
            </p>
            <p className="mt-2 text-lg font-semibold text-white">
              {currency(report.keyNumbers.ltt)}
            </p>
          </div>
          <div className="rounded-3xl border border-white/10 bg-white/6 p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-white/55">
              10Y Property Tax
            </p>
            <p className="mt-2 text-lg font-semibold text-white">
              {currency(report.keyNumbers.propertyTax10y)}
            </p>
          </div>
          <div className="rounded-3xl border border-white/10 bg-white/6 p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-white/55">
              Insured Premium
            </p>
            <p className="mt-2 text-lg font-semibold text-white">
              {currency(report.keyNumbers.insuredPremium)}
            </p>
          </div>
        </div>
      </div>
    </Panel>
  );
}
