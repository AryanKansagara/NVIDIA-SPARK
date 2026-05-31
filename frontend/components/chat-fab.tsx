"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { EASE } from "@/lib/motion";
import { MessageSquare, Send, X } from "lucide-react";
import { currency } from "@/lib/format";
import type { MeridianReport } from "@/lib/report";

type Message = { role: "user" | "ai"; text: string };

const SUGGESTIONS = [
  "What's my biggest hidden cost?",
  "How is the leverage calculated?",
  "Explain the renewal risk",
  "Is this a good deal?",
];

// Keyword-matched canned answers, computed from the report (ported pattern from
// the prototype). UI-only — no chat backend yet.
function buildResponder(report: MeridianReport) {
  const k = report.keyNumbers;
  const premium = Math.max(0, report.trueCost - report.inputs.listPrice);
  const responses = {
    cost: `The largest line is the mortgage at ${currency(k.baseMortgageCost10y)} over 10 years, followed by property tax (${currency(k.propertyTax10y)}) and land transfer tax (${currency(k.ltt)}). The transit dividend offsets about ${currency(report.transitDividend)}.`,
    leverage: `Leverage is the documented premium between the ${currency(report.inputs.listPrice)} list price and the ${currency(report.trueCost)} true 10-year cost — about ${currency(premium)}. I present a conservative ${currency(report.leverage.low)}–${currency(report.leverage.high)} range you can defend line-by-line.`,
    renewal: `Two 5-year terms are modeled at a ${report.inputs.mortgageRate.toFixed(2)}% starting rate over a ${report.inputs.amortizationYears}-year amortization. The bear case (+1.5% at renewal) is the main sensitivity — worth pricing in a cushion.`,
    deal: `List is ${currency(report.inputs.listPrice)}; true 10-year cost is ${currency(report.trueCost)} (${report.aboveListPercent}% above list). Verdict: ${report.verdict}. With ${currency(report.leverage.low)}–${currency(report.leverage.high)} in documented leverage, applying the negotiation scripts makes the number substantially more defensible.`,
    confidence: `Each row carries a confidence badge: High means the source returned clean, deterministic data; Medium means it lacked a freshness date; Low means it's an inferred composite signal. Low-confidence signals are still worth raising — the uncertainty itself is leverage.`,
    default: `I can clarify anything in this report — try asking about your biggest cost, how the leverage range is built, the renewal risk, or whether this is a good deal.`,
  };
  return (msg: string) => {
    const m = msg.toLowerCase();
    if (/leverage|negotiat|reduction|premium/.test(m)) return responses.leverage;
    if (/renewal|rate|mortgage|amortiz|interest/.test(m)) return responses.renewal;
    if (/good deal|worth|should i|proceed|offer|buy/.test(m)) return responses.deal;
    if (/confidence|badge|high|medium|low|source/.test(m)) return responses.confidence;
    if (/cost|tax|biggest|expensive|drive/.test(m)) return responses.cost;
    return responses.default;
  };
}

export function ChatFab({ report }: { report: MeridianReport }) {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [typing, setTyping] = useState(false);
  const [draft, setDraft] = useState("");
  const [showSuggestions, setShowSuggestions] = useState(true);
  const taRef = useRef<HTMLTextAreaElement>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const respond = useRef(buildResponder(report));

  // Rebuild the responder and greeting when the report changes.
  useEffect(() => {
    respond.current = buildResponder(report);
    setMessages([
      {
        role: "ai",
        text: `I've finished analyzing ${report.inputs.address}. Found ${report.riskFlags.length} material risk${report.riskFlags.length === 1 ? "" : "s"} worth ${currency(report.leverage.low)}–${currency(report.leverage.high)} in negotiation leverage. What would you like to understand better?`,
      },
    ]);
    setShowSuggestions(true);
  }, [report]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, typing]);

  function send(text: string) {
    const value = text.trim();
    if (!value) return;
    setMessages((m) => [...m, { role: "user", text: value }]);
    setDraft("");
    setShowSuggestions(false);
    if (taRef.current) taRef.current.style.height = "auto";
    setTyping(true);
    setTimeout(() => {
      setTyping(false);
      setMessages((m) => [...m, { role: "ai", text: respond.current(value) }]);
    }, 1000);
  }

  function autoResize() {
    const ta = taRef.current;
    if (!ta) return;
    ta.style.height = "auto";
    ta.style.height = `${Math.min(ta.scrollHeight, 80)}px`;
  }

  return (
    <>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: 16, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 16, scale: 0.97 }}
            transition={{ duration: 0.25, ease: EASE }}
            className="fixed bottom-[92px] right-7 z-[200] flex h-[480px] w-[min(380px,calc(100vw-2rem))] flex-col overflow-hidden rounded-xl border border-line bg-surface shadow-2xl backdrop-blur-xl"
          >
            {/* Header */}
            <div className="flex items-center justify-between border-b border-line-faint bg-surface-raised px-5 py-4">
              <div className="flex items-center gap-2.5">
                <span className="flex h-[30px] w-[30px] items-center justify-center rounded-full border border-[rgba(82,102,235,0.25)] bg-accent-subtle">
                  <svg viewBox="0 0 14 14" fill="none" className="h-3.5 w-3.5 text-accent-light">
                    <circle cx="7" cy="7" r="5" stroke="currentColor" strokeWidth="1.4" />
                    <circle cx="7" cy="7" r="2" fill="currentColor" />
                  </svg>
                </span>
                <div>
                  <div className="text-sm font-medium text-primary">Meridian</div>
                  <div className="flex items-center gap-1.5 text-[11px] text-green">
                    <span className="h-[5px] w-[5px] rounded-full bg-green" />
                    Ready to answer
                  </div>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Close chat"
                className="text-muted transition hover:text-secondary"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Messages */}
            <div className="flex flex-1 flex-col gap-3 overflow-y-auto p-4">
              {messages.map((m, i) => (
                <div
                  key={i}
                  className={`flex max-w-[88%] flex-col gap-1 ${m.role === "user" ? "self-end items-end" : "self-start items-start"}`}
                >
                  <p
                    className={[
                      "px-3.5 py-2.5 text-sm leading-[1.55]",
                      m.role === "user"
                        ? "rounded-2xl rounded-br-[4px] bg-accent text-white"
                        : "rounded-2xl rounded-bl-[4px] border border-line-faint bg-surface-raised text-secondary",
                    ].join(" ")}
                  >
                    {m.text}
                  </p>
                </div>
              ))}

              {typing && (
                <div className="flex items-center gap-1 self-start rounded-2xl rounded-bl-[4px] border border-line-faint bg-surface-raised px-3.5 py-2.5">
                  {[0, 1, 2].map((i) => (
                    <span
                      key={i}
                      className="h-[5px] w-[5px] rounded-full bg-muted animate-typing-bounce"
                      style={{ animationDelay: `${i * 0.2}s` }}
                    />
                  ))}
                </div>
              )}
              <div ref={endRef} />
            </div>

            {/* Suggestions */}
            {showSuggestions && (
              <div className="flex flex-wrap gap-1.5 px-4 pb-3">
                {SUGGESTIONS.map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => send(s)}
                    className="rounded-pill border border-[rgba(82,102,235,0.18)] bg-accent-subtle px-3 py-1.5 text-xs text-accent-light transition hover:bg-accent-tint"
                  >
                    {s}
                  </button>
                ))}
              </div>
            )}

            {/* Input */}
            <div className="flex items-end gap-2 border-t border-line-faint p-3">
              <textarea
                ref={taRef}
                value={draft}
                rows={1}
                onChange={(e) => {
                  setDraft(e.target.value);
                  autoResize();
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    send(draft);
                  }
                }}
                placeholder="Ask about this report…"
                className="max-h-20 min-h-[40px] flex-1 resize-none rounded-md border border-line bg-surface-raised px-3.5 py-2.5 text-sm text-primary outline-none transition placeholder:text-muted focus:[border-color:var(--border-focus)]"
              />
              <button
                type="button"
                onClick={() => send(draft)}
                aria-label="Send"
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent text-white transition hover:scale-105 hover:opacity-[0.88]"
              >
                <Send className="h-4 w-4" />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <motion.button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label="Ask a follow-up question"
        whileHover={{ scale: 1.07 }}
        whileTap={{ scale: 0.95 }}
        className="fixed bottom-7 right-7 z-[200] flex h-[52px] w-[52px] items-center justify-center rounded-full bg-accent text-white shadow-[0_4px_24px_rgba(82,102,235,0.45)]"
      >
        {!open && (
          <span className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full border-2 border-[var(--bg)] bg-green" />
        )}
        {open ? <X className="h-5 w-5" /> : <MessageSquare className="h-[22px] w-[22px]" />}
      </motion.button>
    </>
  );
}
