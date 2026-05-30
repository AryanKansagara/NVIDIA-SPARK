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
    <Panel className="h-full">
      <div className="space-y-6">
        <div className="space-y-3">
          <Pill tone="yellow">Summary</Pill>
          <h2 className="font-display text-3xl leading-tight text-ink">
            True 10-year cost: {currency(report.trueCost)}
          </h2>
          <p className="max-w-xl text-sm leading-7 text-slate">
            {report.summary}
          </p>
        </div>
        <div className="grid gap-4 sm:grid-cols-3">
          <div className="rounded-3xl border border-[#D7E7E2] bg-[#F7FAF8] p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate">
              Above List
            </p>
            <p className="mt-2 font-display text-3xl text-ink">
              {report.aboveListPercent}%
            </p>
          </div>
          <div className="rounded-3xl border border-[#D7E7E2] bg-[#F7FAF8] p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate">
              Transit Dividend
            </p>
            <p className="mt-2 font-display text-3xl text-ink">
              {currency(report.transitDividend)}
            </p>
          </div>
          <div className="rounded-3xl border border-[#D7E7E2] bg-[#F7FAF8] p-4">
            {report.monteCarlo ? (
              <>
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate">
                  P50 Median
                </p>
                <p className="mt-2 font-display text-2xl text-ink">
                  {currency(report.monteCarlo.p50)}
                </p>
                <p className="mt-1 text-[10px] text-slate">
                  P10 {currency(report.monteCarlo.p10)} · P90 {currency(report.monteCarlo.p90)}
                </p>
              </>
            ) : (
              <>
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate">
                  Mortgage Cases
                </p>
                <p className="mt-2 font-display text-3xl text-ink">
                  {report.scenarios.length}
                </p>
              </>
            )}
          </div>
        </div>
        <div className="grid gap-3 md:grid-cols-3">
          <div className="rounded-3xl border border-[#D7E7E2] bg-[#F7FAF8] p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate">
              LTT
            </p>
            <p className="mt-2 text-lg font-semibold text-ink">
              {currency(report.keyNumbers.ltt)}
            </p>
          </div>
          <div className="rounded-3xl border border-[#D7E7E2] bg-[#F7FAF8] p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate">
              10Y Property Tax
            </p>
            <p className="mt-2 text-lg font-semibold text-ink">
              {currency(report.keyNumbers.propertyTax10y)}
            </p>
          </div>
          <div className="rounded-3xl border border-[#D7E7E2] bg-[#F7FAF8] p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate">
              Insured Premium
            </p>
            <p className="mt-2 text-lg font-semibold text-ink">
              {currency(report.keyNumbers.insuredPremium)}
            </p>
          </div>
        </div>
      </div>
    </Panel>
  );
}
