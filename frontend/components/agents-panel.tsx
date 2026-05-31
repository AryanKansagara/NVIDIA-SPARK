"use client";

import { Cpu } from "lucide-react";
import { Panel } from "@/components/ui/panel";
import type { PipelineStep } from "@/lib/report";

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

export function AgentsPanel({ trace }: { trace: PipelineStep[] }) {
  if (!trace || trace.length === 0) return null;

  const maxEnd = Math.max(...trace.map((s) => s.startedMs + s.elapsedMs), 1);
  const groups = [...new Set(trace.map((s) => s.parallelGroup))].sort((a, b) => a - b);

  return (
    <Panel>
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <Cpu className="h-4 w-4 text-moss" />
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-slate">
            Agent pipeline · runs locally on GB10
          </p>
        </div>
        <div className="space-y-3">
          {groups.map((g) => {
            const steps = trace.filter((s) => s.parallelGroup === g);
            return (
              <div key={g}>
                {steps.length > 1 && (
                  <p className="mb-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-moss">
                    {steps.length} agents in parallel
                  </p>
                )}
                {steps.map((s) => (
                  <div key={s.name} className="mb-1.5 flex items-center gap-3">
                    <span className="w-40 shrink-0 text-xs font-medium text-ink">
                      {LABELS[s.name] ?? s.name}
                    </span>
                    <div className="relative h-3 flex-1 overflow-hidden rounded-full bg-mist">
                      <div
                        className="absolute h-full rounded-full bg-gradient-to-r from-moss to-brass"
                        style={{
                          left: `${(s.startedMs / maxEnd) * 100}%`,
                          width: `${Math.max((s.elapsedMs / maxEnd) * 100, 1.5)}%`,
                        }}
                      />
                    </div>
                    <span className="w-16 shrink-0 text-right text-[10px] text-slate">
                      {s.elapsedMs.toFixed(0)} ms
                    </span>
                  </div>
                ))}
              </div>
            );
          })}
        </div>
      </div>
    </Panel>
  );
}
