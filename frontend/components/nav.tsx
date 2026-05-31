"use client";

import { type FormEvent, useEffect, useState } from "react";
import { Compass } from "lucide-react";
import { ThemeToggle } from "@/components/theme-toggle";
import type { MeridianFormState } from "@/lib/report";
import type { Screen } from "@/components/meridian-app";

type NavProps = {
  screen: Screen;
  inputs: MeridianFormState;
  onReanalyze: (patch: Partial<MeridianFormState>) => void;
  onNewAnalysis: () => void;
};

export function Nav({ screen, inputs, onReanalyze, onNewAnalysis }: NavProps) {
  const [address, setAddress] = useState(inputs.address);
  const [price, setPrice] = useState(String(inputs.listPrice));

  // Keep the editable fields in sync when a new analysis updates inputs.
  useEffect(() => {
    setAddress(inputs.address);
    setPrice(String(inputs.listPrice));
  }, [inputs.address, inputs.listPrice]);

  const showInputs = screen === "verdict";

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    onReanalyze({ address, listPrice: Number(price) || inputs.listPrice });
  }

  return (
    <nav className="fixed inset-x-0 top-0 z-40 h-[72px] border-b border-line-faint bg-[var(--bg)]/70 backdrop-blur-xl">
      <div className="mx-auto flex h-full max-w-6xl items-center justify-between gap-4 px-4 md:px-6">
        <div className="flex items-center gap-2.5">
          <span className="flex h-8 w-8 items-center justify-center rounded-md bg-accent text-white">
            <Compass className="h-[18px] w-[18px]" />
          </span>
          <span className="text-[15px] font-semibold tracking-tight text-primary">
            Meridian
          </span>
        </div>

        {showInputs && (
          <form
            onSubmit={submit}
            className="hidden flex-1 items-center justify-center gap-2 md:flex"
          >
            <input
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              className="w-64 rounded-md border border-line bg-[var(--surface-frosted)] px-3 py-1.5 text-[13px] text-primary outline-none transition placeholder:text-muted focus:[border-color:var(--border-focus)]"
              placeholder="Address"
            />
            <input
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              inputMode="numeric"
              className="font-mono w-28 rounded-md border border-line bg-[var(--surface-frosted)] px-3 py-1.5 text-[13px] text-primary outline-none transition focus:[border-color:var(--border-focus)]"
              placeholder="Price"
            />
            <button
              type="submit"
              className="rounded-pill bg-accent-tint px-3 py-1.5 text-[13px] font-medium text-accent-light transition hover:opacity-[0.88]"
            >
              Re-analyze
            </button>
          </form>
        )}

        <div className="flex items-center gap-2">
          {showInputs && (
            <button
              type="button"
              onClick={onNewAnalysis}
              className="rounded-pill border border-line px-3 py-1.5 text-[13px] font-medium text-secondary transition hover:text-primary"
            >
              New analysis
            </button>
          )}
          <ThemeToggle />
        </div>
      </div>
    </nav>
  );
}
