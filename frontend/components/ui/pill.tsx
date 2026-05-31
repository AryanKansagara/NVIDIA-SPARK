import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

type PillProps = {
  children: ReactNode;
  tone?: "neutral" | "red" | "yellow" | "green" | "accent";
  className?: string;
};

// Confidence/severity badges from the prototype design system.
const toneClasses: Record<NonNullable<PillProps["tone"]>, string> = {
  neutral:
    "bg-[color:var(--surface-raised)] text-[color:var(--text-secondary)] border-[color:var(--border-faint)]",
  red: "bg-[color:var(--red-tint)] text-[color:var(--red)] border-[rgba(248,113,113,0.2)]",
  yellow: "bg-[color:var(--amber-tint)] text-[color:var(--amber)] border-[rgba(251,191,36,0.2)]",
  green: "bg-[color:var(--green-tint)] text-[color:var(--green)] border-[rgba(52,211,153,0.2)]",
  accent: "bg-[color:var(--accent-subtle)] text-[color:var(--accent-light)] border-[rgba(82,102,235,0.2)]",
};

const dotClasses: Record<NonNullable<PillProps["tone"]>, string> = {
  neutral: "bg-[color:var(--text-muted)]",
  red: "bg-[color:var(--red)]",
  yellow: "bg-[color:var(--amber)]",
  green: "bg-[color:var(--green)]",
  accent: "bg-[color:var(--accent)]",
};

export function Pill({ children, tone = "neutral", className }: PillProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-pill border px-2.5 py-1 text-[11px] font-medium tracking-[0.04em]",
        toneClasses[tone],
        className,
      )}
    >
      <span className={cn("h-[5px] w-[5px] shrink-0 rounded-full", dotClasses[tone])} />
      {children}
    </span>
  );
}
