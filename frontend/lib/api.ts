import type {
  MeridianReasoning,
  MeridianReport,
  MeridianFormState,
  ReasoningBadge,
} from "@/lib/report";

type BackendReportResponse = {
  property: {
    address: string;
    normalized_address: string;
    latitude: number;
    longitude: number;
    ward: string | null;
  };
  true_10_year_cost: number;
  cost_breakdown: Array<{
    key: string;
    label: string;
    amount: number;
  }>;
  mortgage_scenarios: Array<{
    scenario: "bull" | "base" | "bear";
    total_cost: number;
  }>;
  flags: Array<{
    severity: "red" | "yellow" | "green" | "info";
    title: string;
    message: string;
  }>;
  warnings: string[];
  evidence_summary: {
    geocoder?: {
      source?: string;
      raw_display_name?: string | null;
    };
    heritage?: {
      status?: string;
      reason?: string;
      source?: string;
    };
    flood?: {
      in_flood_zone?: boolean;
      annual_risk_loading?: number;
      source?: string;
    };
    development?: {
      application_count_500m?: number;
      intensity?: string;
      source?: string;
    };
  };
  key_numbers: {
    land_transfer_tax_total: number;
    property_tax_10y: number;
    insured_mortgage_premium: number;
    mortgage_cost_10y_base: number;
    transit_dividend: number;
  };
  summary_text: string | null;
};

const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL?.replace(/\/$/, "") ??
  "http://127.0.0.1:8000";

function formatCurrency(value: number) {
  return new Intl.NumberFormat("en-CA", {
    style: "currency",
    currency: "CAD",
    maximumFractionDigits: 0,
  }).format(value);
}

function scenarioLabel(value: "bull" | "base" | "bear"): "Bull" | "Base" | "Bear" {
  if (value === "bull") return "Bull";
  if (value === "bear") return "Bear";
  return "Base";
}

function toneFromStatus(status?: string): ReasoningBadge["tone"] {
  if (!status) return "neutral";
  const lower = status.toLowerCase();
  if (lower.includes("high") || lower.includes("computed")) return "green";
  if (lower.includes("medium") || lower.includes("partial")) return "yellow";
  if (lower.includes("live") || lower.includes("deterministic")) return "blue";
  return "neutral";
}

function buildReasoning(
  data: BackendReportResponse,
  input: MeridianFormState,
): MeridianReasoning {
  const developmentCount =
    data.evidence_summary.development?.application_count_500m ?? 0;
  const developmentIntensity =
    data.evidence_summary.development?.intensity ?? "unavailable";
  const heritageStatus =
    data.evidence_summary.heritage?.status ?? "unavailable";
  const floodLoading =
    data.evidence_summary.flood?.annual_risk_loading ?? 0;
  const floodStatus = data.evidence_summary.flood?.in_flood_zone
    ? "Flood signal"
    : "No flood signal";

  return {
    meta: {
      sourceCount: 4,
      executionMode: "live",
      modelStatus: data.summary_text ? "Summary available" : "Deterministic only",
    },
    agents: [
      {
        title: "Agent 1 — Intake + Planning",
        mode: "Live backend intake",
        status: "Resolved",
        badges: [
          { label: "Live", tone: "blue" },
          { label: "High", tone: "green" },
        ],
        lines: [
          `Normalized address: ${data.property.normalized_address}.`,
          `Coordinates: ${data.property.latitude.toFixed(4)}, ${data.property.longitude.toFixed(4)}.`,
          `Buyer profile: ${input.buyerProfile.replace("_", "-")}. Down payment ${input.downPaymentPercent}%.`,
          "Query plan: geocode, heritage, flood, development, tax, mortgage.",
        ],
      },
      {
        title: "Agent 2 — Data Retrieval",
        mode: "Datasource adapters",
        status: data.warnings.length > 0 ? "Partial evidence" : "Live evidence",
        badges: [
          { label: heritageStatus, tone: toneFromStatus(heritageStatus) },
          { label: floodStatus, tone: data.evidence_summary.flood?.in_flood_zone ? "yellow" : "green" },
          { label: `${developmentIntensity} development`, tone: toneFromStatus(developmentIntensity) },
        ],
        lines: [
          `Heritage: ${heritageStatus}.`,
          `Flood: ${data.evidence_summary.flood?.in_flood_zone ? "intersects current flood adapter signal" : "no flood-zone hit from current adapter"}.`,
          `Development: ${developmentCount} applications within 500m (${developmentIntensity}).`,
          `Warnings: ${data.warnings.length > 0 ? data.warnings.join(" ") : "No backend warnings returned."}`,
        ],
      },
      {
        title: "Agent 3 — Analysis + Cost",
        mode: "Deterministic cost engine",
        status: "Computed",
        badges: [
          { label: "Deterministic", tone: "blue" },
          {
            label:
              data.key_numbers.insured_mortgage_premium > 0
                ? "CMHC added"
                : "No CMHC",
            tone:
              data.key_numbers.insured_mortgage_premium > 0 ? "yellow" : "green",
          },
        ],
        lines: [
          `LTT total: ${formatCurrency(data.key_numbers.land_transfer_tax_total)}.`,
          `Property tax 10Y: ${formatCurrency(data.key_numbers.property_tax_10y)}.`,
          `Mortgage base case: ${formatCurrency(data.key_numbers.mortgage_cost_10y_base)}. Scenarios: ${data.mortgage_scenarios.map((item) => `${scenarioLabel(item.scenario)} ${formatCurrency(item.total_cost)}`).join(" | ")}.`,
          `Insured premium: ${formatCurrency(data.key_numbers.insured_mortgage_premium)}. Flood loading: ${formatCurrency(floodLoading)} annualized in adapter output.`,
          `Transit dividend: ${formatCurrency(data.key_numbers.transit_dividend)}. Final true cost: ${formatCurrency(data.true_10_year_cost)}.`,
        ],
      },
      {
        title: "Agent 4 — Synthesis",
        mode: data.summary_text ? "Backend summary" : "No LLM summary",
        status: data.summary_text ? "Summary available" : "Deterministic only",
        badges: [
          {
            label: data.summary_text ? "Summary present" : "No model call",
            tone: data.summary_text ? "green" : "neutral",
          },
          { label: "Numbers not model-computed", tone: "blue" },
        ],
        lines: [
          data.summary_text
            ? "Backend returned a buyer-facing summary layered on top of deterministic numbers."
            : "No backend summary text was returned, so the UI is displaying deterministic output only.",
          "All financial outputs shown in this report originate from the deterministic engine.",
        ],
      },
    ],
  };
}

export async function fetchMeridianReport(
  input: MeridianFormState,
): Promise<MeridianReport> {
  const response = await fetch(`${API_BASE_URL}/api/v1/report`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      address: input.address,
      list_price: input.listPrice,
      buyer_profile: input.buyerProfile,
      down_payment_percent: input.downPaymentPercent,
      mortgage_rate: input.mortgageRate,
      amortization_years: input.amortizationYears,
    }),
  });

  if (!response.ok) {
    const message = await response.text();
    throw new Error(message || `Backend request failed with ${response.status}`);
  }

  const data = (await response.json()) as BackendReportResponse;
  const aboveListPercent = Math.round(
    ((data.true_10_year_cost - input.listPrice) / input.listPrice) * 100,
  );

  const flags = {
    red: data.flags
      .filter((flag) => flag.severity === "red")
      .map((flag) => flag.message),
    yellow: data.flags
      .filter((flag) => flag.severity === "yellow" || flag.severity === "info")
      .map((flag) => flag.message),
    green: data.flags
      .filter((flag) => flag.severity === "green")
      .map((flag) => flag.message),
  };

  if (data.warnings.length > 0) {
    flags.yellow.push(...data.warnings);
  }

  return {
    summary:
      data.summary_text ??
      `${data.property.normalized_address} resolved successfully. Estimated true 10-year cost is ${formatCurrency(
        data.true_10_year_cost,
      )}.`,
    trueCost: data.true_10_year_cost,
    aboveListPercent,
    transitDividend: data.key_numbers.transit_dividend,
    components: data.cost_breakdown.map((item) => ({
      label: item.label,
      value: item.amount,
      fill:
        item.key === "mortgage_base"
          ? "#10212B"
          : item.key === "land_transfer_tax"
            ? "#E16B47"
            : item.key === "property_tax_10y"
              ? "#B99239"
              : item.key === "risk_adjustments"
                ? "#8C5B4A"
                : "#2B6A57",
    })),
    scenarios: data.mortgage_scenarios.map((item) => ({
      scenario: scenarioLabel(item.scenario),
      cost: item.total_cost,
    })),
    flags,
    inputs: input,
    keyNumbers: {
      ltt: data.key_numbers.land_transfer_tax_total,
      propertyTax10y: data.key_numbers.property_tax_10y,
      insuredPremium: data.key_numbers.insured_mortgage_premium,
      baseMortgageCost10y: data.key_numbers.mortgage_cost_10y_base,
    },
    reasoning: buildReasoning(data, input),
  };
}

export function getApiBaseUrl() {
  return API_BASE_URL;
}
