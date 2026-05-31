"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { EASE } from "@/lib/motion";
import { KnowledgeGraph } from "@/components/knowledge-graph";
import { IntakeModal } from "@/components/intake-modal";
import type { MeridianFormState } from "@/lib/report";

type LandingProps = {
  defaults: MeridianFormState;
  onStart: (inputs: MeridianFormState) => void;
};

const FEATURES = [
  {
    bg: "bg-green-tint text-green",
    icon: (
      <path d="M9 1v16M1 9h16" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    ),
    title: "Hidden cost detection",
    body: "Heritage designations, flood zones, active permits, development pressure. Risks that add $50K+ to your real cost.",
  },
  {
    bg: "bg-amber-tint text-amber",
    icon: (
      <>
        <path d="M9 3v6l4 2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        <circle cx="9" cy="9" r="7" stroke="currentColor" strokeWidth="1.5" />
      </>
    ),
    title: "10-year cost projection",
    body: "Mortgage, taxes, insurance, maintenance, and every hidden premium calculated to the dollar over a decade.",
  },
  {
    bg: "bg-accent-subtle text-accent-light",
    icon: (
      <path d="M2 13l5-5 3 3 6-8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    ),
    title: "Negotiation scripts",
    body: "For every risk flag, a ready-to-use sentence you can say at the table, with the dollar leverage to back it up.",
  },
];

const TRUST = [
  "7 Toronto open data sources",
  "2 LLM calls, all dollar math deterministic",
  "Runs 100% locally on DGX Spark via NIM",
  "Per-source confidence badges",
];

const container = {
  hidden: {},
  show: { transition: { staggerChildren: 0.09, delayChildren: 0.05 } },
};
const item = {
  hidden: { opacity: 0, y: 16 },
  show: { opacity: 1, y: 0, transition: { duration: 0.5, ease: EASE } },
};

export function Landing({ defaults, onStart }: LandingProps) {
  const [modalOpen, setModalOpen] = useState(false);

  return (
    <section className="relative min-h-screen overflow-hidden pt-[72px]">
      {/* Animated labeled knowledge graph spans the section; nodes live in the right half */}
      <KnowledgeGraph />

      {/* Hero: two columns (copy left, graph space right) */}
      <motion.div
        variants={container}
        initial="hidden"
        animate="show"
        className="relative z-[1] mx-auto grid max-w-6xl items-center gap-12 px-8 pb-16 pt-24 md:pt-28 lg:grid-cols-2"
      >
        <div className="flex flex-col items-start text-left max-lg:items-center max-lg:text-center">
          <motion.h1
            variants={item}
            className="text-balance text-[32px] font-medium leading-[1.18] tracking-[-0.03em] text-primary md:text-[44px]"
          >
            Know what you&apos;re <em className="not-italic text-green">really</em>{" "}
            buying before you sign
          </motion.h1>

          <motion.p
            variants={item}
            className="mt-[18px] max-w-[460px] text-[17px] font-light leading-[1.65] text-secondary"
          >
            Meridian queries 7 Toronto open data sources to surface hidden risks
            that list price never shows, then turns each one into negotiation
            leverage with a dollar range.
          </motion.p>

          <motion.button
            variants={item}
            type="button"
            onClick={() => setModalOpen(true)}
            className="group mt-9 inline-flex items-center gap-2 rounded-pill bg-accent px-7 py-3.5 text-[15px] font-medium text-white transition hover:translate-y-[-1px] hover:opacity-[0.88]"
          >
            Analyze my property
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path d="M3 8h10M9 4l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </motion.button>

          <motion.p variants={item} className="mt-3 text-[13px] text-muted">
            Free. No signup. Runs locally on NVIDIA DGX Spark.
          </motion.p>
        </div>

        {/* Right column reserves space for the graph (canvas draws nodes here) */}
        <div className="min-h-[420px] max-lg:hidden" aria-hidden />
      </motion.div>

      {/* Feature cards */}
      <motion.div
        variants={container}
        initial="hidden"
        animate="show"
        className="relative z-[1] mx-auto grid max-w-5xl gap-3 px-8 pb-20 md:grid-cols-3"
      >
        {FEATURES.map((f) => (
          <motion.div
            key={f.title}
            variants={item}
            className="frosted rounded-lg border border-line bg-surface p-7 transition hover:[border-color:var(--border-focus)]"
          >
            <div className={`flex h-9 w-9 items-center justify-center rounded-sm ${f.bg}`}>
              <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
                {f.icon}
              </svg>
            </div>
            <h3 className="mt-4 text-[15px] font-medium text-primary">{f.title}</h3>
            <p className="mt-2 text-sm font-light leading-[1.55] text-muted">{f.body}</p>
          </motion.div>
        ))}
      </motion.div>

      {/* Trust bar */}
      <div className="relative z-[1] mx-auto flex max-w-3xl flex-wrap items-center justify-center gap-x-8 gap-y-3 px-8 pb-24">
        {TRUST.map((t) => (
          <div key={t} className="flex items-center gap-2 text-[13px] text-muted">
            <span className="h-1.5 w-1.5 rounded-full bg-green opacity-70" />
            {t}
          </div>
        ))}
      </div>

      {/* Footer */}
      <footer className="relative z-[1] mx-auto max-w-3xl border-t border-line-faint px-8 pb-12 pt-8 text-center">
        <p className="text-xs text-muted">
          Meridian is a hackathon prototype. Not financial advice. Built for
          NVIDIA Spark Hack Toronto 2026.
        </p>
      </footer>

      <IntakeModal
        open={modalOpen}
        defaults={defaults}
        onClose={() => setModalOpen(false)}
        onSubmit={(inputs) => {
          setModalOpen(false);
          onStart(inputs);
        }}
      />
    </section>
  );
}
