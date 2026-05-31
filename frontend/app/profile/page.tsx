"use client";

import { useEffect, useState } from "react";
import { Panel } from "@/components/ui/panel";
import { getProfile, saveProfile, sendChat, type Profile } from "@/lib/api";
import { useApp } from "@/lib/app-context";

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

export default function ProfilePage() {
  const { refreshProfile } = useApp();
  const [profile, setProfile] = useState<Profile>({});
  const [situation, setSituation] = useState("");
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");

  useEffect(() => {
    getProfile().then(setProfile).catch(() => {});
  }, []);

  async function handleSave() {
    setStatus("saving");
    try {
      await saveProfile(profile);
      // Free-text situation is durable context → episodic memory via chat.
      if (situation.trim()) {
        sendChat(sessionId(), `For my profile, remember: ${situation.trim()}`, false).catch(() => {});
        setSituation("");
      }
      refreshProfile();
      setStatus("saved");
      setTimeout(() => setStatus("idle"), 2000);
    } catch {
      setStatus("error");
    }
  }

  function field(key: keyof Profile, value: string) {
    setProfile((p) => ({ ...p, [key]: value === "" ? null : value }));
  }

  return (
    <div className="mx-auto max-w-2xl">
      <Panel>
        <div className="space-y-6">
          <div className="space-y-2">
            <span className="inline-flex items-center gap-1.5 rounded-pill border border-[color:var(--border-faint)] px-3 py-1 text-[11px] font-medium uppercase tracking-[0.12em] text-[color:var(--text-muted)]">
              Profile
            </span>
            <h1 className="font-display text-3xl font-medium tracking-tight text-[color:var(--text-primary)]">
              Your profile
            </h1>
            <p className="text-sm leading-relaxed text-[color:var(--text-secondary)]">
              Stored on-device only. Your economic situation personalizes every report and chat —
              nothing leaves the DGX Spark.
            </p>
          </div>

          <div className="grid gap-4">
            <Input label="Name" value={profile.name ?? ""} onChange={(v) => field("name", v)} />
            <Input label="Email" type="email" value={profile.email ?? ""} onChange={(v) => field("email", v)} />
            <Input label="Phone" value={profile.phone ?? ""} onChange={(v) => field("phone", v)} />
            <Input
              label="Monthly income (CAD)"
              type="number"
              value={profile.monthly_income != null ? String(profile.monthly_income) : ""}
              onChange={(v) =>
                setProfile((p) => ({ ...p, monthly_income: v === "" ? null : Number(v) }))
              }
            />
            <label className="flex flex-col gap-1.5">
              <span className="text-[11px] font-medium uppercase tracking-[0.1em] text-[color:var(--text-muted)]">
                Anything we should remember?
              </span>
              <textarea
                rows={3}
                value={situation}
                onChange={(e) => setSituation(e.target.value)}
                placeholder="Budget ceiling, cash on hand, risk tolerance, target neighbourhoods…"
                className="resize-none rounded-md border border-[color:var(--border)] bg-[color:var(--surface-frosted)] px-4 py-3 text-sm text-[color:var(--text-primary)] outline-none focus:border-[color:var(--border-focus)] placeholder:text-[color:var(--text-muted)]"
              />
              <span className="text-[11px] text-[color:var(--text-muted)]">
                Saved as private memory the local model recalls in chat.
              </span>
            </label>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={handleSave}
              disabled={status === "saving"}
              className="rounded-pill bg-[color:var(--accent)] px-6 py-3 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50"
            >
              {status === "saving" ? "Saving…" : "Save"}
            </button>
            {status === "saved" && <span className="text-sm font-medium text-[color:var(--green)]">Saved ✓</span>}
            {status === "error" && <span className="text-sm font-medium text-[color:var(--red)]">Save failed</span>}
          </div>
        </div>
      </Panel>
    </div>
  );
}

function Input({
  label,
  value,
  onChange,
  type = "text",
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-[11px] font-medium uppercase tracking-[0.1em] text-[color:var(--text-muted)]">
        {label}
      </span>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="rounded-md border border-[color:var(--border)] bg-[color:var(--surface-frosted)] px-4 py-3 text-sm text-[color:var(--text-primary)] outline-none focus:border-[color:var(--border-focus)]"
      />
    </label>
  );
}
