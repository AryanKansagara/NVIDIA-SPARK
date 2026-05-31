"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { EASE } from "@/lib/motion";
import { ChevronDown } from "lucide-react";
import { Pill, type Confidence } from "@/components/ui/pill";
import type { Flag, Severity } from "@/lib/report";

const STRIPE: Record<Severity, string> = {
  red: "var(--red)",
  amber: "var(--amber)",
  green: "var(--green)",
};

// Confidence label → badge tone.
const TONE: Record<Flag["confidence"], Confidence> = {
  high: "high",
  medium: "medium",
  low: "low",
  unknown: "unknown",
};

function FlagItem({ flag, index, defaultOpen }: { flag: Flag; index: number; defaultOpen: boolean }) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <motion.article
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: index * 0.06, ease: EASE }}
      className="frosted relative overflow-hidden rounded-lg border border-line bg-surface"
    >
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex w-full items-start justify-between gap-4 px-6 py-5 text-left"
      >
        <div className="flex items-start gap-3.5">
          <span
            aria-hidden
            className="mt-0.5 h-5 w-[3px] shrink-0 rounded-sm"
            style={{ background: STRIPE[flag.severity] }}
          />
          <h3 className="text-base font-medium leading-[1.35] text-primary">
            {flag.title}
          </h3>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Pill tone={TONE[flag.confidence]}>{flag.confidence} confidence</Pill>
          <motion.span animate={{ rotate: open ? 180 : 0 }} transition={{ duration: 0.2 }}>
            <ChevronDown className="h-4 w-4 text-muted" />
          </motion.span>
        </div>
      </button>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25, ease: EASE }}
            className="overflow-hidden"
          >
            <div className="pb-6 pl-[calc(24px+3px+14px)] pr-6">
              <p className="text-[15px] font-light leading-[1.65] text-secondary">
                {flag.description}
              </p>

              {flag.script && (
                <div className="mt-4 rounded-md border border-line-faint bg-surface-raised p-4">
                  <p className="text-[11px] font-medium uppercase tracking-[0.1em] text-accent-light opacity-80">
                    Say this at the table
                  </p>
                  <p className="mt-2 text-sm font-light italic leading-[1.6] text-primary">
                    “{flag.script.text}”
                  </p>
                  <p className="font-mono mt-2.5 text-[13px] font-medium text-green">
                    {flag.script.amount}
                  </p>
                </div>
              )}

              {flag.note && (
                <p className="mt-2 text-xs italic text-muted">{flag.note}</p>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.article>
  );
}

export function FlagCards({
  flags,
  firstOpen = false,
}: {
  flags: Flag[];
  firstOpen?: boolean;
}) {
  return (
    <div className="space-y-2">
      {flags.map((flag, i) => (
        <FlagItem
          key={`${flag.title}-${i}`}
          flag={flag}
          index={i}
          defaultOpen={firstOpen && i === 0}
        />
      ))}
    </div>
  );
}
