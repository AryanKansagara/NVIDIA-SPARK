"use client";

import { type ComponentType, type FormEvent, type ReactNode, useState } from "react";
import { Home, Percent, ReceiptText, UserRound } from "lucide-react";
import { Panel } from "@/components/ui/panel";
import type { BuyerProfile, MeridianFormState } from "@/lib/report";

type InputCardProps = {
  initialValues: MeridianFormState;
  onSubmit: (values: MeridianFormState) => void;
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

export function InputCard({ initialValues, onSubmit }: InputCardProps) {
  const [form, setForm] = useState(initialValues);

  function update<K extends keyof MeridianFormState>(key: K, value: MeridianFormState[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    onSubmit(form);
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
            right recomputes using the same deterministic logic the backend will
            eventually own.
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
              step={1000}
              value={form.listPrice}
              onChange={(event) => update("listPrice", Number(event.target.value))}
            />
          </Field>
          <Field
            label="Buyer Profile"
            hint="Used to control rebates and buyer-program signals."
            icon={UserRound}
          >
            <select
              className="w-full rounded-2xl border border-white bg-white px-4 py-3 text-sm text-ink outline-none transition focus:border-moss"
              value={form.buyerProfile}
              onChange={(event) => update("buyerProfile", event.target.value as BuyerProfile)}
            >
              <option value="first_time">First-time buyer</option>
              <option value="investor">Investor</option>
              <option value="downsizer">Downsizer</option>
            </select>
          </Field>
          <div className="grid gap-3 md:grid-cols-3">
            <Field
              label="Down Payment"
              hint="Percent of purchase price."
              icon={Percent}
            >
              <input
                className="w-full rounded-2xl border border-white bg-white px-4 py-3 text-sm text-ink outline-none transition focus:border-moss"
                type="number"
                min={5}
                max={100}
                step={1}
                value={form.downPaymentPercent}
                onChange={(event) =>
                  update("downPaymentPercent", Number(event.target.value))
                }
              />
            </Field>
            <Field
              label="Rate"
              hint="Starting mortgage rate."
              icon={Percent}
            >
              <input
                className="w-full rounded-2xl border border-white bg-white px-4 py-3 text-sm text-ink outline-none transition focus:border-moss"
                type="number"
                min={0.5}
                max={20}
                step={0.01}
                value={form.mortgageRate}
                onChange={(event) => update("mortgageRate", Number(event.target.value))}
              />
            </Field>
            <Field
              label="Amortization"
              hint="Years used for the payment model."
              icon={Percent}
            >
              <input
                className="w-full rounded-2xl border border-white bg-white px-4 py-3 text-sm text-ink outline-none transition focus:border-moss"
                type="number"
                min={5}
                max={35}
                step={1}
                value={form.amortizationYears}
                onChange={(event) =>
                  update("amortizationYears", Number(event.target.value))
                }
              />
            </Field>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="submit"
            className="rounded-full bg-ink px-5 py-3 text-sm font-semibold text-mist transition hover:bg-[#1C3541]"
          >
            Recalculate Preview
          </button>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate">
            Frontend preview only. Live city data wiring comes next.
          </p>
        </div>
      </form>
    </Panel>
  );
}
