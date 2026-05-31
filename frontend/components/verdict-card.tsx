"use client";

import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { EASE } from "@/lib/motion";
import { currency } from "@/lib/format";
import type { MeridianReport, Verdict } from "@/lib/report";

type VerdictCardProps = {
  report: MeridianReport;
};

const VERDICT_STYLE: Record<Verdict, string> = {
  GREEN: "text-green [background:var(--green-tint)] [border-color:rgba(52,211,153,0.25)]",
  YELLOW: "text-amber [background:var(--amber-tint)] [border-color:rgba(251,191,36,0.25)]",
  RED: "text-red [background:var(--red-tint)] [border-color:rgba(248,113,113,0.25)]",
};

// Counts a number up from 0 to `target` once on mount (respects reduced motion).
function useCountUp(target: number, durationMs = 900) {
  const [value, setValue] = useState(0);
  const raf = useRef(0);
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setValue(target);
      return;
    }
    const start = performance.now();
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / durationMs);
      setValue(target * (1 - Math.pow(1 - t, 3)));
      if (t < 1) raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf.current);
  }, [target, durationMs]);
  return value;
}

// Strip the "CA" prefix Intl adds for CAD so the hero number reads "$55,000".
function dollars(n: number) {
  return currency(n).replace(/^CA/, "");
}

export function VerdictCard({ report }: VerdictCardProps) {
  const low = useCountUp(report.leverage.low);
  const high = useCountUp(report.leverage.high);
  const k = report.keyNumbers;

  return (
    <motion.section
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: EASE }}
      className="frosted relative mb-4 overflow-hidden rounded-xl border border-line bg-surface p-7 md:p-12"
    >
      {/* Top-center green radial glow */}
      <div
        aria-hidden
        className="pointer-events-none absolute left-1/2 top-[-80px] h-[200px] w-[400px] -translate-x-1/2"
        style={{ background: "radial-gradient(ellipse, rgba(52,211,153,0.07) 0%, transparent 70%)" }}
      />

      <div
        className={`absolute right-6 top-6 rounded-pill border px-3 py-1 text-[11px] font-medium uppercase tracking-[0.06em] ${VERDICT_STYLE[report.verdict]}`}
      >
        {report.verdict}
      </div>

      <p className="flex items-center gap-2 text-xs font-medium uppercase tracking-[0.1em] text-muted">
        <span className="h-1.5 w-1.5 rounded-full bg-green" />
        {report.inputs.address} · {currency(report.inputs.listPrice)}
      </p>

      <p className="mt-5 text-base font-light text-secondary">
        You have negotiation leverage the seller doesn&apos;t know you know.
      </p>

      <div className="font-mono mt-3 text-5xl font-semibold leading-none tracking-[-0.03em] text-green md:text-[64px]">
        {dollars(low)}–{dollars(high)}
      </div>
      <p className="mt-2.5 text-lg font-light italic text-secondary">
        in documented price reduction opportunity
      </p>

      <div className="mt-10 flex flex-col gap-5 border-t border-line-faint pt-7 sm:flex-row sm:gap-0">
        <Stat label="True 10-Year Cost" value={currency(report.trueCost)} danger />
        <Stat label="List Price" value={currency(report.inputs.listPrice)} divider />
        <Stat
          label="LTT + Tax + Mortgage"
          value={`${currency(k.ltt)} + ${currency(k.propertyTax10y)} + ${currency(k.baseMortgageCost10y)}`}
          danger
          divider
        />
      </div>
    </motion.section>
  );
}

function Stat({
  label,
  value,
  danger,
  divider,
}: {
  label: string;
  value: string;
  danger?: boolean;
  divider?: boolean;
}) {
  return (
    <div className={`flex-1 sm:pr-8 ${divider ? "sm:border-l sm:border-line-faint sm:pl-8" : ""}`}>
      <div className="text-[11px] font-medium uppercase tracking-[0.09em] text-muted">
        {label}
      </div>
      <div
        className={`font-mono mt-1.5 text-lg font-semibold tracking-[-0.02em] ${danger ? "text-red" : "text-primary"}`}
      >
        {value}
      </div>
    </div>
  );
}
