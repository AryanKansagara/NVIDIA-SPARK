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
        "rounded-xl border border-[color:var(--border)] bg-[color:var(--surface)] p-6 backdrop-blur-md md:p-8",
        className,
      )}
    >
      {children}
    </section>
  );
}
