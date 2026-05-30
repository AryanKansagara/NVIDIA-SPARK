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

export type MonteCarloDistribution = {
  p10: number;
  p50: number;
  p90: number;
  mean: number;
  trajectoriesSampled: number;
  elapsedMs: number | null;
};

export type MapGeometry = {
  propertyLat: number;
  propertyLon: number;
  floodPolygonGeojson: object | null;
  devPressureRadiusM: number;
};

export type MeridianReport = {
  summary: string;
  trueCost: number;
  aboveListPercent: number;
  transitDividend: number;
  components: BreakdownPoint[];
  scenarios: ScenarioPoint[];
  flags: {
    red: string[];
    yellow: string[];
    green: string[];
  };
  inputs: MeridianFormState;
  keyNumbers: {
    ltt: number;
    propertyTax10y: number;
    insuredPremium: number;
    baseMortgageCost10y: number;
  };
  monteCarlo: MonteCarloDistribution | null;
  mapGeometry: MapGeometry | null;
};

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

  const redFlags = [
    inputs.address.toLowerCase().includes("richmond")
      ? "Downtown core address. Heritage and permit review risk should be checked immediately."
      : "Permit and heritage checks still need backend evidence before this can be cleared.",
  ];

  if (inputs.downPaymentPercent < 20) {
    redFlags.push(
      `Down payment under 20% triggers default-insured borrowing. Estimated premium added to principal: ${new Intl.NumberFormat(
        "en-CA",
        { style: "currency", currency: "CAD", maximumFractionDigits: 0 },
      ).format(insuredPremium)}.`,
    );
  }

  const yellowFlags = [
    "This frontend preview uses deterministic assumptions for transit, risk loadings, and assessment proxy until live datasets are wired.",
    `Two 5-year mortgage terms are modeled. Renewal sensitivity is meaningful at the current starting rate of ${inputs.mortgageRate.toFixed(
      2,
    )}%.`,
  ];

  const greenFlags = [
    `Transit dividend currently offsets about ${new Intl.NumberFormat("en-CA", {
      style: "currency",
      currency: "CAD",
      maximumFractionDigits: 0,
    }).format(inferredTransitDividend)} versus the car-dependent 10-year baseline of ${new Intl.NumberFormat(
      "en-CA",
      { style: "currency", currency: "CAD", maximumFractionDigits: 0 },
    ).format(CAR_BASELINE_10Y)}.`,
  ];

  if (inputs.buyerProfile === "first_time") {
    greenFlags.push(
      "First-time buyer benefits are active in this preview, including FHSA, RRSP HBP, and the combined land transfer tax rebate.",
    );
  }

  return {
    summary: summarize(inputs.buyerProfile, aboveListPercent, inputs.address),
    trueCost: currencyRounding(trueCost),
    aboveListPercent,
    transitDividend: inferredTransitDividend,
    components,
    scenarios: [
      { scenario: "Bull", cost: currencyRounding(downPayment + ltt + propertyTax10y + bullMortgage + riskAdjustments - inferredTransitDividend) },
      { scenario: "Base", cost: currencyRounding(trueCost) },
      { scenario: "Bear", cost: currencyRounding(downPayment + ltt + propertyTax10y + bearMortgage + riskAdjustments - inferredTransitDividend) },
    ],
    flags: {
      red: redFlags,
      yellow: yellowFlags,
      green: greenFlags,
    },
    inputs,
    keyNumbers: {
      ltt: currencyRounding(ltt),
      propertyTax10y: currencyRounding(propertyTax10y),
      insuredPremium: currencyRounding(insuredPremium),
      baseMortgageCost10y: currencyRounding(baseMortgage),
    },
    monteCarlo: null,
    mapGeometry: null,
  };
}
