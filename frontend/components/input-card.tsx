"use client";

import { type ComponentType, type FormEvent, type ReactNode, useState } from "react";
import { Home, ReceiptText, UserRound } from "lucide-react";
import { Panel } from "@/components/ui/panel";
import type { BuyerProfile, MeridianFormState } from "@/lib/report";

type InputCardProps = {
  initialValues: MeridianFormState;
  onSubmit: (values: MeridianFormState) => void | Promise<void>;
  isLoading?: boolean;
  apiBaseUrl?: string;
};

type FieldProps = {
  label: string;
  hint: string;
  icon: ComponentType<{ className?: string }>;
  children: ReactNode;
};

function Field({ label, hint, icon: Icon, children }: FieldProps) {
  return (
    <label className="block rounded-3xl border border-[#D7E7E2] bg-[#F7FAF8] p-4">
      <div className="flex items-start gap-3">
        <div className="rounded-2xl bg-white p-2 text-moss shadow-sm">
          <Icon className="h-4 w-4" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate">
            {label}
          </p>
          <p className="mt-1 text-xs leading-5 text-slate">{hint}</p>
          <div className="mt-3">{children}</div>
        </div>
      </div>
    </label>
  );
}

export function InputCard({
  initialValues,
  onSubmit,
  isLoading = false,
  apiBaseUrl,
}: InputCardProps) {
  const [form, setForm] = useState(initialValues);

  function update<K extends keyof MeridianFormState>(
    key: K,
    value: MeridianFormState[K],
  ) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void onSubmit(form);
  }

  return (
    <Panel className="h-full">
      <form className="space-y-6" onSubmit={submit}>
        <div className="space-y-2">
          <p className="text-sm font-semibold uppercase tracking-[0.22em] text-slate">
            Live Input
          </p>
          <h2 className="font-display text-3xl leading-tight text-ink">
            Property intake form
          </h2>
          <p className="text-sm leading-6 text-slate">
            Enter the property and mortgage assumptions here. The preview on the
            right now comes from the GX10 backend when available, with a local
            deterministic fallback if the API request fails.
          </p>
        </div>
        <div className="space-y-3">
          <Field
            label="Address"
            hint="Toronto address string used for future geocoding and spatial lookups."
            icon={Home}
          >
            <input
              className="w-full rounded-2xl border border-white bg-white px-4 py-3 text-sm text-ink outline-none transition focus:border-moss"
              value={form.address}
              onChange={(event) => update("address", event.target.value)}
              placeholder="401 Richmond St W, Toronto"
            />
          </Field>
          <Field
            label="List Price"
            hint="Listing amount in CAD before hidden costs."
            icon={ReceiptText}
          >
            <input
              className="w-full rounded-2xl border border-white bg-white px-4 py-3 text-sm text-ink outline-none transition focus:border-moss"
              type="number"
              min={1}
              step={1}
              value={form.listPrice}
              onChange={(event) => update("listPrice", Number(event.target.value))}
            />
          </Field>
          <Field
            label="Are You A First-Time Buyer?"
            hint="Used to control rebates and buyer-program signals."
            icon={UserRound}
          >
            <select
              className="w-full rounded-2xl border border-white bg-white px-4 py-3 text-sm text-ink outline-none transition focus:border-moss"
              value={form.buyerProfile}
              onChange={(event) =>
                update("buyerProfile", event.target.value as BuyerProfile)
              }
            >
              <option value="first_time">Yes</option>
              <option value="downsizer">No</option>
            </select>
          </Field>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="submit"
            disabled={isLoading}
            className="rounded-full bg-ink px-5 py-3 text-sm font-semibold text-mist transition hover:bg-[#1C3541] disabled:cursor-not-allowed disabled:opacity-70"
          >
            {isLoading ? "Requesting Report..." : "Recalculate Preview"}
          </button>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate">
            API target: {apiBaseUrl ?? "not configured"}
          </p>
        </div>
      </form>
    </Panel>
  );
}
