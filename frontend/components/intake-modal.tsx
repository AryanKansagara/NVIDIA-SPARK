"use client";

import { type FormEvent, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { EASE } from "@/lib/motion";
import { X } from "lucide-react";
import type { BuyerProfile, MeridianFormState } from "@/lib/report";

type IntakeModalProps = {
  open: boolean;
  defaults: MeridianFormState;
  onClose: () => void;
  onSubmit: (values: MeridianFormState) => void;
};

const fieldClass =
  "w-full rounded-md border border-line bg-[var(--surface-frosted)] px-3.5 py-2.5 text-sm text-primary outline-none transition placeholder:text-muted focus:[border-color:var(--border-focus)]";
const labelClass =
  "mb-1.5 block text-[11px] font-medium uppercase tracking-[0.08em] text-muted";

export function IntakeModal({
  open,
  defaults,
  onClose,
  onSubmit,
}: IntakeModalProps) {
  const [form, setForm] = useState<MeridianFormState>(defaults);

  function update<K extends keyof MeridianFormState>(
    key: K,
    value: MeridianFormState[K],
  ) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    onSubmit(form);
  }

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
        >
          <div
            className="absolute inset-0 bg-black/50 backdrop-blur-[6px]"
            onClick={onClose}
          />
          <motion.div
            role="dialog"
            aria-modal="true"
            className="relative z-10 w-full max-w-md rounded-xl border border-line bg-surface p-6 shadow-2xl backdrop-blur-xl"
            initial={{ opacity: 0, y: 16, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 16, scale: 0.97 }}
            transition={{ duration: 0.25, ease: EASE }}
          >
            <div className="mb-5 flex items-start justify-between">
              <div>
                <h2 className="text-xl font-semibold text-primary">
                  Analyze a property
                </h2>
                <p className="mt-1 text-sm text-secondary">
                  We compute the true 10-year cost on local hardware.
                </p>
              </div>
              <button
                type="button"
                onClick={onClose}
                aria-label="Close"
                className="rounded-md p-1 text-muted transition hover:text-primary"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form className="space-y-4" onSubmit={submit}>
              <div>
                <label className={labelClass}>Address</label>
                <input
                  className={fieldClass}
                  value={form.address}
                  onChange={(e) => update("address", e.target.value)}
                  placeholder="401 Richmond St W, Toronto"
                />
              </div>

              <div>
                <label className={labelClass}>List price (CAD)</label>
                <input
                  className={`${fieldClass} font-mono`}
                  type="number"
                  min={1000}
                  step={1000}
                  value={form.listPrice}
                  onChange={(e) => update("listPrice", Number(e.target.value))}
                />
              </div>

              <div>
                <label className={labelClass}>Buyer profile</label>
                <select
                  className={fieldClass}
                  value={form.buyerProfile}
                  onChange={(e) =>
                    update("buyerProfile", e.target.value as BuyerProfile)
                  }
                >
                  <option value="first_time">First-time buyer</option>
                  <option value="investor">Investor</option>
                  <option value="downsizer">Downsizer</option>
                </select>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className={labelClass}>Down %</label>
                  <input
                    className={`${fieldClass} font-mono`}
                    type="number"
                    min={5}
                    max={100}
                    step={1}
                    value={form.downPaymentPercent}
                    onChange={(e) =>
                      update("downPaymentPercent", Number(e.target.value))
                    }
                  />
                </div>
                <div>
                  <label className={labelClass}>Rate %</label>
                  <input
                    className={`${fieldClass} font-mono`}
                    type="number"
                    min={0.5}
                    max={20}
                    step={0.01}
                    value={form.mortgageRate}
                    onChange={(e) =>
                      update("mortgageRate", Number(e.target.value))
                    }
                  />
                </div>
                <div>
                  <label className={labelClass}>Amort.</label>
                  <input
                    className={`${fieldClass} font-mono`}
                    type="number"
                    min={5}
                    max={35}
                    step={1}
                    value={form.amortizationYears}
                    onChange={(e) =>
                      update("amortizationYears", Number(e.target.value))
                    }
                  />
                </div>
              </div>

              <button
                type="submit"
                className="mt-2 w-full rounded-pill bg-accent py-3 text-sm font-medium text-white transition hover:translate-y-[-1px] hover:opacity-[0.88]"
              >
                Analyze my property
              </button>
            </form>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
