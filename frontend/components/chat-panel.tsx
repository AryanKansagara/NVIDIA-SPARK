"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { Globe, Send, Plus, MessageSquare, Trash2, Sparkles, ChevronLeft } from "lucide-react";
import { sendChat, type ChatSource } from "@/lib/api";
import { useApp } from "@/lib/app-context";
import { MicButton } from "@/components/mic-button";
import type { MeridianReport } from "@/lib/report";

type Message = { role: "user" | "assistant"; content: string; sources?: ChatSource[] };
type Conversation = { id: string; title: string; messages: Message[]; createdAt: number };

const SESSIONS_KEY = "meridian_chat_sessions";
const SESSION_KEY = "meridian_session";

function getOrCreateSessionId(): string {
  if (typeof window === "undefined") return "default";
  let id = localStorage.getItem(SESSION_KEY);
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem(SESSION_KEY, id);
  }
  return id;
}

function loadConversations(): Conversation[] {
  if (typeof window === "undefined") return [];
  try {
    return JSON.parse(localStorage.getItem(SESSIONS_KEY) ?? "[]");
  } catch {
    return [];
  }
}

function saveConversations(convs: Conversation[]) {
  localStorage.setItem(SESSIONS_KEY, JSON.stringify(convs));
}

const cad = (v: number) =>
  new Intl.NumberFormat("en-CA", { style: "currency", currency: "CAD", maximumFractionDigits: 0 }).format(v);

function buildReportContext(r: MeridianReport): string {
  return [
    `Address: ${r.inputs.address}`,
    `List price: ${cad(r.inputs.listPrice)}`,
    `True 10-year cost: ${cad(r.trueCost)} (${r.aboveListPercent}% vs list)`,
    `LTT: ${cad(r.keyNumbers.ltt)} · Property tax 10y: ${cad(r.keyNumbers.propertyTax10y)}`,
    `CMHC premium: ${cad(r.keyNumbers.insuredPremium)} · Transit dividend: ${cad(r.transitDividend)}`,
    r.monteCarlo ? `Monte Carlo P10/P50/P90: ${cad(r.monteCarlo.p10)} / ${cad(r.monteCarlo.p50)} / ${cad(r.monteCarlo.p90)}` : "",
    r.summary ? `Narrative: ${r.summary.slice(0, 400)}` : "",
  ].filter(Boolean).join("\n");
}

const SEED_PROMPTS = [
  "What hidden costs do first-time buyers often miss in Toronto?",
  "How does the transit dividend affect my true cost of ownership?",
  "What should I know about FHSA before buying my first home?",
  "How does flood risk affect property value in Toronto?",
  "What are the land transfer tax implications for investors?",
  "Explain CMHC mortgage insurance — when can I avoid it?",
];

/* ── Markdown-lite renderer for chat messages ─────────────────── */
function ChatMarkdown({ text }: { text: string }) {
  const lines = text.split("\n");
  return (
    <div className="space-y-1.5 text-[14px] leading-relaxed">
      {lines.map((line, i) => {
        if (line.startsWith("### ")) return <p key={i} className="font-semibold text-[color:var(--text-primary)] text-[13px] mt-2">{line.slice(4)}</p>;
        if (line.startsWith("## ")) return <p key={i} className="font-bold mt-2">{line.slice(3)}</p>;
        if (line.startsWith("- ") || line.startsWith("* ")) {
          return (
            <div key={i} className="flex items-start gap-1.5">
              <span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-current opacity-50" />
              <span>{renderInline(line.slice(2))}</span>
            </div>
          );
        }
        if (!line.trim()) return <div key={i} className="h-1" />;
        return <p key={i}>{renderInline(line)}</p>;
      })}
    </div>
  );
}

function renderInline(text: string): React.ReactNode {
  const parts = text.split(/(\*\*[^*]+\*\*|\*[^*]+\*)/g);
  return (
    <>
      {parts.map((part, i) => {
        if (/^\*\*[^*]+\*\*$/.test(part)) return <strong key={i} className="font-semibold">{part.slice(2, -2)}</strong>;
        if (/^\*[^*]+\*$/.test(part)) return <em key={i}>{part.slice(1, -1)}</em>;
        return <span key={i}>{part}</span>;
      })}
    </>
  );
}

export function ChatPanel() {
  const { activeReport } = useApp();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [input, setInput] = useState("");
  const [pending, setPending] = useState(false);
  const [webSearch, setWebSearch] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const sessionRef = useRef("default");
  const endRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Load persisted conversations on mount
  useEffect(() => {
    const stored = loadConversations();
    setConversations(stored);
    sessionRef.current = getOrCreateSessionId();
    if (stored.length > 0) {
      setActiveId(stored[stored.length - 1].id);
    } else {
      newConversation(stored);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [conversations, pending, activeId]);

  const activeConv = conversations.find((c) => c.id === activeId) ?? null;
  const messages = activeConv?.messages ?? [];

  const persistConversations = useCallback((convs: Conversation[]) => {
    setConversations(convs);
    saveConversations(convs);
  }, []);

  function newConversation(existing?: Conversation[]) {
    const id = crypto.randomUUID();
    const conv: Conversation = { id, title: "New conversation", messages: [], createdAt: Date.now() };
    const base = existing ?? conversations;
    persistConversations([...base, conv]);
    setActiveId(id);
    setTimeout(() => inputRef.current?.focus(), 50);
    return id;
  }

  function deleteConversation(id: string) {
    const next = conversations.filter((c) => c.id !== id);
    persistConversations(next);
    if (activeId === id) {
      setActiveId(next.length > 0 ? next[next.length - 1].id : null);
      if (next.length === 0) newConversation(next);
    }
  }

  async function send(text?: string) {
    const msg = (text ?? input).trim();
    if (!msg || pending) return;
    setInput("");

    // Add user message
    const userMsg: Message = { role: "user", content: msg };
    const updatedConvs = conversations.map((c) =>
      c.id === activeId
        ? {
            ...c,
            messages: [...c.messages, userMsg],
            title: c.messages.length === 0 ? msg.slice(0, 48) : c.title,
          }
        : c,
    );
    persistConversations(updatedConvs);
    setPending(true);

    const reportCtx = activeReport ? buildReportContext(activeReport) : undefined;
    try {
      const { reply, sources } = await sendChat(sessionRef.current, msg, webSearch, reportCtx);
      const assistantMsg: Message = { role: "assistant", content: reply, sources };
      persistConversations(
        updatedConvs.map((c) =>
          c.id === activeId ? { ...c, messages: [...c.messages, assistantMsg] } : c,
        ),
      );
    } catch {
      persistConversations(
        updatedConvs.map((c) =>
          c.id === activeId
            ? {
                ...c,
                messages: [
                  ...c.messages,
                  { role: "assistant", content: "⚠️ The local Nemotron model isn't reachable right now." },
                ],
              }
            : c,
        ),
      );
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="flex h-screen bg-[color:var(--bg)]">
      {/* ── Sidebar ───────────────────────────────────────────── */}
      <aside
        className={`flex flex-col border-r border-[color:var(--border-faint)] bg-[color:var(--surface)] transition-all duration-300 ${
          sidebarOpen ? "w-64 min-w-[16rem]" : "w-0 min-w-0 overflow-hidden"
        }`}
      >
        {/* Sidebar header */}
        <div className="flex items-center justify-between border-b border-[color:var(--border-faint)] px-4 py-4">
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-[color:var(--accent)]" />
            <span className="text-sm font-semibold text-[color:var(--text-primary)]">Meridian</span>
          </div>
          <button
            onClick={() => newConversation()}
            title="New chat"
            className="flex h-7 w-7 items-center justify-center rounded-md border border-[color:var(--border-faint)] text-[color:var(--text-muted)] transition-colors hover:border-[color:var(--accent)] hover:text-[color:var(--accent)]"
          >
            <Plus className="h-3.5 w-3.5" />
          </button>
        </div>

        {/* Conversation list */}
        <div className="flex-1 overflow-y-auto py-2">
          {conversations.length === 0 && (
            <p className="px-4 py-3 text-xs text-[color:var(--text-muted)]">No conversations yet.</p>
          )}
          {[...conversations].reverse().map((c) => (
            <div
              key={c.id}
              onClick={() => setActiveId(c.id)}
              className={`group flex cursor-pointer items-center gap-2 px-3 py-2.5 transition-colors ${
                c.id === activeId
                  ? "bg-[color:var(--accent-subtle)] text-[color:var(--accent-light)]"
                  : "text-[color:var(--text-secondary)] hover:bg-[color:var(--surface-raised)]"
              }`}
            >
              <MessageSquare className="h-3.5 w-3.5 shrink-0 opacity-60" />
              <span className="min-w-0 flex-1 truncate text-[13px]">{c.title}</span>
              <button
                onClick={(e) => { e.stopPropagation(); deleteConversation(c.id); }}
                className="h-5 w-5 shrink-0 items-center justify-center rounded opacity-0 transition-opacity group-hover:opacity-100 hover:text-[color:var(--red)]"
              >
                <Trash2 className="h-3 w-3" />
              </button>
            </div>
          ))}
        </div>

        {/* Active report context chip */}
        {activeReport && (
          <div className="border-t border-[color:var(--border-faint)] px-3 py-3">
            <div className="flex items-center gap-1.5 rounded-md border border-[rgba(52,211,153,0.2)] bg-[color:var(--green-tint)] px-2.5 py-2">
              <span className="h-1.5 w-1.5 rounded-full bg-[color:var(--green)]" />
              <span className="truncate text-[11px] text-[color:var(--green)]">
                Context: {activeReport.inputs.address.split(",")[0]}
              </span>
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="border-t border-[color:var(--border-faint)] px-4 py-3">
          <p className="text-[10px] text-[color:var(--text-muted)]">On-device · Nemotron-3 Nano 30B</p>
        </div>
      </aside>

      {/* ── Main chat area ──────────────────────────────────────── */}
      <div className="flex flex-1 flex-col overflow-hidden">
        {/* Top bar */}
        <div className="flex items-center gap-3 border-b border-[color:var(--border-faint)] px-5 py-3.5">
          <button
            onClick={() => setSidebarOpen((v) => !v)}
            className="flex h-8 w-8 items-center justify-center rounded-md text-[color:var(--text-muted)] hover:bg-[color:var(--surface-raised)] hover:text-[color:var(--text-primary)]"
          >
            <ChevronLeft className={`h-4 w-4 transition-transform ${sidebarOpen ? "" : "rotate-180"}`} />
          </button>
          <div className="flex-1">
            <p className="text-sm font-medium text-[color:var(--text-primary)]">
              {activeConv?.title ?? "Meridian chat"}
            </p>
            <p className="text-[11px] text-[color:var(--text-muted)]">
              Local Nemotron · RAG land-law context{activeReport ? " · report context active" : ""}
            </p>
          </div>
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
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto px-6 py-6">
          {messages.length === 0 ? (
            <div className="mx-auto max-w-2xl">
              <div className="mb-6 text-center">
                <Sparkles className="mx-auto mb-2 h-8 w-8 text-[color:var(--accent)]" />
                <h2 className="font-display text-xl font-medium text-[color:var(--text-primary)]">
                  Ask Meridian anything
                </h2>
                <p className="mt-1 text-sm text-[color:var(--text-muted)]">
                  Powered by local Nemotron-3 Nano · memory + RAG land-law grounding
                  {activeReport ? " · your report is loaded as context" : ""}
                </p>
              </div>
              <div className="grid gap-2 sm:grid-cols-2">
                {SEED_PROMPTS.map((q) => (
                  <button
                    key={q}
                    onClick={() => send(q)}
                    className="rounded-xl border border-[color:var(--border-faint)] bg-[color:var(--surface)] px-4 py-3 text-left text-[13px] text-[color:var(--text-secondary)] transition-all hover:border-[color:var(--accent)] hover:shadow-sm hover:text-[color:var(--text-primary)]"
                  >
                    {q}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="mx-auto max-w-2xl space-y-5">
              {messages.map((m, i) => (
                <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
                  {m.role === "assistant" && (
                    <div className="mr-3 mt-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-[rgba(82,102,235,0.25)] bg-[color:var(--accent-subtle)]">
                      <Sparkles className="h-3.5 w-3.5 text-[color:var(--accent-light)]" />
                    </div>
                  )}
                  <div
                    className={`max-w-[78%] rounded-2xl px-4 py-3 ${
                      m.role === "user"
                        ? "rounded-br-sm bg-[color:var(--accent)] text-white"
                        : "rounded-bl-sm border border-[color:var(--border-faint)] bg-[color:var(--surface)] text-[color:var(--text-secondary)]"
                    }`}
                  >
                    {m.role === "assistant" ? (
                      <ChatMarkdown text={m.content} />
                    ) : (
                      <p className="text-[14px] leading-relaxed">{m.content}</p>
                    )}
                    {m.role === "assistant" && m.sources && m.sources.length > 0 && (
                      <div className="mt-3 border-t border-[color:var(--border-faint)] pt-2">
                        <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-[color:var(--green)]">
                          {m.sources.length} source{m.sources.length > 1 ? "s" : ""}
                        </p>
                        <div className="space-y-1">
                          {m.sources.map((s, j) => (
                            <details key={j} className="text-[11px]">
                              <summary className="cursor-pointer truncate text-[color:var(--accent-light)] hover:text-[color:var(--accent)]">
                                {s.source}
                              </summary>
                              <p className="mt-1 leading-snug text-[color:var(--text-muted)]">
                                {s.text.slice(0, 320)}…
                              </p>
                            </details>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              ))}
              {pending && (
                <div className="flex justify-start">
                  <div className="mr-3 mt-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-[rgba(82,102,235,0.25)] bg-[color:var(--accent-subtle)]">
                    <Sparkles className="h-3.5 w-3.5 animate-pulse text-[color:var(--accent-light)]" />
                  </div>
                  <div className="flex items-center gap-1 rounded-2xl rounded-bl-sm border border-[color:var(--border-faint)] bg-[color:var(--surface)] px-4 py-3">
                    {[0, 1, 2].map((d) => (
                      <span
                        key={d}
                        className="h-1.5 w-1.5 animate-typing-bounce rounded-full bg-[color:var(--text-muted)]"
                        style={{ animationDelay: `${d * 0.2}s` }}
                      />
                    ))}
                  </div>
                </div>
              )}
              <div ref={endRef} />
            </div>
          )}
        </div>

        {/* Input area */}
        <div className="border-t border-[color:var(--border-faint)] bg-[color:var(--surface)] px-6 py-4">
          <div className="mx-auto flex max-w-2xl gap-3">
            <input
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && send()}
              placeholder={
                webSearch
                  ? "Ask anything — web search active…"
                  : activeReport
                    ? `Ask about ${activeReport.inputs.address.split(",")[0]}…`
                    : "Ask about Toronto real estate, costs, or risk…"
              }
              className="flex-1 rounded-xl border border-[color:var(--border)] bg-[color:var(--surface-frosted)] px-4 py-3 text-[14px] text-[color:var(--text-primary)] outline-none transition-colors focus:border-[color:var(--border-focus)] placeholder:text-[color:var(--text-muted)]"
            />
            <MicButton
              onTranscript={(t) => setInput((cur) => (cur ? `${cur} ${t}` : t))}
              className="h-12 w-12"
              title="Speak your message"
            />
            <button
              onClick={() => send()}
              disabled={pending || !input.trim()}
              className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-[color:var(--accent)] text-white transition-opacity hover:opacity-90 disabled:opacity-40"
            >
              <Send className="h-4 w-4" />
            </button>
          </div>
          {webSearch && (
            <p className="mx-auto mt-1.5 max-w-2xl text-[10px] text-[color:var(--text-muted)]">
              Only your query text is sent to DuckDuckGo — no address or financial details leave the device.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
