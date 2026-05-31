import type { MeridianReport, MeridianFormState } from "@/lib/report";

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

function scenarioLabel(value: "bull" | "base" | "bear"): "Bull" | "Base" | "Bear" {
  if (value === "bull") return "Bull";
  if (value === "bear") return "Bear";
  return "Base";
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
      `${data.property.normalized_address} resolved successfully. Estimated true 10-year cost is ${new Intl.NumberFormat(
        "en-CA",
        { style: "currency", currency: "CAD", maximumFractionDigits: 0 },
      ).format(data.true_10_year_cost)}.`,
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
  };
}

export function getApiBaseUrl() {
  return API_BASE_URL;
}
