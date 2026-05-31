import {
  DEFAULT_COORDINATES,
  type BreakdownPoint,
  type Confidence,
  type CostRow,
  type Flag,
  type MeridianFormState,
  type MeridianReport,
  type ScenarioPoint,
  type Severity,
  type Verdict,
} from "./report";

const FILL_COLORS: Record<string, string> = {
  mortgage_base: "#10212B",
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
  true_10_year_cost: number;
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

// Backend severities → UI severities (the UI uses "amber" where the backend uses "yellow").
const SEVERITY_MAP: Record<BackendFlag["severity"], Severity> = {
  red: "red",
  yellow: "amber",
  green: "green",
  info: "green",
};

// Backend confidence isn't structured per-flag yet, so derive a sensible badge from severity.
const CONFIDENCE_BY_SEVERITY: Record<Severity, Confidence> = {
  red: "high",
  amber: "medium",
  green: "high",
};

function money(value: number) {
  return new Intl.NumberFormat("en-CA", {
    style: "currency",
    currency: "CAD",
    maximumFractionDigits: 0,
  }).format(value);
}

function mapReport(backend: BackendReport, inputs: MeridianFormState): MeridianReport {
  const trueCost = backend.true_10_year_cost;
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

  // Map backend flags to structured Flags; "green"/"info" become composite signals,
  // everything else is a risk flag.
  const riskFlags: Flag[] = [];
  const compositeSignals: Flag[] = [];
  for (const flag of backend.flags) {
    const severity = SEVERITY_MAP[flag.severity];
    const f: Flag = {
      severity,
      title: flag.title,
      description: flag.message,
      confidence: CONFIDENCE_BY_SEVERITY[severity],
    };
    if (flag.severity === "green" || flag.severity === "info") compositeSignals.push(f);
    else riskFlags.push(f);
  }
  for (const warning of backend.warnings) {
    compositeSignals.push({
      severity: "amber",
      title: "Data note",
      description: warning,
      confidence: "low",
    });
  }

  const costRows: CostRow[] = [
    {
      label: "Mortgage (base scenario)",
      annual: Math.round(backend.key_numbers.mortgage_cost_10y_base / 10),
      tenYear: backend.key_numbers.mortgage_cost_10y_base,
      confidence: "high",
    },
    {
      label: "Property tax (10-year)",
      annual: Math.round(backend.key_numbers.property_tax_10y / 10),
      tenYear: backend.key_numbers.property_tax_10y,
      confidence: "high",
    },
    {
      label: "Land transfer tax (one-time)",
      annual: null,
      tenYear: backend.key_numbers.land_transfer_tax_total,
      confidence: "high",
    },
    {
      label: "CMHC premium",
      annual: null,
      tenYear: backend.key_numbers.insured_mortgage_premium,
      confidence: "high",
    },
    {
      label: "Transit dividend",
      annual: null,
      tenYear: -backend.key_numbers.transit_dividend,
      confidence: "medium",
    },
  ];

  const redCount = riskFlags.filter((f) => f.severity === "red").length;
  const verdict: Verdict =
    redCount >= 2 || aboveListPercent > 60
      ? "RED"
      : redCount >= 1 || aboveListPercent > 25
        ? "YELLOW"
        : "GREEN";

  const documentedPremium = Math.max(0, trueCost - inputs.listPrice);
  const leverageMid = Math.round((documentedPremium * 0.08) / 1000) * 1000;
  const leverage = {
    low: Math.max(5000, leverageMid),
    high: Math.max(15000, Math.round((leverageMid * 1.4) / 1000) * 1000),
  };

  const summary =
    backend.summary_text ??
    `${backend.property.normalized_address} — estimated true 10-year cost is ${money(trueCost)}, about ${aboveListPercent}% above list price.`;

  const lat = backend.property.latitude || DEFAULT_COORDINATES.lat;
  const lng = backend.property.longitude || DEFAULT_COORDINATES.lng;

  return {
    summary,
    verdict,
    leverage,
    trueCost,
    aboveListPercent,
    transitDividend: backend.key_numbers.transit_dividend,
    components,
    scenarios,
    riskFlags,
    compositeSignals,
    costRows,
    totalTenYear: trueCost,
    coordinates: { lat, lng },
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
