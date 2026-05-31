"use client";

import { useState } from "react";
import { ChevronDown, Info } from "lucide-react";
import type { Confidence, Flag } from "@/lib/report";

type FlagListProps = {
  flags: Flag[];
};

type Severity = "red" | "amber" | "green";

function toneFor(severity: Flag["severity"]): Severity {
  if (severity === "red") return "red";
  if (severity === "green") return "green";
  return "amber";
}

const stripe: Record<Severity, string> = {
  red: "bg-[color:var(--red)]",
  amber: "bg-[color:var(--amber)]",
  green: "bg-[color:var(--green)]",
};

const badgeTone: Record<Confidence, string> = {
  High: "bg-[color:var(--green-tint)] text-[color:var(--green)] border-[rgba(52,211,153,0.2)]",
  Medium: "bg-[color:var(--amber-tint)] text-[color:var(--amber)] border-[rgba(251,191,36,0.2)]",
  Low: "bg-[color:var(--red-tint)] text-[color:var(--red)] border-[rgba(248,113,113,0.2)]",
};

function fmtCad(value: number) {
  return new Intl.NumberFormat("en-CA", {
    style: "currency",
    currency: "CAD",
    maximumFractionDigits: 0,
  }).format(value);
}

function InfoTooltip({ source, detail }: { source: string | null; detail: string | null }) {
  const [show, setShow] = useState(false);
  const tip = detail ?? source;
  if (!tip) return null;
  return (
    <span className="relative ml-1.5 inline-flex items-center">
      <button
        type="button"
        onMouseEnter={() => setShow(true)}
        onMouseLeave={() => setShow(false)}
        onFocus={() => setShow(true)}
        onBlur={() => setShow(false)}
        className="text-[color:var(--text-muted)] transition-colors hover:text-[color:var(--text-secondary)]"
        aria-label="How is this calculated?"
      >
        <Info className="h-3.5 w-3.5" />
      </button>
      {show && (
        <span className="absolute left-0 top-full z-50 mt-2 w-72 rounded-lg border border-[color:var(--border)] bg-[color:var(--surface-raised)] px-3 py-2.5 text-[11px] leading-relaxed text-[color:var(--text-secondary)] shadow-panel">
          {source && (
            <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-[color:var(--text-muted)]">
              Source: {source}
            </span>
          )}
          {tip}
        </span>
      )}
    </span>
  );
}

function FlagCard({ flag, defaultOpen }: { flag: Flag; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(!!defaultOpen);
  const tone = toneFor(flag.severity);
  const hasBody = !!(flag.detail || flag.message || flag.sayAtTable);
  const hasLeverage = flag.leverageLow != null && flag.leverageHigh != null;

  return (
    <article className="overflow-hidden rounded-lg border border-[color:var(--border)] bg-[color:var(--surface)]">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-start justify-between gap-4 px-6 py-5 text-left"
        aria-expanded={open}
      >
        <div className="flex items-start gap-3.5">
          <span className={`mt-0.5 h-5 w-[3px] shrink-0 rounded-sm ${stripe[tone]}`} />
          <span className="flex items-center text-[15px] font-medium leading-snug text-[color:var(--text-primary)]">
            {flag.title}
            <InfoTooltip source={flag.source} detail={flag.detail} />
          </span>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <span
            className={`inline-flex items-center gap-1.5 rounded-pill border px-2.5 py-1 text-[11px] font-medium ${badgeTone[flag.confidence]}`}
          >
            <span className="h-[5px] w-[5px] rounded-full bg-current" />
            {flag.confidence} confidence
          </span>
          <ChevronDown
            className={`h-3.5 w-3.5 text-[color:var(--text-muted)] transition-transform ${open ? "rotate-180" : ""}`}
          />
        </div>
      </button>
      {open && hasBody && (
        <div className="space-y-4 px-6 pb-6 pl-[2.9rem]">
          <p className="text-[15px] leading-relaxed text-[color:var(--text-secondary)]">
            {flag.detail ?? flag.message}
          </p>
          {flag.sayAtTable && (
            <div className="rounded-lg border border-[color:var(--border-faint)] bg-[color:var(--surface-raised)] px-4 py-3.5">
              <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-[color:var(--text-muted)]">
                Say this at the table
              </p>
              <p className="text-[14px] italic leading-relaxed text-[color:var(--text-secondary)]">
                &ldquo;{flag.sayAtTable}&rdquo;
              </p>
              {hasLeverage && (
                <p className="mt-2.5 text-[13px] font-medium text-[color:var(--green)]">
                  → Supports {fmtCad(flag.leverageLow!)}–{fmtCad(flag.leverageHigh!)} price reduction request
                </p>
              )}
            </div>
          )}
        </div>
      )}
    </article>
  );
}

export function FlagList({ flags }: FlagListProps) {
  if (!flags || flags.length === 0) {
    return (
      <p className="rounded-lg border border-[color:var(--border-faint)] bg-[color:var(--surface)] px-5 py-4 text-sm text-[color:var(--text-muted)]">
        No risk flags surfaced for this property.
      </p>
    );
  }
  // Most severe first: red → yellow → green/info.
  const order: Record<Flag["severity"], number> = { red: 0, yellow: 1, green: 2, info: 3 };
  const sorted = [...flags].sort((a, b) => order[a.severity] - order[b.severity]);
  return (
    <div className="space-y-2">
      {sorted.map((flag, i) => (
        <FlagCard key={`${flag.title}-${i}`} flag={flag} defaultOpen={i === 0} />
      ))}
    </div>
  );
}
