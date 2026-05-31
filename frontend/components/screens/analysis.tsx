"use client";

import { useEffect, useState } from "react";
import { Check } from "lucide-react";

type AnalysisProps = {
  address: string;
};

// 4 named agent steps with changing status text + timing — ported from the prototype.
const STEPS = [
  {
    name: "Intake + Planning",
    active: "Geocoding via Address Points CKAN… classifying property type (LLM call #1)…",
    done: "detached_urban → QueryPlan: 6 sources queried, 1 skipped (rentsafeto)",
    time: "1.4s",
    ms: 1400,
  },
  {
    name: "Data Retrieval",
    active: "Async fetch: heritage PIP, permits bbox+haversine, dev apps, TRCA GeoJSON…",
    done: "6/6 sources returned · heritage HIGH · flood MEDIUM · 2,340ms total",
    time: "2.3s",
    ms: 2300,
  },
  {
    name: "Analysis + Cost",
    active: "LTT marginal brackets, AV proxy, mortgage 3 scenarios, composites…",
    done: "LTT · property tax · mortgage base · 2 composites scored",
    time: "0.8s",
    ms: 1800,
  },
  {
    name: "Synthesis",
    active: "Synthesizing report with conditional RAG (heritage corpus)… (LLM call #2)",
    done: "Leverage range · negotiation scripts · verdict · all $ from Agent 3",
    time: "2.1s",
    ms: 1600,
  },
];

export function Analysis({ address }: AnalysisProps) {
  const [active, setActive] = useState(0); // index currently running; below it = done

  useEffect(() => {
    let cancelled = false;
    const timers: ReturnType<typeof setTimeout>[] = [];
    let acc = 400;
    STEPS.forEach((step, i) => {
      acc += step.ms;
      timers.push(
        setTimeout(() => {
          if (!cancelled) setActive(i + 1);
        }, acc),
      );
    });
    return () => {
      cancelled = true;
      timers.forEach(clearTimeout);
    };
  }, []);

  return (
    <section className="screen-fade-in mx-auto max-w-[560px] px-8 pt-[120px] text-center">
      <p className="text-xs font-medium uppercase tracking-[0.1em] text-muted">
        {address}
      </p>
      <h2 className="mt-2 text-2xl font-medium tracking-[-0.02em] text-primary">
        Analyzing property risks
      </h2>

      <div className="mt-12 text-left">
        {STEPS.map((step, i) => {
          const state = i < active ? "done" : i === active ? "active" : "waiting";
          return (
            <div
              key={step.name}
              className="flex items-start gap-4 border-b border-line-faint py-5 transition-opacity duration-300"
              style={{ opacity: state === "waiting" ? 0.3 : state === "done" ? 0.6 : 1 }}
            >
              <span
                className={[
                  "font-mono flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[12px] font-medium",
                  state === "done"
                    ? "bg-green-tint text-green [border:1px_solid_rgba(52,211,153,0.3)]"
                    : state === "active"
                      ? "animate-pulse-ring bg-accent text-white"
                      : "border border-line text-muted",
                ].join(" ")}
              >
                {state === "done" ? <Check className="h-3.5 w-3.5" /> : i + 1}
              </span>
              <div className="flex-1 pt-0.5">
                <div className="text-sm font-medium text-primary">{step.name}</div>
                <div
                  className={`font-mono mt-1 min-h-[18px] text-[12px] leading-[1.5] ${
                    state === "active" ? "text-secondary" : "text-muted"
                  }`}
                >
                  {state === "waiting"
                    ? "Waiting…"
                    : state === "active"
                      ? step.active
                      : step.done}
                </div>
              </div>
              {state === "done" && (
                <div className="font-mono shrink-0 pt-0.5 text-[11px] text-muted">
                  {step.time}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <p className="mt-12 text-[13px] text-muted">
        Powered by{" "}
        <span className="font-mono text-secondary">Llama 3.1 8B</span> on{" "}
        <span className="font-mono text-secondary">NVIDIA DGX Spark</span>
      </p>
    </section>
  );
}
