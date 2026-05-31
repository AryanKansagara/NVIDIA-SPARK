"use client";

import { useState } from "react";
import { ChevronUp, Database, Sparkles } from "lucide-react";
import { Panel } from "@/components/ui/panel";
import { Pill } from "@/components/ui/pill";
import type { MeridianReasoning, ReasoningBadge } from "@/lib/report";

type AgentReasoningPanelProps = {
  reasoning: MeridianReasoning;
};

const toneMap: Record<
  NonNullable<ReasoningBadge["tone"]>,
  "neutral" | "red" | "yellow" | "green"
> = {
  neutral: "neutral",
  red: "red",
  yellow: "yellow",
  green: "green",
  blue: "neutral",
};

export function AgentReasoningPanel({
  reasoning,
}: AgentReasoningPanelProps) {
  const [isOpen, setIsOpen] = useState(true);

  return (
    <section className="space-y-3">
      <div className="flex items-center gap-3">
        <p className="text-sm font-semibold uppercase tracking-[0.22em] text-slate">
          Agent Reasoning
        </p>
        <div className="h-px flex-1 bg-[#D7E7E2]" />
      </div>
      <Panel className="overflow-hidden border-[#D7E7E2] bg-white/72 p-0">
        <div className="flex flex-col gap-4 border-b border-[#D7E7E2] px-5 py-5 md:flex-row md:items-center md:justify-between md:px-6">
          <div className="space-y-3">
            <h3 className="font-display text-2xl text-ink">
              How Meridian reached this verdict
            </h3>
            <div className="flex flex-wrap gap-2">
              <Pill>
                <span className="inline-flex items-center gap-1">
                  <Database className="h-3 w-3" />
                  {reasoning.meta.sourceCount} sources
                </span>
              </Pill>
              <Pill tone={reasoning.meta.executionMode === "live" ? "green" : "yellow"}>
                {reasoning.meta.executionMode === "live"
                  ? "Live backend"
                  : "Preview mode"}
              </Pill>
              <Pill tone="neutral">
                <span className="inline-flex items-center gap-1">
                  <Sparkles className="h-3 w-3" />
                  {reasoning.meta.modelStatus}
                </span>
              </Pill>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setIsOpen((current) => !current)}
            className="inline-flex items-center gap-2 self-start rounded-full border border-[#D7E7E2] bg-[#F7FAF8] px-4 py-2 text-sm text-slate transition hover:border-moss hover:text-ink"
          >
            {isOpen ? "Hide reasoning" : "Show reasoning"}
            <ChevronUp
              className={`h-4 w-4 transition ${isOpen ? "" : "rotate-180"}`}
            />
          </button>
        </div>
        {isOpen ? (
          <div>
            {reasoning.agents.map((agent, index) => (
              <div
                key={agent.title}
                className={`space-y-4 px-5 py-5 md:px-6 ${
                  index < reasoning.agents.length - 1
                    ? "border-b border-[#E3EEE9]"
                    : ""
                }`}
              >
                <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                  <div className="space-y-1">
                    <p className="text-sm font-semibold uppercase tracking-[0.16em] text-[#5065D6]">
                      {agent.title}
                    </p>
                    <p className="text-sm text-slate">
                      {agent.mode} · {agent.status}
                    </p>
                  </div>
                  {agent.badges?.length ? (
                    <div className="flex flex-wrap gap-2">
                      {agent.badges.map((badge) => (
                        <Pill
                          key={`${agent.title}-${badge.label}`}
                          tone={toneMap[badge.tone ?? "neutral"]}
                        >
                          {badge.label}
                        </Pill>
                      ))}
                    </div>
                  ) : null}
                </div>
                <div className="space-y-2">
                  {agent.lines.map((line) => (
                    <p
                      key={`${agent.title}-${line}`}
                      className="text-sm leading-7 text-slate"
                    >
                      {line}
                    </p>
                  ))}
                </div>
              </div>
            ))}
          </div>
        ) : null}
      </Panel>
    </section>
  );
}
