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
        "rounded-lg border border-line p-5 backdrop-blur md:p-6",
        !hasCustomBg && "bg-surface",
        className,
      )}
    >
      {children}
    </section>
  );
}
