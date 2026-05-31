"use client";

import { useEffect, useRef, useState } from "react";
import { Globe, MessageSquare, Send, X } from "lucide-react";
import { sendChat, type ChatSource } from "@/lib/api";
import type { MeridianReport } from "@/lib/report";
import { useRouter } from "next/navigation";
import { useApp } from "@/lib/app-context";
import { MicButton } from "@/components/mic-button";

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

/** Compact, exact-figure context the model grounds answers in (no invented $). */
function buildReportContext(r: MeridianReport): string {
  const topDrivers = [...r.components]
    .sort((a, b) => b.value - a.value)
    .slice(0, 4)
    .map((c) => `${c.label}: ${cad(c.value)}`)
    .join(", ");
  const flags = r.flags
    .map((f) => `${f.severity.toUpperCase()}: ${f.title} — ${f.message}`)
    .join(" | ");
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

function suggestedPrompts(r: MeridianReport | null): string[] {
  if (!r) {
    return [
      "What can you help me with?",
      "How is the true 10-year cost calculated?",
      "What Toronto property risks should I watch for?",
      "Analyze a Toronto address for me",
    ];
  }
  const prompts = ["What's driving my true cost across horizons?", "How does this compare to the list price?"];
  const topFlag = r.flags.find((f) => f.severity === "red") ?? r.flags.find((f) => f.severity === "yellow");
  if (topFlag) prompts.push(`What does this flag mean: ${topFlag.title}?`);
  prompts.push("What should I do before closing?");
  return prompts.slice(0, 4);
}

export function FloatingChat() {
  const { activeReport: report } = useApp();
  const router = useRouter();
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
        report ? buildReportContext(report) : "",
      );
      setMessages((m) => [...m, { role: "assistant", content: reply, sources }]);
    } catch {
      setMessages((m) => [
        ...m,
        { role: "assistant", content: "⚠️ The local Nemotron model isn't reachable right now. The report above is still fully computed from real data." },
      ]);
    } finally {
      setPending(false);
    }
  }

  /**
   * Voice transcript handler with lightweight spoken-intent routing. Recognizes a
   * few navigation/action commands ("go to reports", "open my profile", "analyze …")
   * and drives the app via the router; otherwise the transcript fills the chat box.
   */
  function handleTranscript(text: string) {
    const t = text.toLowerCase().trim();
    const go = (path: string) => {
      setOpen(false);
      router.push(path);
    };
    if (/\b(go to|open|show|view)\b.*\breports?\b/.test(t)) return go("/reports");
    if (/\b(go to|open|show|view)\b.*\b(profile|my profile|account)\b/.test(t)) return go("/profile");
    if (/\b(go to|open|show|view)\b.*\b(chat|assistant)\b/.test(t)) return go("/chat");
    if (/\b(go|back|take me)\b.*\b(home|landing|start)\b/.test(t)) return go("/");
    const analyze = t.match(/\b(analyze|analyse|look up|check)\b\s+(.*)/);
    if (analyze && analyze[2]) {
      setOpen(false);
      router.push(`/analyze?address=${encodeURIComponent(analyze[2].trim())}`);
      return;
    }
    // No intent matched — treat as a normal dictated message.
    setInput(text);
  }

  return (
    <>
      <button
        onClick={() => setOpen((v) => !v)}
        aria-label="Open Meridian chat"
        className="no-print fixed bottom-6 right-6 z-[1000] flex items-center gap-2 rounded-pill bg-[color:var(--accent)] px-5 py-3.5 text-sm font-medium text-white shadow-panel transition-transform hover:scale-105"
      >
        {open ? <X className="h-4 w-4" /> : <MessageSquare className="h-4 w-4" />}
        {!open && "Meridian chat"}
      </button>

      {open && (
        <div className="no-print animate-chat-slide-in fixed bottom-24 right-6 z-[1000] flex h-[70vh] max-h-[640px] w-[min(92vw,400px)] flex-col overflow-hidden rounded-xl border border-[color:var(--border)] bg-[color:var(--surface)] shadow-panel">
          <div className="flex items-center gap-3 border-b border-[color:var(--border-faint)] bg-[color:var(--surface-raised)] px-5 py-4">
            <span className="flex h-8 w-8 items-center justify-center rounded-full border border-[rgba(82,102,235,0.25)] bg-[color:var(--accent-subtle)]">
              <MessageSquare className="h-4 w-4 text-[color:var(--accent-light)]" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-[color:var(--text-primary)]">Meridian</p>
              <p className="flex items-center gap-1.5 text-[11px] text-[color:var(--green)]">
                <span className="h-1.5 w-1.5 rounded-full bg-[color:var(--green)]" />
                {report ? "Grounded in this report" : "On-device assistant"}
              </p>
            </div>
            <button onClick={() => setOpen(false)} className="text-[color:var(--text-muted)]">
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="flex-1 space-y-3 overflow-y-auto px-4 py-4">
            {messages.length === 0 && (
              <div className="space-y-2">
                <p className="text-xs text-[color:var(--text-muted)]">Try asking:</p>
                {suggestedPrompts(report).map((q) => (
                  <button
                    key={q}
                    onClick={() => send(q)}
                    className="block w-full rounded-pill border border-[rgba(82,102,235,0.18)] bg-[color:var(--accent-subtle)] px-3 py-2 text-left text-xs text-[color:var(--accent-light)] transition-colors hover:bg-[rgba(82,102,235,0.2)]"
                  >
                    {q}
                  </button>
                ))}
              </div>
            )}
            {messages.map((m, i) => (
              <div
                key={i}
                className={`max-w-[88%] rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed ${
                  m.role === "user"
                    ? "ml-auto rounded-br-sm bg-[color:var(--accent)] text-white"
                    : "mr-auto rounded-bl-sm border border-[color:var(--border-faint)] bg-[color:var(--surface-raised)] text-[color:var(--text-secondary)]"
                }`}
              >
                {m.content}
                {m.role === "assistant" && m.sources && m.sources.length > 0 && (
                  <div className="mt-2 border-t border-[color:var(--border-faint)] pt-2">
                    <p className="mb-1 text-[10px] font-medium uppercase tracking-wide text-[color:var(--green)]">
                      Grounded in {m.sources.length} source{m.sources.length > 1 ? "s" : ""}
                    </p>
                    {m.sources.map((s, j) => (
                      <details key={j} className="text-[11px] text-[color:var(--text-muted)]">
                        <summary className="cursor-pointer truncate text-[color:var(--accent-light)]">
                          {s.source}
                        </summary>
                        <p className="mt-1 leading-snug">{s.text.slice(0, 280)}…</p>
                      </details>
                    ))}
                  </div>
                )}
              </div>
            ))}
            {pending && (
              <div className="mr-auto flex items-center gap-1 rounded-2xl rounded-bl-sm border border-[color:var(--border-faint)] bg-[color:var(--surface-raised)] px-3.5 py-3">
                {[0, 1, 2].map((d) => (
                  <span
                    key={d}
                    className="h-1.5 w-1.5 animate-typing-bounce rounded-full bg-[color:var(--text-muted)]"
                    style={{ animationDelay: `${d * 0.2}s` }}
                  />
                ))}
              </div>
            )}
            <div ref={endRef} />
          </div>

          <div className="border-t border-[color:var(--border-faint)] px-4 py-3">
            <div className="mb-2 flex items-center justify-between">
              <button
                type="button"
                onClick={() => setWebSearch((v) => !v)}
                aria-pressed={webSearch}
                className={`flex items-center gap-1.5 rounded-pill border px-2.5 py-1 text-[11px] font-medium transition-colors ${
                  webSearch
                    ? "border-[color:var(--accent)] bg-[color:var(--accent)] text-white"
                    : "border-[color:var(--border-faint)] text-[color:var(--text-muted)] hover:border-[color:var(--border)]"
                }`}
              >
                <Globe className="h-3 w-3" /> Web {webSearch ? "on" : "off"}
              </button>
              <span className="text-[10px] text-[color:var(--text-muted)]">Runs on-device</span>
            </div>
            <div className="flex gap-2">
              <input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && send(input)}
                placeholder={report ? "Ask about this report…" : "Ask Meridian anything…"}
                className="flex-1 rounded-md border border-[color:var(--border)] bg-[color:var(--surface-raised)] px-3.5 py-2.5 text-sm text-[color:var(--text-primary)] outline-none focus:border-[color:var(--border-focus)]"
              />
              <MicButton onTranscript={handleTranscript} title="Speak to Meridian" />
              <button
                onClick={() => send(input)}
                disabled={pending}
                className="flex h-10 w-10 items-center justify-center rounded-full bg-[color:var(--accent)] text-white transition-opacity hover:opacity-90 disabled:opacity-50"
              >
                <Send className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
