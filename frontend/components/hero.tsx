import { ArrowRight, ShieldCheck, TrendingUp } from "lucide-react";
import { Pill } from "@/components/ui/pill";

export function Hero() {
  return (
    <section className="relative overflow-hidden rounded-[2.5rem] border border-white/60 bg-meridian-radial px-6 py-8 shadow-panel md:px-10 md:py-12">
      <div className="absolute -left-10 top-8 h-36 w-36 rounded-full bg-ember/15 blur-2xl animate-drift" />
      <div className="absolute bottom-4 right-6 h-40 w-40 rounded-full bg-moss/10 blur-3xl animate-drift" />
      <div className="relative space-y-6">
        <div className="flex flex-wrap items-center gap-3">
          <Pill>Toronto Housing Intelligence</Pill>
          <Pill tone="green">Local-first on GX10</Pill>
        </div>
        <div className="max-w-4xl space-y-4">
          <p className="font-body text-sm font-semibold uppercase tracking-[0.3em] text-slate">
            Meridian
          </p>
          <h1 className="max-w-3xl font-display text-5xl leading-[0.95] text-ink md:text-7xl">
            The price tag is the least honest number in the room.
          </h1>
          <p className="max-w-2xl text-balance text-base leading-7 text-slate md:text-lg">
            Meridian turns a Toronto listing into the true 10-year cost of
            ownership by combining public city data, deterministic financial
            logic, and a buyer-facing summary generated on local NVIDIA
            hardware.
          </p>
        </div>
        <div className="flex flex-wrap gap-3 text-sm">
          <div className="inline-flex items-center gap-2 rounded-full border border-white/70 bg-white/70 px-4 py-2">
            <ShieldCheck className="h-4 w-4 text-moss" />
            No data leaves the device
          </div>
          <div className="inline-flex items-center gap-2 rounded-full border border-white/70 bg-white/70 px-4 py-2">
            <TrendingUp className="h-4 w-4 text-ember" />
            Deterministic cost engine first
          </div>
          <div className="inline-flex items-center gap-2 rounded-full border border-white/70 bg-white/70 px-4 py-2">
            <ArrowRight className="h-4 w-4 text-brass" />
            Mortgage layer included in Agent 3
          </div>
        </div>
      </div>
    </section>
  );
}
