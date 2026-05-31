"use client";

import Link from "next/link";
import { ArrowRight, FileText, Moon, Settings2, Sun } from "lucide-react";
import { KnowledgeGraph } from "@/components/knowledge-graph";
import { useApp } from "@/lib/app-context";

const STATS = [
  { num: "13.3%", tone: "green", desc: "of Canada's GDP is real estate — the single largest sector" },
  { num: "$2.4T", tone: "amber", desc: "in residential mortgage debt, 73% of national GDP" },
  { num: "+45%", tone: "amber", desc: "Toronto mortgage arrears, year over year" },
  { num: "1.15M", tone: "white", desc: "mortgages renewing in 2026 at higher rates" },
];

const toneClass: Record<string, string> = {
  green: "text-[color:var(--green)]",
  amber: "text-[color:var(--amber)]",
  white: "text-[color:var(--text-primary)]",
};

export function Hero() {
  const { theme, toggleTheme } = useApp();

  return (
    <div className="relative min-h-screen overflow-hidden">
      <nav className="flex items-center justify-between px-6 pt-4 pb-4 md:px-12">
        <Link href="/" className="flex items-center gap-3">
          <span className="flex h-7 w-7 items-center justify-center rounded-full border border-[color:var(--text-primary)]">
            <span className="h-1.5 w-1.5 rounded-full bg-[color:var(--text-primary)]" />
          </span>
          <span className="text-[15px] font-semibold uppercase tracking-[0.16em] text-[color:var(--text-primary)]">
            Meridian
          </span>
        </Link>
        <div className="flex items-center gap-3">
          <span className="hidden items-center gap-2 rounded-pill border border-[rgba(82,102,235,0.35)] bg-[color:var(--accent-subtle)] px-4 py-1.5 text-[13px] text-[color:var(--accent-light)] sm:inline-flex">
            <span className="h-1.5 w-1.5 rounded-full bg-[color:var(--accent)]" />
            NVIDIA Spark Hack Toronto
          </span>
          <button
            type="button"
            onClick={toggleTheme}
            aria-label="Toggle theme"
            className="flex h-9 w-9 items-center justify-center rounded-pill border border-[color:var(--border-faint)] text-[color:var(--text-secondary)] transition-colors hover:border-[color:var(--border)]"
          >
            {theme === "light" ? <Moon className="h-4 w-4" /> : <Sun className="h-4 w-4" />}
          </button>
        </div>
      </nav>

      <section className="relative">
        <div className="pointer-events-none absolute inset-0">
          <KnowledgeGraph />
        </div>
        <div className="relative z-10 px-6 pb-12 pt-8 md:px-12 md:pt-14 lg:pt-16">
          <div className="max-w-2xl text-left">
            <p className="mb-6 text-xs font-medium uppercase tracking-[0.16em] text-[color:var(--text-muted)]">
              The True Cost of Ownership Agent
            </p>
            <h1 className="font-display text-6xl font-medium leading-none tracking-tight text-[color:var(--text-primary)] md:text-7xl">
              Meridian
            </h1>
            <p className="mt-7 text-lg italic leading-relaxed text-[color:var(--text-secondary)] md:text-xl">
              The price tag is the least honest number in the room. Meridian gives buyers 5, 10, 15 & 20-year
              cost projections, hidden risk flags, and negotiation leverage — run entirely on the DGX Spark.
            </p>
          </div>
        </div>
      </section>

      <div className="relative z-10 mx-auto mb-14 grid max-w-4xl grid-cols-2 overflow-hidden rounded-lg border border-[color:var(--border-faint)] md:grid-cols-4">
        {STATS.map((s, i) => (
          <div
            key={s.num}
            className={`px-6 py-6 ${i < STATS.length - 1 ? "border-b border-[color:var(--border-faint)] md:border-b-0 md:border-r" : ""}`}
          >
            <div className={`font-mono text-3xl font-semibold tracking-tight ${toneClass[s.tone]}`}>
              {s.num}
            </div>
            <div className="mt-1 text-[13px] leading-snug text-[color:var(--text-muted)]">{s.desc}</div>
          </div>
        ))}
      </div>

      <div className="relative z-10 mx-auto grid max-w-3xl gap-5 px-6 pb-24 md:grid-cols-2">
        <div className="group flex flex-col gap-4 rounded-xl border border-[color:var(--border)] bg-[color:var(--surface)] p-9 transition-colors hover:border-[rgba(82,102,235,0.5)]">
          <Link href="/deck" className="flex flex-1 flex-col gap-4">
            <span className="flex h-11 w-11 items-center justify-center rounded-md bg-[color:var(--accent-subtle)] text-[color:var(--accent-light)]">
              <FileText className="h-5 w-5" />
            </span>
            <span className="text-[11px] font-medium uppercase tracking-[0.14em] text-[color:var(--text-muted)]">
              Presentation
            </span>
            <span className="font-display text-2xl font-medium text-[color:var(--text-primary)]">
              Judge Pitch Deck
            </span>
            <span className="flex-1 text-[15px] leading-relaxed text-[color:var(--text-secondary)]">
              14-slide deck covering the national problem, the cascade from nation to individual, and
              Meridian&apos;s four-agent architecture running locally on DGX Spark.
            </span>
          </Link>
          <div className="mt-1 flex items-center gap-3">
            <Link
              href="/deck"
              className="inline-flex items-center gap-2 rounded-pill bg-[color:var(--accent)] px-5 py-2.5 text-[15px] font-medium text-white"
            >
              Open Deck
              <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
            </Link>
            <a
              href="/meridian-pitch.pdf"
              target="_blank"
              rel="noopener"
              className="text-[13px] font-medium text-[color:var(--text-muted)] underline-offset-2 hover:text-[color:var(--text-secondary)] hover:underline"
            >
              Download PDF
            </a>
          </div>
        </div>

        <Link
          href="/analyze"
          className="group flex flex-col gap-4 rounded-xl border border-[color:var(--border)] bg-[color:var(--surface)] p-9 transition-colors hover:border-[rgba(82,102,235,0.5)]"
        >
          <span className="flex h-11 w-11 items-center justify-center rounded-md bg-[color:var(--green-tint)] text-[color:var(--green)]">
            <Settings2 className="h-5 w-5" />
          </span>
          <span className="text-[11px] font-medium uppercase tracking-[0.14em] text-[color:var(--text-muted)]">
            Live Product
          </span>
          <span className="font-display text-2xl font-medium text-[color:var(--text-primary)]">
            Analyze a Property
          </span>
          <span className="flex-1 text-[15px] leading-relaxed text-[color:var(--text-secondary)]">
            Enter a Toronto address and list price. Watch four agents work on-device, then get a
            5–20 year cost projections, hidden risk flags with confidence, and negotiation leverage.
          </span>
          <span className="mt-1 inline-flex items-center gap-2 self-start rounded-pill border border-[color:var(--border)] px-5 py-2.5 text-[15px] font-medium text-[color:var(--text-secondary)] transition-colors group-hover:text-[color:var(--text-primary)]">
            Open App
            <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
          </span>
        </Link>
      </div>

      <footer className="relative z-10 border-t border-[color:var(--border-faint)] px-6 py-7 text-center md:px-12">
        <p className="text-[13px] text-[color:var(--text-muted)]">
          Buyer&apos;s advocate intelligence, run locally on ASUS GB10 · DGX Spark
        </p>
      </footer>
    </div>
  );
}
