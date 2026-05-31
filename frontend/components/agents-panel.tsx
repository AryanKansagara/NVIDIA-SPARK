"use client";

import { useState } from "react";
import { ChevronDown, Cpu } from "lucide-react";
import type { AgentReasoning, PipelineStep } from "@/lib/report";

const LABELS: Record<string, string> = {
  geocode: "Geocoder",
  heritage: "Heritage agent",
  flood: "Flood agent",
  development: "Development agent",
  engine: "Cost engine",
  monte_carlo: "GPU Monte Carlo",
  rag: "RAG grounding",
  synthesis: "Nemotron synthesis",
};

const modeTone = (mode: string) =>
  mode.startsWith("LLM")
    ? "border-[rgba(82,102,235,0.25)] bg-[color:var(--accent-subtle)] text-[color:var(--accent-light)]"
    : "border-[color:var(--border-faint)] bg-[color:var(--surface-raised)] text-[color:var(--text-muted)]";

export function AgentsPanel({
  trace,
  reasoning = [],
}: {
  trace: PipelineStep[];
  reasoning?: AgentReasoning[];
}) {
  const [open, setOpen] = useState(true);
  const hasReasoning = reasoning.length > 0;
  if ((!trace || trace.length === 0) && !hasReasoning) return null;

  const maxEnd = Math.max(...(trace ?? []).map((s) => s.startedMs + s.elapsedMs), 1);
  const groups = [...new Set((trace ?? []).map((s) => s.parallelGroup))].sort((a, b) => a - b);

  return (
    <div className="overflow-hidden rounded-lg border border-[color:var(--border)] bg-[color:var(--surface)]">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between px-6 py-4"
        aria-expanded={open}
      >
        <span className="flex items-center gap-2.5">
          <Cpu className="h-4 w-4 text-[color:var(--accent-light)]" />
          <span className="text-[13px] font-medium text-[color:var(--text-secondary)]">
            How Meridian reached this verdict
          </span>
          <span className="hidden items-center gap-1.5 rounded-pill border border-[rgba(82,102,235,0.2)] bg-[color:var(--accent-subtle)] px-2.5 py-1 text-[11px] text-[color:var(--accent-light)] sm:inline-flex">
            runs locally on GB10
          </span>
        </span>
        <ChevronDown
          className={`no-print h-3.5 w-3.5 text-[color:var(--text-muted)] transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>
      {/* Always rendered so PDF export can reveal it; hidden on screen when collapsed.
          `.pdf-export .agents-detail` (globals.css) forces it visible during capture. */}
      <div className={`agents-detail ${open ? "" : "hidden"}`}>
        {hasReasoning && (
          <div className="divide-y divide-[color:var(--border-faint)] border-t border-[color:var(--border-faint)]">
            {reasoning.map((a) => (
              <div key={a.agent} className="px-6 py-4">
                <div className="mb-1.5 flex items-center gap-2.5">
                  <span className="text-[12px] font-semibold uppercase tracking-[0.08em] text-[color:var(--accent-light)]">
                    {a.title}
                  </span>
                  <span className={`rounded-pill border px-2 py-0.5 text-[10px] font-medium ${modeTone(a.mode)}`}>
                    {a.mode}
                  </span>
                </div>
                <p className="text-[13px] leading-relaxed text-[color:var(--text-secondary)]">{a.body}</p>
              </div>
            ))}
          </div>
        )}
        {trace && trace.length > 0 && (
        <div className="space-y-3 border-t border-[color:var(--border-faint)] px-6 py-5">
          <p className="text-[10px] font-medium uppercase tracking-[0.14em] text-[color:var(--text-muted)]">
            Pipeline timing
          </p>
          {groups.map((g) => {
            const steps = trace.filter((s) => s.parallelGroup === g);
            return (
              <div key={g}>
                {steps.length > 1 && (
                  <p className="mb-1 text-[10px] font-medium uppercase tracking-[0.14em] text-[color:var(--accent-light)]">
                    {steps.length} agents in parallel
                  </p>
                )}
                {steps.map((s) => (
                  <div key={s.name} className="mb-1.5 flex items-center gap-3">
                    <span className="w-40 shrink-0 text-xs font-medium text-[color:var(--text-primary)]">
                      {LABELS[s.name] ?? s.name}
                    </span>
                    <div className="relative h-2.5 flex-1 overflow-hidden rounded-full bg-[color:var(--surface-raised)]">
                      <div
                        className="absolute h-full rounded-full bg-[color:var(--accent)]"
                        style={{
                          left: `${(s.startedMs / maxEnd) * 100}%`,
                          width: `${Math.max((s.elapsedMs / maxEnd) * 100, 1.5)}%`,
                        }}
                      />
                    </div>
                    <span className="w-16 shrink-0 text-right font-mono text-[10px] text-[color:var(--text-muted)]">
                      {s.elapsedMs.toFixed(0)} ms
                    </span>
                  </div>
                ))}
              </div>
            );
          })}
        </div>
        )}
      </div>
    </div>
  );
}
