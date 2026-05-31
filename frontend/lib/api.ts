import type {
  AgentReasoning,
  BreakdownPoint,
  CompositeSignal,
  CostRow,
  Flag,
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
  confidence?: "High" | "Medium" | "Low";
  detail?: string | null;
  say_at_table?: string | null;
  leverage_low?: number | null;
  leverage_high?: number | null;
  source?: string | null;
};

type BackendCompositeSignal = {
  signal_name: string;
  value: "Low" | "Medium" | "Elevated" | "High";
  label: string;
  factors: string[];
  disclaimer: string;
  confidence: "Low";
};

type BackendCostRow = {
  key: string;
  label: string;
  annual: number | null;
  total: number;
  confidence: "High" | "Medium" | "Low";
  one_time: boolean;
  is_credit: boolean;
};

type BackendAgentReasoning = {
  agent: string;
  title: string;
  mode: string;
  body: string;
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
  composite_signals?: BackendCompositeSignal[];
  cost_rows_by_horizon?: Record<string, BackendCostRow[]>;
  agent_reasoning?: BackendAgentReasoning[];
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
  const trueCost = backend.true_10_year_cost ?? 0;
  const aboveListPercent = inputs.listPrice
    ? Math.round(((trueCost - inputs.listPrice) / inputs.listPrice) * 100)
    : 0;

  const components: BreakdownPoint[] = (backend.cost_breakdown ?? []).map((c) => ({
    label: c.label,
    value: c.amount,
    fill: FILL_COLORS[c.key] ?? "#888888",
  }));

  const scenarios: ScenarioPoint[] = [...(backend.mortgage_scenarios ?? [])]
    .sort((a, b) => SCENARIO_ORDER[a.scenario] - SCENARIO_ORDER[b.scenario])
    .map((s) => ({
      scenario: (s.scenario.charAt(0).toUpperCase() + s.scenario.slice(1)) as ScenarioPoint["scenario"],
      cost: s.total_cost,
    }));

  const flags: Flag[] = (backend.flags ?? []).map((f) => ({
    severity: f.severity,
    title: f.title,
    message: f.message,
    confidence: f.confidence ?? "High",
    detail: f.detail ?? null,
    sayAtTable: f.say_at_table ?? null,
    leverageLow: f.leverage_low ?? null,
    leverageHigh: f.leverage_high ?? null,
    source: f.source ?? null,
  }));
  for (const warning of backend.warnings ?? []) {
    flags.push({
      severity: "yellow",
      title: "Data warning",
      message: warning,
      confidence: "Medium",
      detail: null,
      sayAtTable: null,
      leverageLow: null,
      leverageHigh: null,
      source: null,
    });
  }

  const compositeSignals: CompositeSignal[] = (backend.composite_signals ?? []).map((s) => ({
    signalName: s.signal_name,
    value: s.value,
    label: s.label,
    factors: s.factors ?? [],
    disclaimer: s.disclaimer,
    confidence: "Low",
  }));

  const costRowsByHorizon: Record<string, CostRow[]> = {};
  for (const [horizon, rows] of Object.entries(backend.cost_rows_by_horizon ?? {})) {
    costRowsByHorizon[horizon] = rows.map((r) => ({
      key: r.key,
      label: r.label,
      annual: r.annual,
      total: r.total,
      confidence: r.confidence,
      oneTime: r.one_time,
      isCredit: r.is_credit,
    }));
  }

  const agentReasoning: AgentReasoning[] = (backend.agent_reasoning ?? []).map((a) => ({
    agent: a.agent,
    title: a.title,
    mode: a.mode,
    body: a.body,
  }));

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

  const pipelineTrace: PipelineStep[] = (backend.pipeline_trace ?? [])
    .filter((s) => Number.isFinite(s.started_ms) && Number.isFinite(s.elapsed_ms))
    .map((s) => ({
      name: s.name,
      startedMs: s.started_ms,
      elapsedMs: s.elapsed_ms,
      parallelGroup: s.parallel_group ?? 0,
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
              notes: backend.map_geometry.community_insights.notes ?? [],
            }
          : null,
      }
    : null;

  const kn = backend.key_numbers ?? ({} as BackendReport["key_numbers"]);

  return {
    summary,
    trueCost,
    aboveListPercent,
    transitDividend: kn.transit_dividend ?? 0,
    components,
    scenarios,
    flags,
    compositeSignals,
    costRowsByHorizon,
    agentReasoning,
    inputs,
    keyNumbers: {
      ltt: kn.land_transfer_tax_total ?? 0,
      propertyTax10y: kn.property_tax_10y ?? 0,
      insuredPremium: kn.insured_mortgage_premium ?? 0,
      baseMortgageCost10y: kn.mortgage_cost_10y_base ?? 0,
    },
    monteCarlo,
    monteCarloHorizons,
    horizonCosts: backend.horizon_costs ?? {},
    mapGeometry,
    pipelineTrace,
  };
}

export type AddressSuggestion = {
  address: string;
  display_name: string;
  latitude: number | null;
  longitude: number | null;
};

export async function fetchAddressSuggestions(query: string): Promise<AddressSuggestion[]> {
  if (!query || query.trim().length < 3) return [];
  try {
    const res = await fetch(`/api/v1/report/suggest?q=${encodeURIComponent(query)}`);
    if (!res.ok) return [];
    return await res.json();
  } catch (err) {
    console.error("Failed to fetch address suggestions:", err);
    return [];
  }
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
      ...(inputs.lat != null && inputs.lon != null
        ? { latitude: inputs.lat, longitude: inputs.lon }
        : {}),
    }),
  });

  if (!res.ok) {
    let message = `Report API error: ${res.statusText}`;
    try {
      const errJson = await res.json();
      if (errJson && errJson.detail) {
        message = errJson.detail;
      }
    } catch {
      const text = await res.text().catch(() => "");
      if (text) message = text;
    }
    throw new Error(message);
  }

  try {
    return mapReport(await res.json(), inputs);
  } catch (err) {
    console.error("Failed to parse report response:", err);
    throw new Error(
      "The analysis completed but the response could not be read. Please try again.",
    );
  }
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

// ---- Voice (speech-to-text) ----------------------------------------------
/** Thrown when the local ASR model is not available (HTTP 503). */
export class AsrUnavailableError extends Error {}

export async function transcribeAudio(blob: Blob): Promise<string> {
  const form = new FormData();
  form.append("audio", blob, "speech.webm");
  const res = await fetch("/api/v1/transcribe", { method: "POST", body: form });
  if (res.status === 503) throw new AsrUnavailableError("ASR unavailable");
  if (!res.ok) throw new Error(`Transcribe API ${res.status}`);
  const data = await res.json();
  return (data.text ?? "") as string;
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
