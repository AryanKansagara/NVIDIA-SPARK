"use client";

import { type FormEvent, useState, useEffect, useRef } from "react";
import { ArrowRight, AlertCircle, MapPin, Database, Cpu, Sparkles } from "lucide-react";
import type { BuyerProfile, MeridianFormState } from "@/lib/report";
import { fetchAddressSuggestions, type AddressSuggestion } from "@/lib/api";
import { MicButton } from "@/components/mic-button";

type InputCardProps = {
  initialValues: MeridianFormState;
  onSubmit: (values: MeridianFormState) => void;
  error?: string | null;
};

const PROFILE_LABELS: Record<BuyerProfile, string> = {
  first_time: "First-time buyer",
  investor: "Investor",
};

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block text-left">
      <span className="mb-1.5 block text-[11px] font-medium uppercase tracking-[0.09em] text-[color:var(--text-muted)]">
        {label}
      </span>
      {children}
    </label>
  );
}

const inputCls =
  "w-full rounded-md border border-[color:var(--border)] bg-[color:var(--surface-frosted)] px-4 py-3 text-[15px] text-[color:var(--text-primary)] outline-none transition-colors focus:border-[color:var(--border-focus)] placeholder:text-[color:var(--text-muted)]";

const inputActiveCls =
  "w-full rounded-md border-2 border-[color:var(--accent)] bg-[color:var(--surface-frosted)] px-4 py-3 text-[15px] text-[color:var(--text-primary)] outline-none transition-colors placeholder:text-[color:var(--text-muted)]";

export function InputCard({ initialValues, onSubmit, error }: InputCardProps) {
  const [form, setForm] = useState(initialValues);
  const [suggestions, setSuggestions] = useState<AddressSuggestion[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [activeSuggestionIdx, setActiveSuggestionIdx] = useState(-1);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setForm(initialValues);
  }, [initialValues]);

  useEffect(() => {
    if (!form.address || form.address.trim().length < 4) {
      setSuggestions([]);
      setShowSuggestions(false);
      return;
    }

    const delayDebounce = setTimeout(async () => {
      setIsLoading(true);
      try {
        const results = await fetchAddressSuggestions(form.address);
        setSuggestions(results);
        setShowSuggestions(results.length > 0);
        setActiveSuggestionIdx(-1);
      } catch (err) {
        console.error("Suggestions error:", err);
      } finally {
        setIsLoading(false);
      }
    }, 350);

    return () => clearTimeout(delayDebounce);
  }, [form.address]);

  function update<K extends keyof MeridianFormState>(key: K, value: MeridianFormState[K]) {
    setForm((c) => ({ ...c, [key]: value }));
  }

  // Free-typing the address invalidates any previously selected coordinates so a
  // stale pin is never reused; the suggestion list will re-resolve them on pick.
  function updateAddress(value: string) {
    setForm((c) => ({ ...c, address: value, lat: null, lon: null }));
  }

  // Only fills in the address field — does NOT auto-submit the form. Captures the
  // suggestion's exact coordinates so the backend skips re-geocoding.
  function selectSuggestion(suggestion: AddressSuggestion) {
    setForm((c) => ({
      ...c,
      address: suggestion.display_name,
      lat: suggestion.latitude,
      lon: suggestion.longitude,
    }));
    setSuggestions([]);
    setShowSuggestions(false);
    setActiveSuggestionIdx(-1);
    // Refocus input so user can review and press "Analyze Property"
    setTimeout(() => inputRef.current?.focus(), 0);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (!showSuggestions || suggestions.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveSuggestionIdx((i) => Math.min(i + 1, suggestions.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveSuggestionIdx((i) => Math.max(i - 1, -1));
    } else if (e.key === "Enter" && activeSuggestionIdx >= 0) {
      e.preventDefault();
      selectSuggestion(suggestions[activeSuggestionIdx]);
    } else if (e.key === "Escape") {
      setShowSuggestions(false);
    }
  }

  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    onSubmit(form);
  }

  return (
    <div className="mx-auto w-full max-w-5xl overflow-hidden rounded-2xl border border-[color:var(--border)] bg-[color:var(--surface)] shadow-2xl">
      <div className="grid grid-cols-1 md:grid-cols-12 min-h-[520px]">
        {/* Left Side: Branding & Info */}
        <div className="md:col-span-5 flex flex-col justify-between bg-gradient-to-br from-[color:var(--surface-raised)] to-[color:var(--bg)] p-8 md:p-10 text-left border-b md:border-b-0 md:border-r border-[color:var(--border)]">
          <div>
            {/* Elegant logo/branding indicator */}
            <div className="mb-8 flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-[color:var(--accent)] animate-pulse" />
              <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-[color:var(--text-muted)]">
                Meridian Agentic Engine
              </span>
            </div>
            <h1 className="font-display text-3xl md:text-4xl font-medium tracking-tight text-[color:var(--text-primary)] leading-[1.15]">
              Know before <br className="hidden md:inline" /> you sign.
            </h1>
            <p className="mt-4 text-sm text-[color:var(--text-secondary)] leading-relaxed">
              Full cost breakdown across 5, 10, 15 & 20-year horizons. Hidden risks, hidden leverage. Powered by a swarm of open-data AI reasoning agents.
            </p>
          </div>

          <div className="mt-12 space-y-6">
            <div className="h-px bg-[color:var(--border-faint)]" />
            <div className="grid grid-cols-1 gap-5">
              {[
                { num: "7", title: "Open Data sources", desc: "Real-time municipal, tax, transit & zoning APIs", icon: Database },
                { num: "4", title: "AI reasoning agents", desc: "Collaborating to synthesize flags, costs, & projections", icon: Cpu },
                { num: "5–20yr", title: "cost horizons", desc: "Comprehensive projection metrics tailored to you", icon: Sparkles },
              ].map((s) => {
                const Icon = s.icon;
                return (
                  <div key={s.title} className="flex gap-4 items-start">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[color:var(--accent-subtle)] text-[color:var(--accent)]">
                      <Icon className="h-5 w-5" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-base font-bold text-[color:var(--accent)]">{s.num}</span>
                        <span className="text-xs font-semibold text-[color:var(--text-primary)]">— {s.title}</span>
                      </div>
                      <div className="text-[11px] text-[color:var(--text-muted)] mt-0.5">{s.desc}</div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Right Side: Form Inputs */}
        <div className="md:col-span-7 p-8 md:p-10 flex flex-col justify-center bg-[color:var(--surface)]">
          <div className="w-full">
            <h2 className="mb-6 text-xs font-bold uppercase tracking-[0.15em] text-[color:var(--text-muted)]">
              Configure Property Analysis
            </h2>
            <form className="space-y-4" onSubmit={submit}>
              <Field label="Toronto Address">
                <div className="relative">
                  <input
                    ref={inputRef}
                    className={showSuggestions ? inputActiveCls : inputCls}
                    value={form.address}
                    onChange={(e) => updateAddress(e.target.value)}
                    placeholder="401 Richmond St W, Toronto"
                    autoComplete="off"
                    onFocus={() => {
                      if (suggestions.length > 0) setShowSuggestions(true);
                    }}
                    onBlur={() => {
                      // Delay so mousedown on a suggestion registers before blur hides the list
                      setTimeout(() => setShowSuggestions(false), 200);
                    }}
                    onKeyDown={handleKeyDown}
                    required
                  />

                  {/* Spinner (while fetching) + voice dictation button */}
                  <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
                    {isLoading && (
                      <div className="h-4 w-4 animate-spin rounded-full border-2 border-[color:var(--accent)] border-t-transparent" />
                    )}
                    <MicButton
                      title="Speak the address"
                      onTranscript={(text) => updateAddress(text)}
                    />
                  </div>

                  {/* Suggestions dropdown — appears below the field, 100% opaque, does NOT submit */}
                  {showSuggestions && suggestions.length > 0 && (
                    <ul
                      className="absolute left-0 right-0 z-50 mt-1.5 overflow-hidden rounded-lg border border-[color:var(--border)] bg-white dark:bg-[#1E1E2A] shadow-2xl text-left backdrop-blur-none"
                      style={{ animation: "fadeSlideDown 0.15s ease-out" }}
                    >
                      <li className="px-4 py-2 border-b border-[color:var(--border-faint)] bg-gray-50 dark:bg-[#272735]">
                        <span className="text-[10px] font-semibold uppercase tracking-widest text-[color:var(--text-muted)]">
                          Suggested addresses
                        </span>
                      </li>
                      {suggestions.map((s, idx) => {
                        const parts = s.display_name.split(",");
                        const mainPart = parts[0]?.trim() ?? s.display_name;
                        const subPart = parts.slice(1).join(",").trim();
                        const isActive = idx === activeSuggestionIdx;

                        return (
                          <li key={idx}>
                            <button
                              type="button"
                              onMouseDown={(e) => e.preventDefault()} // prevent blur before click fires
                              onClick={() => selectSuggestion(s)}
                              className={[
                                "w-full flex items-start gap-3 px-4 py-3 text-left transition-colors outline-none",
                                isActive
                                  ? "bg-[color:var(--accent)] text-white"
                                  : "text-[color:var(--text-primary)] hover:bg-[color:var(--border-faint)]",
                                idx < suggestions.length - 1
                                  ? "border-b border-[color:var(--border-faint)]"
                                  : "",
                              ].join(" ")}
                            >
                              <MapPin
                                className={[
                                  "mt-0.5 h-3.5 w-3.5 shrink-0",
                                  isActive ? "text-white" : "text-[color:var(--accent)]",
                                ].join(" ")}
                              />
                              <div className="min-w-0">
                                <span className="block text-sm font-medium truncate leading-snug">
                                  {mainPart}
                                </span>
                                {subPart && (
                                  <span
                                    className={[
                                      "block text-xs truncate leading-relaxed mt-0.5",
                                      isActive ? "text-white/75" : "text-[color:var(--text-muted)]",
                                    ].join(" ")}
                                  >
                                    {subPart}
                                  </span>
                                )}
                              </div>
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </div>
              </Field>

              {/* Inline address error — shown only for invalid/unrecognised addresses */}
              {error && (() => {
                const isAddressErr =
                  error.includes("No geocoding result") ||
                  error.includes("Invalid address") ||
                  error.toLowerCase().includes("geocod");
                return (
                  <div className="flex items-start gap-2.5 rounded-md border border-[rgba(248,113,113,0.2)] bg-[color:var(--red-tint)] px-3.5 py-2.5 text-xs text-[color:var(--red)] transition-all animate-fade-in text-left">
                    <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                    <div>
                      <p className="font-semibold text-sm">
                        {isAddressErr ? "Invalid address" : "Analysis failed"}
                      </p>
                      <p className="mt-0.5 text-[color:var(--text-secondary)]">
                        {isAddressErr
                          ? "Please enter a valid Toronto address (e.g., 401 Richmond St W)."
                          : error}
                      </p>
                    </div>
                  </div>
                );
              })()}

              <div className="grid grid-cols-2 gap-3">
                <Field label="List Price">
                  <input
                    className={`${inputCls} font-mono`}
                    type="number"
                    min={1000}
                    step={1000}
                    value={form.listPrice}
                    onChange={(e) => update("listPrice", Number(e.target.value))}
                  />
                </Field>
                <Field label="Buyer Profile">
                  <select
                    className={inputCls}
                    value={form.buyerProfile}
                    onChange={(e) => update("buyerProfile", e.target.value as BuyerProfile)}
                  >
                    {(Object.keys(PROFILE_LABELS) as BuyerProfile[]).map((p) => (
                      <option key={p} value={p}>
                        {PROFILE_LABELS[p]}
                      </option>
                    ))}
                  </select>
                </Field>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <Field label="Down %">
                  <input
                    className={`${inputCls} font-mono`}
                    type="number"
                    min={5}
                    max={100}
                    value={form.downPaymentPercent}
                    onChange={(e) => update("downPaymentPercent", Number(e.target.value))}
                  />
                </Field>
                <Field label="Rate %">
                  <input
                    className={`${inputCls} font-mono`}
                    type="number"
                    step={0.01}
                    value={form.mortgageRate}
                    onChange={(e) => update("mortgageRate", Number(e.target.value))}
                  />
                </Field>
                <Field label="Amort. (yr)">
                  <input
                    className={`${inputCls} font-mono`}
                    type="number"
                    min={5}
                    max={35}
                    value={form.amortizationYears}
                    onChange={(e) => update("amortizationYears", Number(e.target.value))}
                  />
                </Field>
              </div>

              <button
                type="submit"
                className="mt-2 flex w-full items-center justify-center gap-2 rounded-pill bg-[color:var(--accent)] px-6 py-3.5 text-[15px] font-medium text-white transition-opacity hover:opacity-90 cursor-pointer"
              >
                Analyze Property
                <ArrowRight className="h-4 w-4" />
              </button>
            </form>
          </div>
        </div>
      </div>

      {/* Dropdown entry animation */}
      <style>{`
        @keyframes fadeSlideDown {
          from { opacity: 0; transform: translateY(-6px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}
