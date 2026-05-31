"use client";

import { useEffect, useState } from "react";
import { Brain, Database, FlaskConical, Cpu, Sparkles, CheckCircle2, ArrowRight } from "lucide-react";
import type { PipelineStep } from "@/lib/report";

type Phase = "running" | "done";

const STEPS = [
  {
    id: 1,
    name: "Geocode & Intake",
    icon: Database,
    color: "#5266EB",
    running: "Resolving address → lat/lon via Nominatim…",
    done: "Address resolved · query plan built",
    traceNames: ["geocode"],
    description: "City of Toronto address points dataset"
  },
  {
    id: 2,
    name: "Data Retrieval",
    icon: Brain,
    color: "#E16B47",
    running: "Fetching heritage register, dev permits, TRCA flood GeoJSON…",
    done: "3 city data sources returned",
    traceNames: ["heritage", "flood", "development"],
    description: "Toronto Open Data + TRCA ArcGIS"
  },
  {
    id: 3,
    name: "Financial Engine",
    icon: Cpu,
    color: "#B99239",
    running: "LTT brackets · property-tax projection · GPU Monte Carlo (10k paths)…",
    done: "Deterministic engine + Monte Carlo simulation complete",
    traceNames: ["engine", "monte_carlo"],
    description: "NVIDIA CuPy GPU-accelerated simulation"
  },
  {
    id: 4,
    name: "RAG + Synthesis",
    icon: Sparkles,
    color: "#34D399",
    running: "Retrieving land-law context · generating narrative with Nemotron…",
    done: "Report narrative generated on-device",
    traceNames: ["rag", "synthesis"],
    description: "ChromaDB RAG + local Nemotron-3 Nano 30B"
  },
];

export function AgentsWorking({
  address,
  phase,
  trace,
}: {
  address: string;
  phase: Phase;
  trace?: PipelineStep[];
}) {
  const [active, setActive] = useState(0);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 120);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    if (phase === "done") {
      setActive(STEPS.length);
      return;
    }
    setActive(0);
    const timers = STEPS.slice(0, -1).map((_, i) =>
      setTimeout(() => setActive(i + 1), 1100 * (i + 1)),
    );
    return () => timers.forEach(clearTimeout);
  }, [phase]);

  function elapsedFor(step: (typeof STEPS)[number]): number | null {
    if (phase !== "done" || !trace?.length) return null;
    const matches = trace.filter((t) => step.traceNames.includes(t.name));
    if (!matches.length) return null;
    return Math.max(...matches.map((m) => m.elapsedMs));
  }

  const progress = phase === "done" ? 100 : Math.min(95, (active / STEPS.length) * 100 + 5);
  const totalMs = phase === "done" && trace?.length
    ? Math.max(...trace.map((t) => t.startedMs + t.elapsedMs))
    : null;

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-[color:var(--bg)] px-4 py-16">
      {/* NVIDIA badge */}
      <div className="mb-8 flex items-center gap-2 rounded-pill border border-[rgba(82,102,235,0.3)] bg-[color:var(--accent-subtle)] px-4 py-2">
        <span className="h-2 w-2 animate-pulse rounded-full bg-[color:var(--green)]" />
        <span className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[color:var(--accent-light)]">
          NVIDIA DGX Spark · On-device analysis
        </span>
      </div>

      {/* Address */}
      <p className="text-center text-[12px] font-medium uppercase tracking-[0.12em] text-[color:var(--text-muted)]">
        {address}
      </p>
      <h2 className="mt-2 text-center font-display text-3xl font-medium tracking-tight text-[color:var(--text-primary)]">
        {phase === "done" ? "Analysis complete" : "Analyzing property…"}
      </h2>
      {totalMs != null && (
        <p className="mt-1 text-center text-sm text-[color:var(--green)]">
          Pipeline completed in {(totalMs / 1000).toFixed(1)}s
        </p>
      )}

      {/* Progress bar */}
      <div className="mt-8 h-1.5 w-full max-w-lg overflow-hidden rounded-full bg-[color:var(--border-faint)]">
        <div
          className="h-full rounded-full bg-[color:var(--accent)] transition-all duration-700"
          style={{ width: `${progress}%`, boxShadow: "0 0 8px rgba(82,102,235,0.6)" }}
        />
      </div>

      {/* Agent pipeline */}
      <div className="mt-10 w-full max-w-lg space-y-3">
        {STEPS.map((s, i) => {
          const state = phase === "done" || i < active ? "done" : i === active ? "active" : "pending";
          const ms = elapsedFor(s);
          const Icon = s.icon;
          return (
            <div
              key={s.id}
              className="relative overflow-hidden rounded-xl border transition-all duration-500"
              style={{
                borderColor: state === "active" ? s.color + "60" : state === "done" ? s.color + "30" : "var(--border-faint)",
                background: state === "active"
                  ? `linear-gradient(135deg, ${s.color}12 0%, transparent 60%)`
                  : state === "done"
                    ? `${s.color}08`
                    : "var(--surface)",
                opacity: state === "pending" ? 0.4 : 1,
                transform: state === "active" ? "scale(1.01)" : "scale(1)",
              }}
            >
              {/* scan line for active */}
              {state === "active" && (
                <div
                  className="pointer-events-none absolute inset-0"
                  style={{
                    background: `linear-gradient(90deg, transparent ${(tick * 3) % 120}%, ${s.color}18 ${(tick * 3) % 120 + 12}%, transparent ${(tick * 3) % 120 + 24}%)`,
                  }}
                />
              )}

              <div className="flex items-center gap-4 px-5 py-4">
                <div
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg"
                  style={{
                    background: state === "done" ? s.color + "22" : state === "active" ? s.color + "30" : "var(--surface-raised)",
                    border: `1px solid ${state === "pending" ? "var(--border-faint)" : s.color + "40"}`,
                    boxShadow: state === "active" ? `0 0 16px ${s.color}40` : "none",
                  }}
                >
                  {state === "done" ? (
                    <CheckCircle2 className="h-5 w-5" style={{ color: s.color }} />
                  ) : (
                    <Icon
                      className={`h-5 w-5 ${state === "active" ? "animate-pulse" : ""}`}
                      style={{ color: state === "pending" ? "var(--text-muted)" : s.color }}
                    />
                  )}
                </div>

                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-[13px] font-semibold text-[color:var(--text-primary)]">
                      {s.name}
                    </span>
                    {state === "active" && (
                      <span className="flex items-center gap-1">
                        {[0, 1, 2].map((d) => (
                          <span
                            key={d}
                            className="inline-block h-1 w-1 rounded-full bg-[color:var(--text-muted)]"
                            style={{
                              opacity: ((tick + d * 3) % 9) < 5 ? 1 : 0.2,
                              transition: "opacity 0.12s",
                            }}
                          />
                        ))}
                      </span>
                    )}
                  </div>
                  <p className="mt-0.5 truncate font-mono text-[11px] text-[color:var(--text-muted)]">
                    {state === "active" ? s.running : state === "done" ? s.done : s.description}
                  </p>
                </div>

                <div className="shrink-0 text-right">
                  {ms != null ? (
                    <span className="font-mono text-[11px]" style={{ color: s.color }}>
                      {(ms / 1000).toFixed(1)}s
                    </span>
                  ) : state === "active" ? (
                    <span className="font-mono text-[11px] text-[color:var(--text-muted)]">
                      {((tick * 80) / 1000).toFixed(1)}s
                    </span>
                  ) : (
                    <span className="font-mono text-[11px] text-[color:var(--border-faint)]">—</span>
                  )}
                </div>
              </div>

              {/* connector arrow */}
              {i < STEPS.length - 1 && (
                <div className="absolute bottom-[-12px] left-[28px] z-10 text-[color:var(--border-faint)]">
                  <ArrowRight className="h-3 w-3 rotate-90" />
                </div>
              )}
            </div>
          );
        })}
      </div>

      <p className="mt-10 text-center text-[12px] text-[color:var(--text-muted)]">
        All computation runs entirely on-device ·{" "}
        <span className="text-[color:var(--text-secondary)]">NVIDIA Nemotron-3 Nano 30B</span>
      </p>
    </div>
  );
}
