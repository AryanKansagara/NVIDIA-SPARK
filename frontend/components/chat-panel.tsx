"use client";

import { useEffect, useRef, useState } from "react";
import { Panel } from "@/components/ui/panel";
import { Pill } from "@/components/ui/pill";
import { sendChat, type ChatSource } from "@/lib/api";

type Message = { role: "user" | "assistant"; content: string; sources?: ChatSource[] };

function getSessionId(): string {
  if (typeof window === "undefined") return "default";
  let id = localStorage.getItem("meridian_session");
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem("meridian_session", id);
  }
  return id;
}

export function ChatPanel() {
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
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, pending]);

  async function send() {
    const text = input.trim();
    if (!text || pending) return;
    setInput("");
    setMessages((m) => [...m, { role: "user", content: text }]);
    setPending(true);
    try {
      const { reply, sources } = await sendChat(sessionRef.current, text, webSearch);
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
    <Panel className="flex h-[70vh] flex-col">
      <div className="mb-4 space-y-2">
        <Pill tone="green">Chat</Pill>
        <h1 className="font-display text-2xl text-ink">Ask Meridian</h1>
        <p className="text-xs text-slate">
          Runs on the local Nemotron model with long + short-term memory. It remembers your budget,
          concerns, and profile across the conversation.
        </p>
      </div>

      <div className="flex-1 space-y-3 overflow-y-auto pr-1">
        {messages.length === 0 && (
          <p className="text-sm text-slate/70">
            Try: “My ceiling is $900k and I’m worried about flood risk near the Don.”
          </p>
        )}
        {messages.map((m, i) => (
          <div
            key={i}
            className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${
              m.role === "user"
                ? "ml-auto bg-ink text-mist"
                : "mr-auto border border-[#D7E7E2] bg-[#F7FAF8] text-ink"
            }`}
          >
            {m.content}
            {m.role === "assistant" && m.sources && m.sources.length > 0 && (
              <div className="mt-3 border-t border-[#D7E7E2] pt-2">
                <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-moss">
                  Grounded in {m.sources.length} source{m.sources.length > 1 ? "s" : ""}
                </p>
                <div className="space-y-1">
                  {m.sources.map((s, j) => (
                    <details key={j} className="text-[11px] text-slate">
                      <summary className="cursor-pointer truncate text-moss">
                        📄 {s.source}
                        {typeof s.score === "number" ? ` · ${s.score.toFixed(2)}` : ""}
                      </summary>
                      <p className="mt-1 leading-snug text-slate/80">{s.text.slice(0, 320)}…</p>
                    </details>
                  ))}
                </div>
              </div>
            )}
          </div>
        ))}
        {pending && (
          <div className="mr-auto rounded-2xl border border-[#D7E7E2] bg-[#F7FAF8] px-4 py-2.5 text-sm text-slate">
            Thinking…
          </div>
        )}
        <div ref={endRef} />
      </div>

      <div className="mt-4 flex items-center justify-between">
        <button
          type="button"
          onClick={() => setWebSearch((v) => !v)}
          aria-pressed={webSearch}
          className={`flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors ${
            webSearch
              ? "border-moss bg-moss text-mist"
              : "border-[#D7E7E2] bg-white/70 text-slate hover:border-moss"
          }`}
        >
          <span>🌐</span>
          Web search {webSearch ? "on" : "off"}
        </button>
        <span className="text-[10px] text-slate/60">
          {webSearch ? "Real-time results — only your query leaves the device" : "Answers from local model + memory"}
        </span>
      </div>

      <div className="mt-2 flex gap-2">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && send()}
          placeholder={webSearch ? "Ask anything — I'll search the web…" : "Ask about a property, budget, or risk…"}
          className="flex-1 rounded-2xl border border-[#D7E7E2] bg-white/80 px-4 py-3 text-sm text-ink outline-none focus:border-moss"
        />
        <button
          onClick={send}
          disabled={pending}
          className="rounded-2xl bg-ink px-5 py-3 text-sm font-semibold text-mist transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          Send
        </button>
      </div>
    </Panel>
  );
}
