import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export type Confidence = "high" | "medium" | "low" | "unknown" | "neutral";

type PillProps = {
  children: ReactNode;
  tone?: Confidence;
  className?: string;
};

// Frosted confidence badges (Mercury pattern). Each tone uses a tinted
// background + a leading dot. The `badge-*` class lets globals.css apply
// stronger light-mode colors for contrast on the warm background.
const toneClasses: Record<Confidence, string> = {
  high: "badge-high bg-green-tint text-green",
  medium: "badge-medium bg-amber-tint text-amber",
  low: "badge-low bg-red-tint text-red",
  unknown: "badge-unknown bg-accent-subtle text-accent-light",
  neutral: "bg-[var(--surface-frosted)] text-secondary",
};

const dotColor: Record<Confidence, string> = {
  high: "bg-green",
  medium: "bg-amber",
  low: "bg-red",
  unknown: "bg-accent",
  neutral: "bg-secondary",
};

export function Pill({ children, tone = "neutral", className }: PillProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-pill border border-transparent px-2.5 py-1 text-[11px] font-medium uppercase tracking-[0.04em]",
        toneClasses[tone],
        className,
      )}
    >
      <span className={cn("h-1.5 w-1.5 rounded-full", dotColor[tone])} />
      {children}
    </span>
  );
}
