export type BuyerProfile = "first_time" | "investor" | "downsizer";

export type MeridianFormState = {
  address: string;
  listPrice: number;
  buyerProfile: BuyerProfile;
  downPaymentPercent: number;
  mortgageRate: number;
  amortizationYears: number;
};

export type ScenarioPoint = {
  scenario: "Bull" | "Base" | "Bear";
  cost: number;
};

export type BreakdownPoint = {
  label: string;
  value: number;
  fill: string;
};

export type Confidence = "high" | "medium" | "low" | "unknown";
export type Severity = "red" | "amber" | "green";

export type Flag = {
  severity: Severity;
  title: string;
  description: string;
  confidence: Confidence;
  // Optional "Say this at the table" negotiation script.
  script?: { text: string; amount: string };
  // Optional disclaimer shown under composite signals.
  note?: string;
};

export type CostRow = {
  label: string;
  annual: number | null; // null renders as an em dash (one-time costs)
  tenYear: number;
  confidence: Confidence;
};

export type Verdict = "GREEN" | "YELLOW" | "RED";

export type MeridianReport = {
  summary: string;
  verdict: Verdict;
  leverage: { low: number; high: number };
  trueCost: number;
  aboveListPercent: number;
  transitDividend: number;
  components: BreakdownPoint[];
  scenarios: ScenarioPoint[];
  riskFlags: Flag[];
  compositeSignals: Flag[];
  costRows: CostRow[];
  totalTenYear: number;
  coordinates: { lat: number; lng: number };
  inputs: MeridianFormState;
  keyNumbers: {
    ltt: number;
    propertyTax10y: number;
    insuredPremium: number;
    baseMortgageCost10y: number;
  };
};

// Fallback coordinate (≈ 401 Richmond St W) when no geocode is available.
export const DEFAULT_COORDINATES = { lat: 43.6492, lng: -79.3925 };

const PROPERTY_TAX_RATE = 0.00767311;
const ASSESSED_VALUE_FACTOR = 0.6;
const PROPERTY_TAX_GROWTH = 0.03;
const CAR_BASELINE_10Y = 120000;

function currencyRounding(value: number) {
  return Math.round(value);
}

function landTransferTaxOntario(price: number) {
  let total = 0;
  const bands = [
    { limit: 55000, rate: 0.005 },
    { limit: 250000, rate: 0.01 },
    { limit: 400000, rate: 0.015 },
    { limit: 2000000, rate: 0.02 },
    { limit: Number.POSITIVE_INFINITY, rate: 0.025 },
  ];

  let previous = 0;
  for (const band of bands) {
    const taxable = Math.min(price, band.limit) - previous;
    if (taxable > 0) {
      total += taxable * band.rate;
      previous = band.limit;
    }
    if (price <= band.limit) break;
  }

  return total;
}

function landTransferTaxToronto(price: number) {
  let total = 0;
  const bands = [
    { limit: 55000, rate: 0.005 },
    { limit: 250000, rate: 0.01 },
    { limit: 400000, rate: 0.015 },
    { limit: 2000000, rate: 0.02 },
    { limit: Number.POSITIVE_INFINITY, rate: 0.025 },
  ];

  let previous = 0;
  for (const band of bands) {
    const taxable = Math.min(price, band.limit) - previous;
    if (taxable > 0) {
      total += taxable * band.rate;
      previous = band.limit;
    }
    if (price <= band.limit) break;
  }

  return total;
}

function cmhcPremiumRate(downPaymentPercent: number) {
  if (downPaymentPercent >= 20) return 0;
  if (downPaymentPercent >= 15) return 0.028;
  if (downPaymentPercent >= 10) return 0.031;
  return 0.04;
}

function monthlyPayment(principal: number, annualRatePercent: number, years: number) {
  const monthlyRate = annualRatePercent / 100 / 12;
  const totalMonths = years * 12;
  if (monthlyRate === 0) return principal / totalMonths;
  const factor = Math.pow(1 + monthlyRate, totalMonths);
  return principal * ((monthlyRate * factor) / (factor - 1));
}

function remainingBalance(
  principal: number,
  annualRatePercent: number,
  years: number,
  monthsPaid: number,
) {
  const monthlyRate = annualRatePercent / 100 / 12;
  const totalMonths = years * 12;
  const payment = monthlyPayment(principal, annualRatePercent, years);

  if (monthlyRate === 0) {
    return principal - payment * monthsPaid;
  }

  const factor = Math.pow(1 + monthlyRate, monthsPaid);
  const fullFactor = Math.pow(1 + monthlyRate, totalMonths);
  return principal * ((fullFactor - factor) / (fullFactor - 1));
}

function tenYearMortgageCost(
  principal: number,
  startRate: number,
  amortizationYears: number,
  renewalDelta: number,
) {
  const firstTermMonths = 60;
  const secondTermMonths = 60;
  const firstPayment = monthlyPayment(principal, startRate, amortizationYears);
  const firstCost = firstPayment * firstTermMonths;
  const balanceAfterFirstTerm = remainingBalance(
    principal,
    startRate,
    amortizationYears,
    firstTermMonths,
  );
  const secondRate = Math.max(0.5, startRate + renewalDelta);
  const secondPayment = monthlyPayment(
    balanceAfterFirstTerm,
    secondRate,
    Math.max(1, amortizationYears - 5),
  );
  const secondCost = secondPayment * secondTermMonths;

  return firstCost + secondCost;
}

function taxProjection10Y(price: number) {
  const annualTax = price * ASSESSED_VALUE_FACTOR * PROPERTY_TAX_RATE;
  const factor =
    (Math.pow(1 + PROPERTY_TAX_GROWTH, 10) - 1) / PROPERTY_TAX_GROWTH;

  return annualTax * factor;
}

function transitDividend(address: string) {
  const downtownKeywords = [
    "king",
    "queen",
    "richmond",
    "front",
    "bloor",
    "yonge",
    "spadina",
    "st clair",
    "college",
    "dundas",
    "union",
    "osgoode",
  ];
  const lower = address.toLowerCase();
  const matched = downtownKeywords.some((keyword) => lower.includes(keyword));
  return matched ? 87000 : 28000;
}

function summarize(profile: BuyerProfile, aboveListPercent: number, address: string) {
  const profileLabel =
    profile === "first_time"
      ? "first-time buyer"
      : profile === "investor"
        ? "investor"
        : "downsizer";

  return `${address} screens as a higher-friction purchase for a ${profileLabel}. The current preview puts true 10-year carrying cost about ${aboveListPercent}% above list once taxes, mortgage servicing, and location-linked signals are included.`;
}

export function defaultFormState(): MeridianFormState {
  return {
    address: "401 Richmond St W, Toronto",
    listPrice: 850000,
    buyerProfile: "first_time",
    downPaymentPercent: 10,
    mortgageRate: 4.79,
    amortizationYears: 25,
  };
}

export function buildPreviewReport(inputs: MeridianFormState): MeridianReport {
  const listPrice = Math.max(1, inputs.listPrice);
  const downPayment = (listPrice * inputs.downPaymentPercent) / 100;
  const borrowedBase = listPrice - downPayment;
  const insuredPremium = borrowedBase * cmhcPremiumRate(inputs.downPaymentPercent);
  const mortgagePrincipal = borrowedBase + insuredPremium;

  const ontarioLtt = landTransferTaxOntario(listPrice);
  const torontoLtt = landTransferTaxToronto(listPrice);
  const rebate = inputs.buyerProfile === "first_time" ? 8475 : 0;
  const ltt = Math.max(0, ontarioLtt + torontoLtt - rebate);

  const propertyTax10y = taxProjection10Y(listPrice);
  const baseMortgage = tenYearMortgageCost(
    mortgagePrincipal,
    inputs.mortgageRate,
    inputs.amortizationYears,
    0,
  );
  const bearMortgage = tenYearMortgageCost(
    mortgagePrincipal,
    inputs.mortgageRate,
    inputs.amortizationYears,
    1.5,
  );
  const bullMortgage = tenYearMortgageCost(
    mortgagePrincipal,
    inputs.mortgageRate,
    inputs.amortizationYears,
    -0.5,
  );

  const inferredTransitDividend = transitDividend(inputs.address);
  const riskAdjustments =
    (inputs.address.toLowerCase().includes("richmond") ? 29000 : 18000) +
    (inputs.buyerProfile === "investor" ? 8000 : 0);

  const trueCost = downPayment + ltt + propertyTax10y + baseMortgage + riskAdjustments - inferredTransitDividend;
  const aboveListPercent = currencyRounding(((trueCost - listPrice) / listPrice) * 100);

  const components: BreakdownPoint[] = [
    { label: "Mortgage", value: currencyRounding(baseMortgage), fill: "#10212B" },
    { label: "Transfer Tax", value: currencyRounding(ltt), fill: "#E16B47" },
    { label: "Property Tax", value: currencyRounding(propertyTax10y), fill: "#B99239" },
    { label: "Risk Loadings", value: currencyRounding(riskAdjustments), fill: "#8C5B4A" },
    { label: "Transit Dividend", value: currencyRounding(-inferredTransitDividend), fill: "#2B6A57" },
  ];

  // ── Structured risk flags (computed from inputs) ──────────────
  const riskFlags: Flag[] = [];

  if (inputs.downPaymentPercent < 20) {
    riskFlags.push({
      severity: "red",
      title: `Default-insured mortgage — ${inputs.downPaymentPercent}% down`,
      description: `A down payment under 20% triggers CMHC default insurance. The estimated premium of ${money(insuredPremium)} is added to your mortgage principal, so you pay interest on it for the full amortization.`,
      confidence: "high",
      script: {
        text: "Because we're carrying a default-insured mortgage, the effective borrowing cost is higher than the sticker rate implies. I'd like that reflected in the price.",
        amount: `→ Supports a ${money(insuredPremium)} adjustment`,
      },
    });
  }

  riskFlags.push({
    severity: aboveListPercent > 40 ? "red" : "amber",
    title: `True 10-year cost runs ${aboveListPercent}% above list`,
    description: `Once land transfer tax, ${inputs.amortizationYears}-year mortgage servicing across two 5-year terms, and a 10-year property-tax projection are included, the real cost of ownership is materially higher than the ${money(listPrice)} list price.`,
    confidence: "high",
    script: {
      text: "The list price reflects none of the carrying costs we've documented. I'd like to open from a number that accounts for the true 10-year cost.",
      amount: `→ Documented premium: ${money(Math.max(0, trueCost - listPrice))}`,
    },
  });

  riskFlags.push({
    severity: "amber",
    title: `Renewal exposure at ${inputs.mortgageRate.toFixed(2)}% starting rate`,
    description: `Two 5-year terms are modeled. At renewal, the bear case (+1.5%) adds ${money(Math.max(0, bearMortgage - baseMortgage))} over the base scenario across 10 years — renewal sensitivity is meaningful at today's rate.`,
    confidence: "medium",
    script: {
      text: "Rate-renewal risk is real on a 25-year amortization. I'd want pricing that gives us a cushion against the renewal scenarios.",
      amount: `→ Bear-case delta: ${money(Math.max(0, bearMortgage - baseMortgage))}`,
    },
  });

  // ── Composite signals (always Low confidence, no scripts) ─────
  const compositeSignals: Flag[] = [];

  if (inputs.downPaymentPercent < 20 || aboveListPercent > 30) {
    compositeSignals.push({
      severity: "amber",
      title: "Carrying-cost pressure — Elevated",
      description: `Factors: ${inputs.downPaymentPercent < 20 ? "insured borrowing, " : ""}${aboveListPercent > 30 ? "high cost-to-list ratio, " : ""}two-term renewal exposure.`,
      confidence: "low",
      note: "This is an inferred composite signal, not evidence of a specific assessment. Confidence is always Low for composite signals.",
    });
  }

  compositeSignals.push({
    severity: inferredTransitDividend >= 80000 ? "green" : "amber",
    title: `Transit dividend — ${inferredTransitDividend >= 80000 ? "Strong" : "Moderate"}`,
    description: `Location signals offset about ${money(inferredTransitDividend)} versus a car-dependent 10-year baseline of ${money(CAR_BASELINE_10Y)}.`,
    confidence: "low",
    note: "This is a location-based signal, not a guaranteed saving. Confidence is always Low for composite signals.",
  });

  // ── Cost table rows ───────────────────────────────────────────
  const costRows: CostRow[] = [
    {
      label: `Mortgage (base scenario, ${inputs.mortgageRate.toFixed(2)}%)`,
      annual: currencyRounding(baseMortgage / 10),
      tenYear: currencyRounding(baseMortgage),
      confidence: "high",
    },
    {
      label: "Property tax (assessed proxy, 3% growth)",
      annual: currencyRounding(propertyTax10y / 10),
      tenYear: currencyRounding(propertyTax10y),
      confidence: "high",
    },
    {
      label: "Land transfer tax (one-time)",
      annual: null,
      tenYear: currencyRounding(ltt),
      confidence: "high",
    },
    {
      label: "CMHC premium",
      annual: null,
      tenYear: currencyRounding(insuredPremium),
      confidence: "high",
    },
    {
      label: "Risk loadings",
      annual: currencyRounding(riskAdjustments / 10),
      tenYear: currencyRounding(riskAdjustments),
      confidence: "medium",
    },
    {
      label: "Transit dividend",
      annual: null,
      tenYear: -currencyRounding(inferredTransitDividend),
      confidence: "medium",
    },
  ];

  // ── Verdict + leverage (derived) ──────────────────────────────
  const redCount = riskFlags.filter((f) => f.severity === "red").length;
  const verdict: Verdict =
    redCount >= 2 || aboveListPercent > 60
      ? "RED"
      : redCount >= 1 || aboveListPercent > 25
        ? "YELLOW"
        : "GREEN";

  // Sum documented premiums into a conservative leverage range.
  const documentedPremium = Math.max(0, trueCost - listPrice);
  const leverageMid = Math.round((documentedPremium * 0.08) / 1000) * 1000;
  const leverage = {
    low: Math.max(5000, leverageMid),
    high: Math.max(15000, Math.round((leverageMid * 1.4) / 1000) * 1000),
  };

  return {
    summary: summarize(inputs.buyerProfile, aboveListPercent, inputs.address),
    verdict,
    leverage,
    trueCost: currencyRounding(trueCost),
    aboveListPercent,
    transitDividend: inferredTransitDividend,
    components,
    scenarios: [
      { scenario: "Bull", cost: currencyRounding(downPayment + ltt + propertyTax10y + bullMortgage + riskAdjustments - inferredTransitDividend) },
      { scenario: "Base", cost: currencyRounding(trueCost) },
      { scenario: "Bear", cost: currencyRounding(downPayment + ltt + propertyTax10y + bearMortgage + riskAdjustments - inferredTransitDividend) },
    ],
    riskFlags,
    compositeSignals,
    costRows,
    totalTenYear: currencyRounding(trueCost),
    coordinates: DEFAULT_COORDINATES,
    inputs,
    keyNumbers: {
      ltt: currencyRounding(ltt),
      propertyTax10y: currencyRounding(propertyTax10y),
      insuredPremium: currencyRounding(insuredPremium),
      baseMortgageCost10y: currencyRounding(baseMortgage),
    },
  };
}

function money(value: number) {
  return new Intl.NumberFormat("en-CA", {
    style: "currency",
    currency: "CAD",
    maximumFractionDigits: 0,
  }).format(value);
}
