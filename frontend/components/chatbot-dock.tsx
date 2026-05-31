"use client";

import { useState } from "react";
import { Bot, MessageSquare, Send, X } from "lucide-react";

const starterPrompts = [
  "Why is this property flagged?",
  "Break down the true cost for me",
  "What does the transit dividend mean?",
];

export function ChatbotDock() {
  const [isOpen, setIsOpen] = useState(false);
  const [draft, setDraft] = useState("");

  return (
    <div className="fixed bottom-5 right-5 z-50 flex flex-col items-end gap-3 md:bottom-7 md:right-7">
      {isOpen ? (
        <section className="w-[min(92vw,24rem)] overflow-hidden rounded-[2rem] border border-white/70 bg-white shadow-panel backdrop-blur">
          <div className="border-b border-[#D7E7E2] bg-[linear-gradient(180deg,#F8F3E8_0%,#F5FAF7_100%)] px-5 py-4">
            <div className="flex items-start justify-between gap-4">
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-ink text-mist">
                    <Bot className="h-5 w-5" />
                  </div>
                  <div>
                    <p className="font-display text-2xl text-ink">Meridian Chat</p>
                    <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate">
                      Buyer-side copilot
                    </p>
                  </div>
                </div>
                <p className="max-w-xs text-sm leading-6 text-slate">
                  Ask follow-up questions about the cost breakdown, risk signals,
                  or what the report means.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="rounded-full border border-[#D7E7E2] bg-white p-2 text-slate transition hover:border-moss hover:text-ink"
                aria-label="Close chat"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>

          <div className="space-y-4 bg-[#FCFEFD] px-5 py-5">
            <div className="space-y-3">
              <div className="max-w-[85%] rounded-[1.4rem] rounded-tl-md border border-[#D7E7E2] bg-[#F6FBF8] px-4 py-3 text-sm leading-6 text-ink">
                I can help explain how Meridian got to the true 10-year cost, or
                unpack a specific signal like heritage, flood, or mortgage drag.
              </div>
              <div className="ml-auto max-w-[82%] rounded-[1.4rem] rounded-tr-md bg-ink px-4 py-3 text-sm leading-6 text-mist">
                Show me the biggest risk driving this property.
              </div>
              <div className="max-w-[88%] rounded-[1.4rem] rounded-tl-md border border-[#E7D39A] bg-[#FFF8E6] px-4 py-3 text-sm leading-6 text-ink">
                The current report weights heritage sensitivity and insured
                borrowing most heavily. Once live permits are connected, that
                answer should become more precise.
              </div>
            </div>

            <div className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate">
                Suggested prompts
              </p>
              <div className="flex flex-wrap gap-2">
                {starterPrompts.map((prompt) => (
                  <button
                    key={prompt}
                    type="button"
                    onClick={() => setDraft(prompt)}
                    className="rounded-full border border-[#D7E7E2] bg-white px-3 py-2 text-xs font-semibold text-slate transition hover:border-moss hover:text-ink"
                  >
                    {prompt}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="border-t border-[#D7E7E2] bg-white px-4 py-4">
            <div className="flex items-end gap-3 rounded-[1.5rem] border border-[#D7E7E2] bg-[#F7FAF8] px-3 py-3">
              <textarea
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                placeholder="Ask Meridian to explain a signal..."
                rows={2}
                className="min-h-[3rem] flex-1 resize-none bg-transparent text-sm leading-6 text-ink outline-none placeholder:text-slate"
              />
              <button
                type="button"
                className="inline-flex h-11 w-11 items-center justify-center rounded-full bg-ink text-mist transition hover:bg-[#1C3541]"
                aria-label="Send message"
              >
                <Send className="h-4 w-4" />
              </button>
            </div>
          </div>
        </section>
      ) : null}

      <button
        type="button"
        onClick={() => setIsOpen((current) => !current)}
        className="group inline-flex items-center gap-3 rounded-full border border-white/70 bg-ink px-4 py-3 text-mist shadow-panel transition hover:bg-[#1C3541]"
      >
        <span className="flex h-10 w-10 items-center justify-center rounded-full bg-white/10">
          {isOpen ? <X className="h-5 w-5" /> : <MessageSquare className="h-5 w-5" />}
        </span>
        <span className="pr-1 text-left">
          <span className="block text-xs font-semibold uppercase tracking-[0.18em] text-mist/75">
            Meridian
          </span>
          <span className="block text-sm font-semibold">Open chat</span>
        </span>
      </button>
    </div>
  );
}
