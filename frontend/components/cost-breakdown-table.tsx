import { Panel } from "@/components/ui/panel";
import type { CostBreakdownRow } from "@/lib/report";

type CostBreakdownTableProps = {
  rows: CostBreakdownRow[];
};

const confidenceClasses = {
  High: "border-[#AEE7D2] bg-[#E3F8F0] text-[#1C7E60]",
  Medium: "border-[#F2D48A] bg-[#FFF4D8] text-[#A66B00]",
  Low: "border-[#F3B6B6] bg-[#FFE5E5] text-[#C64545]",
};

function formatMoney(value: number) {
  return new Intl.NumberFormat("en-CA", {
    style: "currency",
    currency: "CAD",
    maximumFractionDigits: 0,
  }).format(value);
}

export function CostBreakdownTable({ rows }: CostBreakdownTableProps) {
  return (
    <section className="space-y-4">
      <div className="flex items-center gap-3">
        <p className="text-sm font-semibold uppercase tracking-[0.22em] text-slate">
          10-Year Cost Breakdown
        </p>
        <div className="h-px flex-1 bg-[#D7E7E2]" />
      </div>

      <Panel className="overflow-hidden p-0">
        <div className="grid grid-cols-[1.7fr_0.9fr_1fr_0.9fr] gap-4 border-b border-[#E8F0EC] bg-[#FBF8F0] px-5 py-4 text-xs font-semibold uppercase tracking-[0.18em] text-slate md:px-6">
          <div>Category</div>
          <div>Annual</div>
          <div>10-Year Total</div>
          <div>Confidence</div>
        </div>

        <div>
          {rows.map((row, index) => {
            const isFinal = row.category === "True 10-year cost of ownership";
            return (
              <div
                key={`${row.category}-${index}`}
                className={`grid grid-cols-1 gap-3 border-b border-[#E8F0EC] px-5 py-5 md:grid-cols-[1.7fr_0.9fr_1fr_0.9fr] md:items-center md:gap-4 md:px-6 ${
                  isFinal ? "bg-[#FBF8F0]" : "bg-white"
                }`}
              >
                <div className={`text-[1.05rem] leading-8 ${isFinal ? "font-semibold text-ink" : "text-ink"}`}>
                  {row.category}
                </div>
                <div className={`text-base ${isFinal ? "font-semibold text-[#FF6A5E]" : "text-slate"}`}>
                  {row.annual}
                </div>
                <div
                  className={`text-base font-semibold ${
                    row.emphasis === "positive"
                      ? "text-[#2B9D6D]"
                      : row.emphasis === "negative"
                        ? "text-[#FF6A5E]"
                        : "text-ink"
                  }`}
                >
                  {formatMoney(row.total)}
                </div>
                <div>
                  <span
                    className={`inline-flex rounded-full border px-4 py-2 text-sm font-semibold ${confidenceClasses[row.confidence]}`}
                  >
                    {row.confidence}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </Panel>
    </section>
  );
}
