"use client";

import { useState } from "react";
import { ArrowRight } from "lucide-react";
import { saveProfile, sendChat } from "@/lib/api";
import { useApp } from "@/lib/app-context";
import type { BuyerProfile } from "@/lib/report";

const PROFILES: { value: BuyerProfile; label: string; desc: string }[] = [
  { value: "first_time", label: "First-time buyer", desc: "Rebates & program eligibility apply" },
  { value: "investor", label: "Investor", desc: "Yield & resilience focus" },
];

const SESSION_KEY = "meridian_session";

function sessionId(): string {
  if (typeof window === "undefined") return "default";
  let id = localStorage.getItem(SESSION_KEY);
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem(SESSION_KEY, id);
  }
  return id;
}

/** Persist the chosen buyer profile locally so the analyze form can default to it. */
export const BUYER_PROFILE_KEY = "meridian.buyerProfile";

export function OnboardingModal() {
  const { firstRun, completeOnboarding } = useApp();
  const [buyer, setBuyer] = useState<BuyerProfile>("first_time");
  const [name, setName] = useState("");
  const [income, setIncome] = useState("");
  const [situation, setSituation] = useState("");
  const [saving, setSaving] = useState(false);

  if (!firstRun) return null;

  async function finish(skip: boolean) {
    if (!skip) {
      setSaving(true);
      try {
        const monthly = income ? Number(income.replace(/[^0-9.]/g, "")) : null;
        await saveProfile({
          name: name || null,
          monthly_income: monthly && !Number.isNaN(monthly) ? monthly : null,
        });
        // Seed episodic memory with the free-text situation + buyer type so the
        // local model recalls it in later chats. Fire-and-forget; never blocks.
        const parts = [`I am a ${buyer.replace("_", "-")} buyer.`];
        if (situation.trim()) parts.push(situation.trim());
        sendChat(sessionId(), `For my profile: ${parts.join(" ")}`, false).catch(() => {});
      } catch {
        /* non-fatal — onboarding still completes */
      } finally {
        setSaving(false);
      }
    }
    try {
      localStorage.setItem(BUYER_PROFILE_KEY, buyer);
    } catch {
      /* ignore */
    }
    completeOnboarding();
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/45 p-4 backdrop-blur-sm">
      <div className="animate-chat-slide-in w-full max-w-md rounded-xl border border-[color:var(--border)] bg-[color:var(--surface)] p-8 shadow-panel">
        <p className="text-[11px] font-medium uppercase tracking-[0.12em] text-[color:var(--text-muted)]">
          Welcome to Meridian
        </p>
        <h2 className="mt-1 font-display text-2xl font-medium tracking-tight text-[color:var(--text-primary)]">
          What is your buyer profile?
        </h2>
        <p className="mt-2 text-sm leading-relaxed text-[color:var(--text-secondary)]">
          This personalizes every report and chat. Stored on-device only — nothing leaves the DGX Spark.
        </p>

        <div className="mt-5 space-y-2">
          {PROFILES.map((p) => (
            <button
              key={p.value}
              type="button"
              onClick={() => setBuyer(p.value)}
              className={`flex w-full items-center justify-between rounded-md border px-4 py-3 text-left transition-colors ${
                buyer === p.value
                  ? "border-[color:var(--accent)] bg-[color:var(--accent-subtle)]"
                  : "border-[color:var(--border-faint)] hover:border-[color:var(--border)]"
              }`}
            >
              <div>
                <p className="text-sm font-medium text-[color:var(--text-primary)]">{p.label}</p>
                <p className="text-xs text-[color:var(--text-muted)]">{p.desc}</p>
              </div>
              <span
                className={`h-3.5 w-3.5 rounded-full border ${
                  buyer === p.value
                    ? "border-[color:var(--accent)] bg-[color:var(--accent)]"
                    : "border-[color:var(--border)]"
                }`}
              />
            </button>
          ))}
        </div>

        <div className="mt-4 grid gap-3">
          <Field label="Your name (optional)">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Alex Buyer"
              className="modal-input"
            />
          </Field>
          <Field label="Monthly income (optional)">
            <input
              value={income}
              onChange={(e) => setIncome(e.target.value)}
              inputMode="numeric"
              placeholder="$8,000"
              className="modal-input font-mono"
            />
          </Field>
          <Field label="Anything we should know? (optional)">
            <textarea
              value={situation}
              onChange={(e) => setSituation(e.target.value)}
              rows={2}
              placeholder="Budget ceiling, cash on hand, risk tolerance…"
              className="modal-input resize-none"
            />
          </Field>
        </div>

        <button
          type="button"
          disabled={saving}
          onClick={() => finish(false)}
          className="mt-5 flex w-full items-center justify-center gap-2 rounded-pill bg-[color:var(--accent)] px-6 py-3 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-60"
        >
          {saving ? "Saving…" : "Continue"}
          <ArrowRight className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={() => finish(true)}
          className="mt-2 w-full text-center text-xs text-[color:var(--text-muted)] transition-colors hover:text-[color:var(--text-secondary)]"
        >
          I&apos;ll do this later
        </button>
      </div>

      <style jsx>{`
        :global(.modal-input) {
          width: 100%;
          background: var(--surface-raised);
          border: 1px solid var(--border);
          border-radius: 12px;
          padding: 10px 14px;
          font-size: 14px;
          color: var(--text-primary);
          outline: none;
          transition: border-color 0.2s;
        }
        :global(.modal-input:focus) {
          border-color: var(--accent);
        }
        :global(.modal-input::placeholder) {
          color: var(--text-muted);
        }
      `}</style>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-[11px] font-medium uppercase tracking-[0.08em] text-[color:var(--text-muted)]">
        {label}
      </span>
      {children}
    </label>
  );
}
