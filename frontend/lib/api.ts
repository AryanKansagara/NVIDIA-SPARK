import type {
  BreakdownPoint,
  MapGeometry,
  MeridianFormState,
  MeridianReport,
  MonteCarloDistribution,
  PipelineStep,
  ScenarioPoint,
} from "./report";

type BackendMonteCarlo = {
  p10: number;
  p50: number;
  p90: number;
  mean: number;
  trajectories_sampled: number;
  elapsed_ms: number | null;
};

function mapMonteCarlo(mc: BackendMonteCarlo): MonteCarloDistribution {
  return {
    p10: mc.p10,
    p50: mc.p50,
    p90: mc.p90,
    mean: mc.mean,
    trajectoriesSampled: mc.trajectories_sampled,
    elapsedMs: mc.elapsed_ms,
  };
}

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
  monte_carlo: BackendMonteCarlo | null;
  monte_carlo_horizons?: Record<string, BackendMonteCarlo>;
  horizon_costs?: Record<string, number>;
  pipeline_trace?: { name: string; started_ms: number; elapsed_ms: number; parallel_group: number }[];
  map_geometry: {
    property_lat: number;
    property_lon: number;
    flood_polygon_geojson: object | null;
    dev_pressure_radius_m: number;
    community_insights: {
      headline: string;
      median_estimate: number;
      typical_range_low: number;
      typical_range_high: number;
      price_per_sqft_estimate: number;
      trend: "rising" | "stable" | "cooling";
      notes: string[];
    } | null;
  } | null;
};

const SCENARIO_ORDER = { bull: 0, base: 1, bear: 2 } as const;

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
    `${backend.property.normalized_address} — estimated true 10-year cost is ${trueCost.toLocaleString("en-CA", { style: "currency", currency: "CAD", maximumFractionDigits: 0 })}, about ${aboveListPercent}% above list price.`;

  const monteCarlo: MonteCarloDistribution | null = backend.monte_carlo
    ? mapMonteCarlo(backend.monte_carlo)
    : null;

  const monteCarloHorizons: Record<string, MonteCarloDistribution> = {};
  for (const [horizon, mc] of Object.entries(backend.monte_carlo_horizons ?? {})) {
    monteCarloHorizons[horizon] = mapMonteCarlo(mc);
  }

  const pipelineTrace: PipelineStep[] = (backend.pipeline_trace ?? []).map((s) => ({
    name: s.name,
    startedMs: s.started_ms,
    elapsedMs: s.elapsed_ms,
    parallelGroup: s.parallel_group,
  }));

  const mapGeometry: MapGeometry | null = backend.map_geometry
    ? {
        propertyLat: backend.map_geometry.property_lat,
        propertyLon: backend.map_geometry.property_lon,
        floodPolygonGeojson: backend.map_geometry.flood_polygon_geojson,
        devPressureRadiusM: backend.map_geometry.dev_pressure_radius_m,
        communityInsights: backend.map_geometry.community_insights
          ? {
              headline: backend.map_geometry.community_insights.headline,
              medianEstimate: backend.map_geometry.community_insights.median_estimate,
              typicalRangeLow: backend.map_geometry.community_insights.typical_range_low,
              typicalRangeHigh: backend.map_geometry.community_insights.typical_range_high,
              pricePerSqftEstimate: backend.map_geometry.community_insights.price_per_sqft_estimate,
              trend: backend.map_geometry.community_insights.trend,
              notes: backend.map_geometry.community_insights.notes,
            }
          : null,
      }
    : null;

  return {
    summary,
    trueCost,
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
    monteCarlo,
    monteCarloHorizons,
    horizonCosts: backend.horizon_costs ?? {},
    mapGeometry,
    pipelineTrace,
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

// ---- Profile -------------------------------------------------------------
export type Profile = {
  name?: string | null;
  email?: string | null;
  phone?: string | null;
  monthly_income?: number | null;
};

export async function getProfile(): Promise<Profile> {
  const res = await fetch("/api/v1/profile");
  if (!res.ok) throw new Error(`Profile API ${res.status}`);
  return res.json();
}

export async function saveProfile(profile: Profile): Promise<Profile> {
  const res = await fetch("/api/v1/profile", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(profile),
  });
  if (!res.ok) throw new Error(`Profile save ${res.status}`);
  return res.json();
}

// ---- Saved reports -------------------------------------------------------
export type SavedReportSummary = {
  report_id: string;
  address: string | null;
  list_price: number | null;
  buyer_profile: string | null;
  true_10y_cost: number | null;
  created_at: string;
};

export async function saveReport(report: MeridianReport): Promise<string> {
  // Persist a backend-shaped payload so it can be re-rendered later.
  const payload = {
    property: { address: report.inputs.address, normalized_address: report.inputs.address },
    list_price: report.inputs.listPrice,
    buyer_profile: report.inputs.buyerProfile,
    true_10_year_cost: report.trueCost,
    summary_text: report.summary,
    horizon_costs: report.horizonCosts,
  };
  const res = await fetch("/api/v1/reports/save", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(`Save report ${res.status}`);
  return (await res.json()).report_id;
}

export async function listReports(): Promise<SavedReportSummary[]> {
  const res = await fetch("/api/v1/reports");
  if (!res.ok) throw new Error(`List reports ${res.status}`);
  return res.json();
}

// ---- Chat ----------------------------------------------------------------
export type ChatSource = { text: string; source: string; score?: number | null };
export type ChatReply = { reply: string; sources: ChatSource[] };

export async function sendChat(
  sessionId: string,
  message: string,
  webSearch = false,
  reportContext?: string,
): Promise<ChatReply> {
  const res = await fetch("/api/v1/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      session_id: sessionId,
      message,
      web_search: webSearch,
      report_context: reportContext,
    }),
  });
  if (!res.ok) throw new Error(`Chat API ${res.status}`);
  const data = await res.json();
  return { reply: data.reply, sources: data.sources ?? [] };
}

// ---- Health --------------------------------------------------------------
export type HealthStatus = {
  status: string;
  llm_local: boolean;
  embeddings_local: boolean;
  model: string;
};

export async function getHealth(): Promise<HealthStatus> {
  const res = await fetch("/api/v1/health");
  if (!res.ok) throw new Error(`Health API ${res.status}`);
  return res.json();
}
