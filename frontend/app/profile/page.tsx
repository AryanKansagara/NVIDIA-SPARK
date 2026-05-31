"use client";

import { useEffect, useState } from "react";
import { Panel } from "@/components/ui/panel";
import { Pill } from "@/components/ui/pill";
import { getProfile, saveProfile, type Profile } from "@/lib/api";
import { useApp } from "@/lib/app-context";

export default function ProfilePage() {
  const { refreshProfile } = useApp();
  const [profile, setProfile] = useState<Profile>({});
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");

  useEffect(() => {
    getProfile().then(setProfile).catch(() => {});
  }, []);

  async function handleSave() {
    setStatus("saving");
    try {
      await saveProfile(profile);
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
            <Pill tone="yellow">Profile</Pill>
            <h1 className="font-display text-3xl text-ink">Your profile</h1>
            <p className="text-sm text-slate">
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
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={handleSave}
              disabled={status === "saving"}
              className="rounded-2xl bg-ink px-6 py-3 text-sm font-semibold text-mist transition-opacity hover:opacity-90 disabled:opacity-50"
            >
              {status === "saving" ? "Saving…" : "Save"}
            </button>
            {status === "saved" && <span className="text-sm font-semibold text-moss">Saved ✓</span>}
            {status === "error" && <span className="text-sm font-semibold text-ember">Save failed</span>}
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
      <span className="text-xs font-semibold uppercase tracking-[0.18em] text-slate">{label}</span>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="rounded-2xl border border-[#D7E7E2] bg-white/80 px-4 py-3 text-sm text-ink outline-none focus:border-moss"
      />
    </label>
  );
}
