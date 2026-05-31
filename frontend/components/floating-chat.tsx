"use client";

import { useEffect, useRef, useState } from "react";
import { sendChat, type ChatSource } from "@/lib/api";
import type { MeridianReport } from "@/lib/report";

type Message = { role: "user" | "assistant"; content: string; sources?: ChatSource[] };

const cad = (v: number) =>
  new Intl.NumberFormat("en-CA", { style: "currency", currency: "CAD", maximumFractionDigits: 0 }).format(v);

function getSessionId(): string {
  if (typeof window === "undefined") return "default";
  let id = localStorage.getItem("meridian_session");
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem("meridian_session", id);
  }
  return id;
}

/** Compact, exact-figure context the model can ground answers in. */
function buildReportContext(r: MeridianReport): string {
  const topDrivers = [...r.components]
    .sort((a, b) => b.value - a.value)
    .slice(0, 4)
    .map((c) => `${c.label}: ${cad(c.value)}`)
    .join(", ");
  const flags = [
    ...r.flags.red.map((f) => `RED: ${f}`),
    ...r.flags.yellow.map((f) => `YELLOW: ${f}`),
    ...r.flags.green.map((f) => `GREEN: ${f}`),
  ].join(" | ");
  const mc = r.monteCarlo
    ? `P10 ${cad(r.monteCarlo.p10)}, P50 ${cad(r.monteCarlo.p50)}, P90 ${cad(r.monteCarlo.p90)}`
    : "n/a";
  return [
    `Address: ${r.inputs.address}`,
    `List price: ${cad(r.inputs.listPrice)}`,
    `True 10-year cost of ownership: ${cad(r.trueCost)} (${r.aboveListPercent}% vs list)`,
    `Land transfer tax: ${cad(r.keyNumbers.ltt)}`,
    `Property tax (10y): ${cad(r.keyNumbers.propertyTax10y)}`,
    `CMHC insured premium: ${cad(r.keyNumbers.insuredPremium)}`,
    `Base mortgage cost (10y): ${cad(r.keyNumbers.baseMortgageCost10y)}`,
    `Transit dividend: ${cad(r.transitDividend)}`,
    `Largest cost drivers: ${topDrivers}`,
    `Monte Carlo 10y range: ${mc}`,
    `Risk flags: ${flags || "none"}`,
    r.summary ? `Narrative: ${r.summary}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

function suggestedPrompts(r: MeridianReport): string[] {
  const prompts = ["What's driving my true 10-year cost?", "How does this compare to the list price?"];
  const topFlag = r.flags.red[0] ?? r.flags.yellow[0];
  if (topFlag) prompts.push(`What does the "${topFlag}" flag mean for me?`);
  prompts.push("Why is the land transfer tax this much?");
  prompts.push("What should I do before closing?");
  return prompts.slice(0, 4);
}

export function FloatingChat({ report }: { report: MeridianReport }) {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [pending, setPending] = useState(false);
  const [webSearch, setWebSearch] = useState(false);
  const sessionRef = useRef("default");
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    sessionRef.current = getSessionId();
  }, []);
  useEffect(() => {
    if (open) endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, pending, open]);

  async function send(text: string) {
    const msg = text.trim();
    if (!msg || pending) return;
    setInput("");
    setMessages((m) => [...m, { role: "user", content: msg }]);
    setPending(true);
    try {
      const { reply, sources } = await sendChat(
        sessionRef.current,
        msg,
        webSearch,
        buildReportContext(report),
      );
      setMessages((m) => [...m, { role: "assistant", content: reply, sources }]);
    } catch {
      setMessages((m) => [
        ...m,
        { role: "assistant", content: "⚠️ The local Nemotron model isn't reachable right now." },
      ]);
    } finally {
      setPending(false);
    }
  }

  return (
    <>
      {/* Launcher — always visible, bottom-right */}
      <button
        onClick={() => setOpen((v) => !v)}
        aria-label="Open Meridian chat"
        className="fixed bottom-6 right-6 z-50 flex items-center gap-2 rounded-full bg-ink px-5 py-3.5 text-sm font-semibold text-mist shadow-panel transition-transform hover:scale-105"
      >
        <span className="text-lg">{open ? "✕" : "💬"}</span>
        {!open && "Meridian chat"}
      </button>

      {open && (
        <div className="fixed bottom-24 right-6 z-50 flex h-[70vh] max-h-[640px] w-[min(92vw,400px)] flex-col rounded-3xl border border-[#D7E7E2] bg-white shadow-panel">
          <div className="border-b border-[#D7E7E2] px-5 py-4">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-moss">
              Local Nemotron · grounded in this report
            </p>
            <h2 className="font-display text-lg text-ink">Ask about this property</h2>
            <p className="truncate text-xs text-slate">{report.inputs.address}</p>
          </div>

          <div className="flex-1 space-y-3 overflow-y-auto px-5 py-4">
            {messages.length === 0 && (
              <div className="space-y-2">
                <p className="text-xs text-slate/70">Try asking:</p>
                {suggestedPrompts(report).map((q) => (
                  <button
                    key={q}
                    onClick={() => send(q)}
                    className="block w-full rounded-2xl border border-[#D7E7E2] bg-[#F7FAF8] px-3 py-2 text-left text-xs text-ink transition-colors hover:border-moss"
                  >
                    {q}
                  </button>
                ))}
              </div>
            )}
            {messages.map((m, i) => (
              <div
                key={i}
                className={`max-w-[88%] rounded-2xl px-3.5 py-2 text-sm leading-relaxed ${
                  m.role === "user"
                    ? "ml-auto bg-ink text-mist"
                    : "mr-auto border border-[#D7E7E2] bg-[#F7FAF8] text-ink"
                }`}
              >
                {m.content}
                {m.role === "assistant" && m.sources && m.sources.length > 0 && (
                  <div className="mt-2 border-t border-[#D7E7E2] pt-2">
                    <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-moss">
                      Grounded in {m.sources.length} source{m.sources.length > 1 ? "s" : ""}
                    </p>
                    {m.sources.map((s, j) => (
                      <details key={j} className="text-[11px] text-slate">
                        <summary className="cursor-pointer truncate text-moss">📄 {s.source}</summary>
                        <p className="mt-1 leading-snug text-slate/80">{s.text.slice(0, 280)}…</p>
                      </details>
                    ))}
                  </div>
                )}
              </div>
            ))}
            {pending && (
              <div className="mr-auto rounded-2xl border border-[#D7E7E2] bg-[#F7FAF8] px-3.5 py-2 text-sm text-slate">
                Thinking…
              </div>
            )}
            <div ref={endRef} />
          </div>

          <div className="border-t border-[#D7E7E2] px-4 py-3">
            <div className="mb-2 flex items-center justify-between">
              <button
                type="button"
                onClick={() => setWebSearch((v) => !v)}
                aria-pressed={webSearch}
                className={`flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold transition-colors ${
                  webSearch ? "border-moss bg-moss text-mist" : "border-[#D7E7E2] bg-white text-slate hover:border-moss"
                }`}
              >
                🌐 Web {webSearch ? "on" : "off"}
              </button>
              <span className="text-[10px] text-slate/60">Runs on-device</span>
            </div>
            <div className="flex gap-2">
              <input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && send(input)}
                placeholder="Ask about this report…"
                className="flex-1 rounded-2xl border border-[#D7E7E2] bg-white/80 px-3.5 py-2.5 text-sm text-ink outline-none focus:border-moss"
              />
              <button
                onClick={() => send(input)}
                disabled={pending}
                className="rounded-2xl bg-ink px-4 py-2.5 text-sm font-semibold text-mist transition-opacity hover:opacity-90 disabled:opacity-50"
              >
                Send
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
