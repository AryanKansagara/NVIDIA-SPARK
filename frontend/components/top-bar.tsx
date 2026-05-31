"use client";

import { Sparkles } from "lucide-react";
import Link from "next/link";
import { useApp } from "@/lib/app-context";

function initials(name?: string | null): string {
  if (!name) return "—";
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join("");
}

export function TopBar() {
  const { profile, health } = useApp();
  const llmLocal = health?.llm_local ?? false;

  return (
    <header className="flex items-center justify-between gap-4 border-b border-white/60 bg-white/40 px-4 py-3 backdrop-blur md:px-6">
      {/* Local-model health badge */}
      <div
        className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-semibold ${
          llmLocal
            ? "border-moss/40 bg-moss/10 text-moss"
            : "border-brass/40 bg-brass/10 text-brass"
        }`}
        title={health?.model ?? ""}
      >
        <Sparkles className="h-3.5 w-3.5" />
        {llmLocal ? "🟢 Nemotron 120B — local" : "🟡 Nemotron — unavailable"}
      </div>

      {/* Profile circle, top-right */}
      <Link
        href="/profile"
        className="flex h-10 w-10 items-center justify-center rounded-full bg-ink text-sm font-bold text-mist shadow-panel transition-transform hover:scale-105"
        title={profile.name ?? "Profile"}
      >
        {initials(profile.name)}
      </Link>
    </header>
  );
}
