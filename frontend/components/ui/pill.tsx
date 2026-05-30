import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

type PillProps = {
  children: ReactNode;
  tone?: "neutral" | "red" | "yellow" | "green";
};

const toneClasses = {
  neutral: "bg-white/80 text-ink border-white/60",
  red: "bg-[#F8D8D1] text-[#7A2C16] border-[#E7A28B]",
  yellow: "bg-[#F8E9BF] text-[#6C5510] border-[#D6BA63]",
  green: "bg-[#D9EEDF] text-[#205544] border-[#8CC0A0]",
};

export function Pill({ children, tone = "neutral" }: PillProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em]",
        toneClasses[tone],
      )}
    >
      {children}
    </span>
  );
}
