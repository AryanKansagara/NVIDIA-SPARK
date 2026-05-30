import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

type PanelProps = {
  children: ReactNode;
  className?: string;
};

export function Panel({ children, className }: PanelProps) {
  return (
    <section
      className={cn(
        "rounded-4xl border border-white/60 bg-white/70 p-6 shadow-panel backdrop-blur md:p-8",
        className,
      )}
    >
      {children}
    </section>
  );
}
