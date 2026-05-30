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
    <Panel className="h-full border-[#18313C] bg-[#18313C] text-[#F7F3EA]">
      <div className="space-y-6">
        <div className="space-y-3">
          <Pill tone="yellow">Preview Summary</Pill>
          <h2 className="font-display text-3xl leading-tight text-[#FFF9EF]">
            True 10-year cost: {currency(report.trueCost)}
          </h2>
          <p className="max-w-xl text-sm leading-7 text-[#E9E0CF]">
            {report.summary}
          </p>
        </div>
        <div className="grid gap-4 sm:grid-cols-3">
          <div className="rounded-3xl border border-white/15 bg-white/10 p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#CBBFA8]">
              Above List
            </p>
            <p className="mt-2 font-display text-3xl text-[#FFF9EF]">
              {report.aboveListPercent}%
            </p>
          </div>
          <div className="rounded-3xl border border-white/15 bg-white/10 p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#CBBFA8]">
              Transit Dividend
            </p>
            <p className="mt-2 font-display text-3xl text-[#FFF9EF]">
              {currency(report.transitDividend)}
            </p>
          </div>
          <div className="rounded-3xl border border-white/15 bg-white/10 p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#CBBFA8]">
              Mortgage Cases
            </p>
            <p className="mt-2 font-display text-3xl text-[#FFF9EF]">
              {report.scenarios.length}
            </p>
          </div>
        </div>
        <div className="grid gap-3 md:grid-cols-3">
          <div className="rounded-3xl border border-white/15 bg-white/10 p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#CBBFA8]">
              LTT
            </p>
            <p className="mt-2 text-lg font-semibold text-[#FFF9EF]">
              {currency(report.keyNumbers.ltt)}
            </p>
          </div>
          <div className="rounded-3xl border border-white/15 bg-white/10 p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#CBBFA8]">
              10Y Property Tax
            </p>
            <p className="mt-2 text-lg font-semibold text-[#FFF9EF]">
              {currency(report.keyNumbers.propertyTax10y)}
            </p>
          </div>
          <div className="rounded-3xl border border-white/15 bg-white/10 p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#CBBFA8]">
              Insured Premium
            </p>
            <p className="mt-2 text-lg font-semibold text-[#FFF9EF]">
              {currency(report.keyNumbers.insuredPremium)}
            </p>
          </div>
        </div>
      </div>
    </Panel>
  );
}
