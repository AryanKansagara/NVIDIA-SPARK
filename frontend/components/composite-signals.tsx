"use client";

import type { CompositeSignal } from "@/lib/report";

const valueTone: Record<CompositeSignal["value"], string> = {
  Low: "bg-[color:var(--green-tint)] text-[color:var(--green)] border-[rgba(52,211,153,0.2)]",
  Medium: "bg-[color:var(--amber-tint)] text-[color:var(--amber)] border-[rgba(251,191,36,0.2)]",
  Elevated: "bg-[color:var(--red-tint)] text-[color:var(--red)] border-[rgba(248,113,113,0.2)]",
  High: "bg-[color:var(--red-tint)] text-[color:var(--red)] border-[rgba(248,113,113,0.2)]",
};

const stripeTone: Record<CompositeSignal["value"], string> = {
  Low: "bg-[color:var(--green)]",
  Medium: "bg-[color:var(--amber)]",
  Elevated: "bg-[color:var(--red)]",
  High: "bg-[color:var(--red)]",
};

export function CompositeSignals({ signals }: { signals: CompositeSignal[] }) {
  if (!signals || signals.length === 0) return null;
  return (
    <div className="space-y-2">
      {signals.map((signal) => (
        <article
          key={signal.signalName}
          className="overflow-hidden rounded-lg border border-[color:var(--border)] bg-[color:var(--surface)]"
        >
          <div className="flex items-start justify-between gap-4 px-6 py-5">
            <div className="flex items-start gap-3.5">
              <span className={`mt-0.5 h-5 w-[3px] shrink-0 rounded-sm ${stripeTone[signal.value]}`} />
              <div>
                <p className="text-[15px] font-medium leading-snug text-[color:var(--text-primary)]">
                  {signal.signalName} — {signal.value}
                </p>
                <ul className="mt-2 space-y-1">
                  {signal.factors.map((f, i) => (
                    <li key={i} className="text-[13px] leading-relaxed text-[color:var(--text-secondary)]">
                      • {f}
                    </li>
                  ))}
                </ul>
                <p className="mt-2.5 text-[12px] italic leading-relaxed text-[color:var(--text-muted)]">
                  {signal.disclaimer}
                </p>
              </div>
            </div>
            <span
              className={`inline-flex shrink-0 items-center gap-1.5 rounded-pill border px-2.5 py-1 text-[11px] font-medium ${valueTone[signal.value]}`}
            >
              <span className="h-[5px] w-[5px] rounded-full bg-current" />
              Low confidence
            </span>
          </div>
        </article>
      ))}
    </div>
  );
}
