import { Compass, Landmark, Sparkles } from "lucide-react";

export function Header() {
  return (
    <header className="flex flex-wrap items-center justify-between gap-4">
      <div className="flex items-center gap-3">
        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-ink text-mist shadow-panel">
          <Compass className="h-6 w-6" />
        </div>
        <div>
          <p className="font-display text-2xl text-ink">Meridian</p>
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate">
            True Cost of Ownership Agent
          </p>
        </div>
      </div>

      <div className="flex flex-wrap gap-3 text-xs font-semibold uppercase tracking-[0.18em] text-slate">
        <div className="inline-flex items-center gap-2 rounded-full border border-white/60 bg-white/70 px-4 py-2">
          <Landmark className="h-4 w-4 text-ember" />
          Toronto open data
        </div>
        {/* NVIDIA badge with glow */}
        <div className="nvidia-badge-glow inline-flex items-center gap-2 rounded-full border border-moss/40 bg-gradient-to-r from-moss/10 to-mist/60 px-4 py-2">
          <Sparkles className="h-4 w-4 text-moss" />
          <span className="text-moss">Nemotron · GB10 · NIM</span>
        </div>
      </div>
    </header>
  );
}
