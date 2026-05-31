export type BuyerProfile = "first_time" | "investor";

export type MeridianFormState = {
  address: string;
  listPrice: number;
  buyerProfile: BuyerProfile;
  downPaymentPercent: number;
  mortgageRate: number;
  amortizationYears: number;
  // Exact coordinates captured when the address is chosen from an autocomplete
  // suggestion. Sent to the backend so it skips the ambiguous re-geocode and the
  // map pins precisely where the user selected. Cleared when the address is edited.
  lat?: number | null;
  lon?: number | null;
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

export type PipelineStep = {
  name: string;
  startedMs: number;
  elapsedMs: number;
  parallelGroup: number;
};

export type CommunityInsight = {
  headline: string;
  medianEstimate: number;
  typicalRangeLow: number;
  typicalRangeHigh: number;
  pricePerSqftEstimate: number;
  trend: "rising" | "stable" | "cooling";
  notes: string[];
};

export type MapGeometry = {
  propertyLat: number;
  propertyLon: number;
  floodPolygonGeojson: object | null;
  devPressureRadiusM: number;
  communityInsights: CommunityInsight | null;
};

export type Confidence = "High" | "Medium" | "Low";

export type Flag = {
  severity: "red" | "yellow" | "green" | "info";
  title: string;
  message: string;
  confidence: Confidence;
  detail: string | null;
  sayAtTable: string | null;
  leverageLow: number | null;
  leverageHigh: number | null;
  source: string | null;
};

export type CompositeSignal = {
  signalName: string;
  value: "Low" | "Medium" | "Elevated" | "High";
  label: string;
  factors: string[];
  disclaimer: string;
  confidence: "Low";
};

export type CostRow = {
  key: string;
  label: string;
  annual: number | null;
  total: number;
  confidence: Confidence;
  oneTime: boolean;
  isCredit: boolean;
};

export type AgentReasoning = {
  agent: string;
  title: string;
  mode: string;
  body: string;
};

export type MeridianReport = {
  summary: string;
  trueCost: number;
  aboveListPercent: number;
  transitDividend: number;
  components: BreakdownPoint[];
  scenarios: ScenarioPoint[];
  flags: Flag[];
  compositeSignals: CompositeSignal[];
  costRowsByHorizon: Record<string, CostRow[]>;
  agentReasoning: AgentReasoning[];
  inputs: MeridianFormState;
  keyNumbers: {
    ltt: number;
    propertyTax10y: number;
    insuredPremium: number;
    baseMortgageCost10y: number;
  };
  monteCarlo: MonteCarloDistribution | null;
  monteCarloHorizons: Record<string, MonteCarloDistribution>;
  horizonCosts: Record<string, number>;
  mapGeometry: MapGeometry | null;
  pipelineTrace: PipelineStep[];
};

export const HORIZONS = [5, 10, 15, 20] as const;

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
  return taxProjection(price, 10);
}

function taxProjection(price: number, years: number) {
  const annualTax = price * ASSESSED_VALUE_FACTOR * PROPERTY_TAX_RATE;
  const factor = (Math.pow(1 + PROPERTY_TAX_GROWTH, years) - 1) / PROPERTY_TAX_GROWTH;
  return annualTax * factor;
}

// Mirror of backend ReportEngine._mortgage_cost — rolling 60-month terms.
function mortgageCostHorizon(
  principal: number,
  startRate: number,
  amortizationYears: number,
  horizonYears: number,
) {
  let monthsLeft = horizonYears * 12;
  let balance = principal;
  let amortLeft = amortizationYears;
  let cost = 0;
  while (monthsLeft > 0 && balance > 0) {
    const months = Math.min(60, monthsLeft);
    const payment = monthlyPayment(balance, startRate, Math.max(1, amortLeft));
    cost += payment * months;
    balance = remainingBalance(balance, startRate, Math.max(1, amortLeft), months);
    amortLeft -= months / 12;
    monthsLeft -= months;
  }
  return cost;
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
  const profileLabel = profile === "first_time" ? "first-time buyer" : "investor";

  return `${address} screens as a higher-friction purchase for a ${profileLabel}. The current preview puts true 10-year carrying cost about ${aboveListPercent}% above list once taxes, mortgage servicing, and location-linked signals are included.`;
}

export function defaultFormState(): MeridianFormState {
  return {
    address: "",
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

  // Deterministic 5/10/15/20-year anchors (mirrors backend horizon_totals).
  const horizonCosts: Record<string, number> = {};
  for (const years of HORIZONS) {
    const tax = taxProjection(listPrice, years);
    const mortgage = mortgageCostHorizon(mortgagePrincipal, inputs.mortgageRate, inputs.amortizationYears, years);
    const risk = riskAdjustments * (years / 10);
    const transit = inferredTransitDividend * (years / 10);
    horizonCosts[`${years}y`] = currencyRounding(downPayment + ltt + tax + mortgage + risk - transit);
  }

  const components: BreakdownPoint[] = [
    { label: "Mortgage", value: currencyRounding(baseMortgage), fill: "#10212B" },
    { label: "Transfer Tax", value: currencyRounding(ltt), fill: "#E16B47" },
    { label: "Property Tax", value: currencyRounding(propertyTax10y), fill: "#B99239" },
    { label: "Risk Loadings", value: currencyRounding(riskAdjustments), fill: "#8C5B4A" },
    { label: "Transit Dividend", value: currencyRounding(-inferredTransitDividend), fill: "#2B6A57" },
  ];

  // Structured flags (mirror of backend RiskFlag fields). The offline preview has no
  // live heritage/flood/development evidence, so it surfaces the deterministic flags
  // it can compute (insured premium, transit dividend) plus a preview caution.
  const fmtCad = (v: number) =>
    new Intl.NumberFormat("en-CA", { style: "currency", currency: "CAD", maximumFractionDigits: 0 }).format(v);

  const flags: Flag[] = [];
  if (inputs.downPaymentPercent < 20) {
    flags.push({
      severity: "yellow",
      title: "Insured mortgage premium",
      message: `Down payment under 20% adds an estimated insured premium of ${fmtCad(insuredPremium)} to principal.`,
      confidence: "High",
      detail:
        "CMHC default insurance is mandatory when the down payment is under 20%. The premium is added to the mortgage principal, and Ontario PST on the premium is payable at closing.",
      sayAtTable: null,
      leverageLow: null,
      leverageHigh: null,
      source: "CMHC premium schedule",
    });
  }
  flags.push({
    severity: "yellow",
    title: "Offline preview",
    message:
      "This is a deterministic preview. Heritage, flood, and development-pressure evidence load once the backend is reachable.",
    confidence: "Medium",
    detail:
      "Transit, risk loadings, and the assessed-value proxy use fixed assumptions in offline preview mode. Live datasets refine these once the pipeline runs.",
    sayAtTable: null,
    leverageLow: null,
    leverageHigh: null,
    source: "Frontend preview engine",
  });
  flags.push({
    severity: "green",
    title: "Transit dividend",
    message: `Transit alignment offsets roughly ${fmtCad(inferredTransitDividend)} versus the car-dependent 10-year baseline of ${fmtCad(CAR_BASELINE_10Y)}.`,
    confidence: "Medium",
    detail:
      "Estimated transport-cost savings versus a car-dependent location, based on proximity to TTC rapid-transit corridors.",
    sayAtTable: null,
    leverageLow: null,
    leverageHigh: null,
    source: "TTC routes & schedules (GTFS)",
  });
  if (inputs.buyerProfile === "first_time") {
    flags.push({
      severity: "green",
      title: "First-time buyer benefits",
      message: "FHSA, RRSP HBP, and the combined land transfer tax rebate are active for this profile.",
      confidence: "High",
      detail: null,
      sayAtTable: null,
      leverageLow: null,
      leverageHigh: null,
      source: "CRA / Ontario LTT rules",
    });
  }

  // Per-horizon cost rows (mirror of backend cost_rows_by_horizon).
  const ontarioRebate = inputs.buyerProfile === "first_time" ? 4000 : 0;
  const torontoRebate = inputs.buyerProfile === "first_time" ? 4475 : 0;
  const ontarioLttNet = Math.max(0, currencyRounding(ontarioLtt - ontarioRebate));
  const torontoLttNet = Math.max(0, currencyRounding(torontoLtt - torontoRebate));
  const cmhcTotal = currencyRounding(insuredPremium * 1.08);
  const rateLabel = `${inputs.mortgageRate.toFixed(2)}%`;

  const costRowsByHorizon: Record<string, CostRow[]> = {};
  for (const years of HORIZONS) {
    const mortgage = currencyRounding(
      mortgageCostHorizon(mortgagePrincipal, inputs.mortgageRate, inputs.amortizationYears, years),
    );
    const tax = currencyRounding(taxProjection(listPrice, years));
    const transit = currencyRounding(inferredTransitDividend * (years / 10));
    costRowsByHorizon[`${years}y`] = [
      { key: "mortgage_base", label: `Mortgage (base scenario, ${rateLabel})`, annual: currencyRounding(mortgage / years), total: mortgage, confidence: "High", oneTime: false, isCredit: false },
      { key: "property_tax", label: "Property tax (AV proxy, 3.5% growth)", annual: currencyRounding(tax / years), total: tax, confidence: "High", oneTime: false, isCredit: false },
      { key: "ontario_ltt", label: "Ontario LTT (one-time)", annual: null, total: ontarioLttNet, confidence: "High", oneTime: true, isCredit: false },
      { key: "toronto_mltt", label: "Toronto MLTT (one-time)", annual: null, total: torontoLttNet, confidence: "High", oneTime: true, isCredit: false },
      { key: "cmhc_premium", label: "CMHC premium + PST", annual: null, total: cmhcTotal, confidence: "High", oneTime: true, isCredit: false },
      { key: "transit_dividend", label: "Transit dividend", annual: -currencyRounding(transit / years), total: -transit, confidence: "Medium", oneTime: false, isCredit: true },
    ];
  }

  const compositeSignals: CompositeSignal[] = [
    {
      signalName: "Maintenance Complexity Signal",
      value: "Low",
      label: "Low maintenance complexity signal",
      factors: ["No elevated maintenance signals available in offline preview"],
      disclaimer: "This is an inferred signal and not evidence of a historical special assessment.",
      confidence: "Low",
    },
    {
      signalName: "Future Tax Pressure Signal",
      value: "Low",
      label: "Low future tax pressure signal",
      factors: ["Development application density loads once the backend is reachable"],
      disclaimer: "This is a neighbourhood signal, not an MPAC reassessment prediction.",
      confidence: "Low",
    },
  ];

  const agentReasoning: AgentReasoning[] = [
    { agent: "intake", title: "AGENT 1 — INTAKE + PLANNING", mode: "PREVIEW", body: `Planned lookups for '${inputs.address}' (${inputs.buyerProfile}). Live heritage/flood/development retrieval runs once the backend is reachable.` },
    { agent: "data_retrieval", title: "AGENT 2 — DATA RETRIEVAL", mode: "PREVIEW", body: "Offline preview — no live dataset retrieval. Deterministic assumptions used for risk and assessment proxy." },
    { agent: "analysis", title: "AGENT 3 — ANALYSIS + COST", mode: "DETERMINISTIC, NO LLM", body: `Land transfer tax: ${fmtCad(ltt)} net. Property tax: ${fmtCad(propertyTax10y)} over 10 yr. Mortgage (base): ${fmtCad(baseMortgage)}/10yr. Transit dividend: ${fmtCad(inferredTransitDividend)} offset. True 10-year cost: ${fmtCad(trueCost)}.` },
    { agent: "synthesis", title: "AGENT 4 — SYNTHESIS", mode: "PREVIEW", body: "LLM narration runs on-device once the backend is reachable; this preview formats the deterministic figures only." },
  ];

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
    flags,
    compositeSignals,
    costRowsByHorizon,
    agentReasoning,
    inputs,
    keyNumbers: {
      ltt: currencyRounding(ltt),
      propertyTax10y: currencyRounding(propertyTax10y),
      insuredPremium: currencyRounding(insuredPremium),
      baseMortgageCost10y: currencyRounding(baseMortgage),
    },
    monteCarlo: null,
    monteCarloHorizons: {},
    horizonCosts,
    mapGeometry: null,
    pipelineTrace: [],
  };
}
