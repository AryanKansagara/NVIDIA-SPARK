import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

type PanelProps = {
  children: ReactNode;
  className?: string;
};

export function Panel({ children, className }: PanelProps) {
  // Let callers override the background; only apply the default when none is supplied.
  const hasCustomBg = /(^|\s)bg-/.test(className ?? "");
  return (
    <section
      className={cn(
        "rounded-4xl border border-white/60 p-6 shadow-panel backdrop-blur md:p-8",
        !hasCustomBg && "bg-white/70",
        className,
      )}
    >
      {children}
    </section>
  );
}
