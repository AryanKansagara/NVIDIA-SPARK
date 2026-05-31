import type {
  BreakdownPoint,
  MeridianFormState,
  MeridianReport,
  ScenarioPoint,
} from "./report";

const FILL_COLORS: Record<string, string> = {
  purchase_price: "#10212B",
  mortgage_interest_10y: "#1D3D4F",
  land_transfer_tax: "#E16B47",
  property_tax_10y: "#B99239",
  risk_adjustments: "#8C5B4A",
  transit_dividend: "#2B6A57",
};

type BackendFlag = {
  severity: "red" | "yellow" | "green" | "info";
  title: string;
  message: string;
};

type BackendReport = {
  property: {
    address: string;
    normalized_address: string;
    latitude: number;
    longitude: number;
    ward: string | null;
  };
  true_cost: number;
  cash_outflow_10y: number;
  cost_breakdown: { key: string; label: string; amount: number }[];
  mortgage_scenarios: { scenario: "bull" | "base" | "bear"; total_cost: number }[];
  flags: BackendFlag[];
  warnings: string[];
  key_numbers: {
    land_transfer_tax_total: number;
    property_tax_10y: number;
    insured_mortgage_premium: number;
    mortgage_cost_10y_base: number;
    transit_dividend: number;
  };
  summary_text: string | null;
};

const SCENARIO_ORDER = { bull: 0, base: 1, bear: 2 } as const;

function mapReport(backend: BackendReport, inputs: MeridianFormState): MeridianReport {
  const trueCost = backend.true_cost;
  const cashOutflow10y = backend.cash_outflow_10y;
  const aboveListPercent = Math.round(((trueCost - inputs.listPrice) / inputs.listPrice) * 100);

  const components: BreakdownPoint[] = backend.cost_breakdown.map((c) => ({
    label: c.label,
    value: c.amount,
    fill: FILL_COLORS[c.key] ?? "#888888",
  }));

  const scenarios: ScenarioPoint[] = [...backend.mortgage_scenarios]
    .sort((a, b) => SCENARIO_ORDER[a.scenario] - SCENARIO_ORDER[b.scenario])
    .map((s) => ({
      scenario: (s.scenario.charAt(0).toUpperCase() + s.scenario.slice(1)) as ScenarioPoint["scenario"],
      cost: s.total_cost,
    }));

  const flags: MeridianReport["flags"] = { red: [], yellow: [], green: [] };
  for (const flag of backend.flags) {
    const text = `${flag.title} — ${flag.message}`;
    if (flag.severity === "red") flags.red.push(text);
    else if (flag.severity === "yellow") flags.yellow.push(text);
    else if (flag.severity === "green") flags.green.push(text);
  }
  for (const warning of backend.warnings) {
    flags.yellow.push(warning);
  }

  const summary =
    backend.summary_text ??
    `${backend.property.normalized_address} — true ownership cost is ${trueCost.toLocaleString("en-CA", { style: "currency", currency: "CAD", maximumFractionDigits: 0 })}, about ${aboveListPercent}% above list price.`;

  return {
    summary,
    trueCost,
    cashOutflow10y,
    aboveListPercent,
    transitDividend: backend.key_numbers.transit_dividend,
    components,
    scenarios,
    flags,
    inputs,
    keyNumbers: {
      ltt: backend.key_numbers.land_transfer_tax_total,
      propertyTax10y: backend.key_numbers.property_tax_10y,
      insuredPremium: backend.key_numbers.insured_mortgage_premium,
      baseMortgageCost10y: backend.key_numbers.mortgage_cost_10y_base,
    },
  };
}

export async function fetchReport(inputs: MeridianFormState): Promise<MeridianReport> {
  const res = await fetch("/api/v1/report", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      address: inputs.address,
      list_price: inputs.listPrice,
      buyer_profile: inputs.buyerProfile,
      property_type: inputs.propertyType,
      down_payment_percent: inputs.downPaymentPercent,
      mortgage_rate: inputs.mortgageRate,
      amortization_years: inputs.amortizationYears,
    }),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => res.statusText);
    throw new Error(`Report API ${res.status}: ${detail}`);
  }

  return mapReport(await res.json(), inputs);
}
