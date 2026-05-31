# Meridian — Backend Build PRD (FINAL)

**This is the single source of truth for the backend build.** It supersedes
`PRD_Engineering.md` §2–§10 wherever they conflict. The other docs
(`CEO_Plan_V1_Hackathon.md`, `Office_Hours_Gap_Analysis_and_Build_Strategy.md`,
`DATA_PARAMETERS.md`) remain valid as product/strategy context.

Produced by `/plan-eng-review` on 2026-05-30 after resolving the three
architecture-level contradictions and four build-blocking gaps found across the
planning docs. **Read the "Locked Decisions" and "Gaps Resolved" tables first —
they explain every place this doc overrides the older PRD.**

**Target:** Toronto true 10-year cost-of-ownership agent, NVIDIA Spark Hack
Toronto, 24-hour build, ASUS Ascent GX10 / NVIDIA GB10 Grace Blackwell, 128 GB
unified memory.

---

## 0. Locked Decisions

| # | Decision | Choice | Consequence for the build |
|---|----------|--------|---------------------------|
| D1 | Agent topology | **Deterministic orchestration + single LLM synthesis** | `property_type` is a **user input** (no LLM planning call). All data sources run concurrently. Agent 3 is pure Python. Agent 4 (LLM) synthesizes. **1 LLM call per report.** |
| D2 | LLM provider | **NVIDIA NIM only** | Local NIM at `http://localhost:8080/v1` (OpenAI-compatible). Model: `meta/llama-3.1-8b-instruct`. No Claude backend in current implementation. |
| D3 | Retrieval | **Cache-first + live service pattern** | `DEMO_MODE=true` serves `data/demo_cache/<slug>.json`. Live: TRCA ArcGIS + local GeoJSON fallback for flood; haversine distance for heritage; ray-casting PIP for HCD polygons; bbox-SQL + haversine for tabular CKAN sources. Geocode via Nominatim. |
| D4 | Pipeline interface | **FastAPI HTTP API** | `POST /api/v1/report` accepts `ReportRequest`, returns `ReportResponse`. `report_service.py::build_report()` orchestrates with `asyncio.gather`. Next.js frontend consumes this endpoint. |
| D5 | RAG | **Local, offline** | Build-time corpus ingest → local embeddings (`nvidia/llama-3.2-nv-embedqa-1b-v2` via NIM, or sentence-transformers fallback) → Chroma at `data/vector_store`. Retriever used by synthesis and (future) chat. Runs entirely on the GB10. |

---

## 1. Resolved Architecture

```
┌────────────────────────────────────────────────────────────────┐
│ USER INPUT (Next.js form → POST /api/v1/report):              │
│   address · list_price · buyer_profile · property_type        │
│   down_payment_percent · mortgage_rate · amortization_years   │
└───────────────┬────────────────────────────────────────────────┘
                │
┌───────────────▼────────────────────────────────────────────────┐
│ INTAKE (deterministic, report_service.py)                      │
│   geocoding/service.py: Nominatim → lat/lon                   │
│   property_type comes from user — no LLM planning call        │
└───────────────┬────────────────────────────────────────────────┘
                │ GeocodeResult (lat, lon, normalized_address)
┌───────────────▼────────────────────────────────────────────────┐
│ RETRIEVAL (deterministic, async, NO LLM)                       │
│   asyncio.gather over all data source services:               │
│     data_sources/heritage.py   → HeritageEvidence, HCDEvidence│
│     data_sources/flood.py      → FloodEvidence                │
│     data_sources/permits.py    → Active/ClearedPermitsEvidence │
│     data_sources/building_health.py → BuildingHealthEvidence  │
│     data_sources/development.py → DevelopmentEvidence         │
│   DEMO_MODE=true → serve data/demo_cache/<slug>.json          │
└───────────────┬────────────────────────────────────────────────┘
                │ Evidence objects (one per data source)
┌───────────────▼────────────────────────────────────────────────┐
│ ANALYSIS + COST (deterministic, NO LLM)                        │
│   engine/report_engine.py: LTT, property tax, mortgage        │
│     scenarios, CMHC, the 10 V1 signals, 2 composite signals.  │
│     ALL DOLLAR MATH LIVES HERE. The LLM never computes money. │
└───────────────┬────────────────────────────────────────────────┘
                │ EngineOutput (signals, composite_signals, costs, verdict)
┌───────────────▼────────────────────────────────────────────────┐
│ SYNTHESIS (LLM call #1)                                        │
│   synthesis/service.py: plain-English report, negotiation      │
│     leverage per elevated flag, contradiction notes.           │
│     Conditional RAG via rag/service.py.                        │
│     References numbers from engine — never invents them.       │
└───────────────┬────────────────────────────────────────────────┘
                │ returns ReportResponse (JSON)
┌───────────────▼────────────────────────────────────────────────┐
│ POST-REPORT: chat follow-up Q&A (V1.5 — not yet implemented)  │
│   Future: RAG-grounded follow-up. Reuses rag/service.py.      │
└────────────────────────────────────────────────────────────────┘
```

**Iron rule:** the LLM (synthesis only) never produces a dollar figure.
Every number in the `ReportResponse` originates in deterministic `engine/report_engine.py`
code. Synthesis formats and explains numbers it is handed. This is why a financial
tool can trust its own output.

---

## 2. Project Structure

```
NVIDIA-SPARK/
  backend/
    app/
      main.py              # FastAPI app initialization
      api/
        router.py          # API router aggregation
        routes/
          health.py        # GET /api/v1/health
          report.py        # POST /api/v1/report
          debug.py         # GET /api/v1/debug/* endpoints
      core/
        config.py          # Pydantic Settings (env vars, feature flags)
      schemas/
        report.py          # Pydantic models: ReportRequest / ReportResponse
        debug.py           # Pydantic models for debug endpoints
      services/
        report_service.py  # Orchestration: geocode → gather → engine → synthesize
        wording.py         # banned-phrase substitution + validator
        utils.py           # slugify (shared by cache read/write)
        data_sources/
          models.py        # Evidence dataclasses + Signal/CompositeSignal contract
          heritage.py      # Heritage register (CKAN haversine) + HCD (ray-casting PIP)
          flood.py         # TRCA ArcGIS live + local GeoJSON fallback
          permits.py       # Active + cleared permits (CKAN bbox-SQL + haversine)
          building_health.py # RentSafeTO score + permit-history fallback
          development.py   # Development applications 500 m (CKAN bbox-SQL)
        engine/
          report_engine.py # ALL cost math: LTT, tax, mortgage, CMHC, signals, verdict
        geocoding/
          service.py       # Nominatim geocoder → GeocodeResult
        synthesis/
          service.py       # Agent 4 (NIM LLM) → narrative + negotiation leverage
        rag/
          service.py       # ChromaDB retriever (query + embed via NIM)
          ingest.py        # PDF chunking + embedding logic
    tests/
      test_engine.py       # LTT, mortgage, CMHC, tax, composites, verdict
      test_ltt.py          # LTT oracle rows (§9.1)
      test_composites.py   # composite confidence + thresholds
      test_wording.py      # substitution + validate()
    scripts/
      ingest_docs.py       # RAG ingest entry point (run once before demo)
    pyproject.toml
  frontend/                # Next.js 15 + React 19 + Tailwind (separate workstream)
    app/
      page.tsx
      layout.tsx
    components/
      workbench.tsx        # Main report interface
      input-card.tsx       # Input form (address, price, profile, property_type, etc.)
      summary-card.tsx     # Report summary display
      charts.tsx           # Cost breakdown charts (recharts)
      flag-list.tsx        # Risk flags display
      header.tsx / hero.tsx
      map-preview.tsx      # Map integration stub
      ui/
        pill.tsx / panel.tsx
    lib/
      api.ts               # Backend API client (POST /api/v1/report)
      utils.ts
      mock-data.ts         # Demo data for frontend dev
    package.json
  data/
    demo_cache/<slug>.json # 3 demo properties (serialized ReportResponse or evidence)
    vector_store/          # persisted Chroma store (RAG)
    land_laws/             # ~11 .txt/.pdf legislation + program docs (RAG corpus)
  requirements.txt
  .env.example
```

**Module count is ~15 backend services, cleanly layered.** `engine/report_engine.py`
owns all cost math as a single auditable file. `data_sources/*` are small
single-responsibility files. This is the right size for the pipeline; it is not
over-engineering.

---

## 3. Dependencies

```
# pyproject.toml (canonical backend deps)
fastapi>=0.115.0        # HTTP API framework
uvicorn[standard]>=0.30.0 # ASGI server
pydantic>=2.7.0         # data validation + Settings
pydantic-settings>=2.2.1  # env-var config
httpx>=0.27.0           # async CKAN + ArcGIS + NIM HTTP
chromadb>=0.5.0         # local persisted vector store (offline)
pypdf>=4.0.0            # PDF extraction for RAG ingest
python-dotenv>=1.0.1    # .env loading
pytest>=8.2.0           # tests (dev extra)

# also present in requirements.txt (pre-installed on GB10):
langchain / langgraph   # available if needed; not used in core pipeline
torch / torchvision     # available for GPU workloads
```

**Deliberate choice: no `shapely`, no `geopandas`.** Heritage uses haversine
distance thresholds (25 m HIGH, 50 m MEDIUM). HCD uses a ray-casting
point-in-polygon algorithm over the GeoJSON polygons, implemented directly in
`heritage.py`. TRCA flood uses the ArcGIS spatial query API. This removes the
GDAL/Fiona/shapely install chain entirely.

**No `openai` SDK.** NIM is OpenAI-compatible but accessed via plain `httpx`
(NIM endpoint called directly in synthesis and RAG services). No `anthropic` SDK
in current implementation.

---

## 4. Config & Environment

```python
# backend/app/core/config.py — Pydantic Settings; env vars shown with defaults
APP_NAME                 = "Meridian Backend"

# Geocoding
GEOCODER_BASE_URL        = "https://nominatim.openstreetmap.org/search"
GEOCODER_USER_AGENT      = "meridian-hackathon/0.1"
GEOCODER_COUNTRY_CODES   = "ca"
GEOCODER_CITY_BIAS        = "Toronto, Ontario, Canada"

# Data source fetching
REQUEST_TIMEOUT_SECONDS  = 5.0
TRCA_FLOOD_QUERY_URL     = "https://services1.arcgis.com/pMeXFF5bmbv34Alm/arcgis/rest/services/Floodline_TRCA_Polygon/FeatureServer/0/query"
TRCA_FLOOD_FALLBACK_GEOJSON = "data/trca_floodplain_toronto.geojson"

# Cost constants
PROPERTY_TAX_RATE        = 0.00767311     # residential
PROPERTY_TAX_GROWTH_RATE = 0.035          # 3.5% annual
TRANSIT_DIVIDEND_DOWNTOWN = 87000
TRANSIT_DIVIDEND_DEFAULT  = 28000
FLOOD_RISK_INTERNAL_LOADING = 2500

# Demo mode
DEMO_MODE                = False
DEMO_CACHE_DIR           = "data/demo_cache"

# NIM (local model)
NIM_BASE_URL             = "http://localhost:8080/v1"
NIM_MODEL                = "meta/llama-3.1-8b-instruct"
NIM_ENABLED              = True
NIM_TIMEOUT_SECONDS      = 45.0

# RAG
RAG_ENABLED              = True
RAG_EMBEDDING_MODEL      = "nvidia/llama-3.2-nv-embedqa-1b-v2"
RAG_VECTOR_STORE_PATH    = "data/vector_store"
RAG_LAND_LAWS_DIR        = "data/land_laws"
RAG_N_RESULTS            = 3
RAG_CHUNK_SIZE           = 800
RAG_CHUNK_OVERLAP        = 100
```

`.env.example` ships with the local defaults so a fresh clone runs against NIM
with zero edits. `get_settings()` is LRU-cached; changes require restart.

---

## 5. Data Contracts

Data contracts live across two files. Evidence dataclasses (inter-service) are in
`backend/app/services/data_sources/models.py`. API request/response schemas
(Pydantic) are in `backend/app/schemas/report.py`.

### 5.1 Signal contracts (`data_sources/models.py`)

```python
from dataclasses import dataclass, field
from typing import Literal, Optional

Confidence = Literal["High", "Medium", "Low", "UNKNOWN"]
SignalType  = Literal["observed", "inferred", "simulated"]

@dataclass
class Signal:
    signal_name:   str
    signal_type:   SignalType
    value:         str
    confidence:    Confidence
    source:        str
    data_coverage: str
    message:       str       # plain-language, wording-rule compliant

@dataclass
class CompositeSignal:
    signal_name: str
    signal_type: SignalType   # always "inferred"
    value:       str          # "Low" | "Medium" | "Elevated" | "High"
    confidence:  Confidence   # ALWAYS "Low" — never upgrade
    factors:     list[str]
    disclaimer:  str
```

Each evidence class (HeritageEvidence, HCDEvidence, FloodEvidence,
ActivePermitsEvidence, ClearedPermitsEvidence, BuildingHealthEvidence,
DevelopmentEvidence) carries typed fields specific to its source and exposes a
`.to_signal()` method consumed by the engine.

### 5.2 API contracts (`schemas/report.py`)

```python
class ReportRequest(BaseModel):
    address:              str           # min_length=3
    list_price:           float         # 100k–10M CAD
    buyer_profile:        Literal["first_time", "investor", "downsizer"]
    property_type:        Literal["condo","condo_townhouse","semi_detached",
                                  "detached_urban","detached_suburban"]
    down_payment_percent: float         # 5–100%
    mortgage_rate:        float         # 0.5–15%
    amortization_years:   int           # 15–30

class ReportResponse(BaseModel):
    property:            ResolvedProperty    # address, coords, ward
    verdict_level:       str                 # "RED" | "YELLOW" | "GREEN"
    verdict_headline:    str
    true_10_year_cost:   int
    cost_breakdown:      List[CostComponent] # mortgage, tax, transfer tax, risk, dividend
    mortgage_scenarios:  List[ScenarioCost]  # bull/base/bear
    flags:               List[RiskFlag]      # severity: "red"|"yellow"|"green"|"info"
    warnings:            List[str]
    evidence_summary:    EvidenceSummary     # per-source metadata
    signals:             List[SignalOut]     # 7 standardized signals
    composite_signals:   List[CompositeSignalOut]  # 2 composite signals
    key_numbers:         KeyNumbers
    disclaimer:          str
    summary_text:        str | None          # LLM-synthesized narrative
```

`ReportResponse` is the **backend → frontend contract**. The Next.js app renders
exactly these fields. This is the schema PRD_Engineering §9.3 never specified.

---

## 6. Pipeline Interface (`report_service.py`)

```python
# backend/app/services/report_service.py
async def build_report(payload: ReportRequest) -> ReportResponse:
    """
    Main orchestration. Called by POST /api/v1/report.
    1. Geocodes address via Nominatim.
    2. asyncio.gather over all data source services (5 s timeout each).
    3. Computes building health from permits + RentSafeTO evidence.
    4. Runs deterministic engine → EngineOutput.
    5. Queries RAG if enabled and collection ready.
    6. Synthesizes narrative via NIM LLM.
    7. Assembles and returns ReportResponse.
    """
```

The Next.js frontend calls `POST /api/v1/report` and receives the complete
`ReportResponse` in a single HTTP response. There is no streaming trace in V1;
the frontend can show a loading state while the request is in-flight (typically
< 35 s including the NIM synthesis call).

**Degradation:** any data source service that raises `httpx.TimeoutException` or
a non-2xx response falls back to its heuristic evidence object (confidence=UNKNOWN)
and the gather continues. Only a geocoding miss or synthesis hard failure produces
a meaningful error response.

---

## 7. Intake + Retrieval

### 7.1 Intake (deterministic, `report_service.py` + `geocoding/service.py`)

1. **Geocode** via Nominatim (`geocoding/service.py`). Appends city bias
   "Toronto, Ontario, Canada". Returns `GeocodeResult` with lat/lon +
   normalized address (uppercase, deduplicated whitespace).
   If no result found → raises `GeocodingError` → HTTP 422 to caller.
2. **Property type** is a **user input field** (`ReportRequest.property_type`).
   No LLM planning call; the engine uses it directly for AV multiplier selection.
3. **Ward** is not resolved in V1 (Nominatim does not return ward). Omit from
   report or return `None`; ward is not used in any cost math.

### 7.2 Source routing

All data sources run unconditionally via `asyncio.gather` in `report_service.py`.
The only conditional is `RentSafeTO`: `building_health.py` selects Path A
(RentSafeTO score) when the property type suggests multi-unit residential,
Path B (permit-history) otherwise. No LLM planning call routes sources.

**Source decision baked into each service:**
- `heritage.py` / `hcd`: always runs (haversine + ray-casting are cheap).
- `permits.py` (active + cleared): always runs.
- `development.py`: always runs.
- `flood.py`: always runs.
- `building_health.py`: always runs; selects RentSafeTO vs permit-history
  internally based on property type.

---

## 8. Retrieval (deterministic, async, `services/data_sources/`)

`asyncio.gather` over all source services. 5 s timeout each (configured via
`REQUEST_TIMEOUT_SECONDS`). Each service returns a typed evidence object with
a `confidence` field.

### 8.1 Confidence rules (apply to every source)

| Confidence | Condition |
|------------|-----------|
| High | HTTP 200 + recency field present; or ArcGIS hit within exact polygon |
| Medium | HTTP 200, no recency metadata; or ArcGIS hit within 100 m buffer |
| Low | HTTP 200, empty result set (0 records / no polygon hit) |
| UNKNOWN | timeout (>5 s), 4xx, 5xx, local file load failure, or heuristic fallback |

### 8.2 Retrieval mechanics by source type

**Polygon sources (HCD): ray-casting PIP in `heritage.py`.**
Downloads GeoJSON from CKAN on first call, then tests containment using a
pure-Python ray-casting algorithm. No shapely dependency.

**Heritage register: haversine distance match in `heritage.py`.**
Fetches rows from CKAN, computes haversine to each row's coordinates.
Match within 25 m → HIGH confidence. Match within 50 m → MEDIUM confidence.
Beyond 50 m → heuristic fallback (address keyword check for known heritage areas).
Field names for lat/lon/status are auto-discovered from the CKAN response schema.

**TRCA flood: two-tier ArcGIS query in `flood.py`.**
1. Exact polygon intersection → "elevated", `in_flood_zone=True`,
   `internal_loading=2500`.
2. 100 m buffer query → "moderate", `in_flood_zone=False`, loading=0.
3. No hit → "low".
Fallback: local GeoJSON (`data/trca_floodplain_toronto.geojson`).
Second fallback: heuristic returns "low" with UNKNOWN confidence.

**Tabular sources (permits, dev apps): bbox-SQL + haversine in `permits.py` /
`development.py`.**
1. `datastore_search_sql` with a lat/lon bounding box prefilter:
   ```sql
   SELECT * FROM "<resource_id>"
   WHERE "<lat_col>" BETWEEN {lat-0.0045} AND {lat+0.0045}
     AND "<lon_col>" BETWEEN {lon-0.0060} AND {lon+0.0060}
   ```
   (~500 m box at Toronto's latitude; lon delta wider because cos(43.7°)≈0.72.)
2. In Python, exact-filter by haversine ≤ 500 m (`within_radius`).

**Address-level permit match by point proximity, NOT string match.**
Match a permit to the subject property when the permit's geocoded point is within
~30 m of the subject point. If a permit row lacks coordinates, fall back to a
normalized address `q=` full-text search.

### 8.3 DEMO_MODE

`DEMO_MODE=true` → `report_service.py` returns a pre-cached `ReportResponse`
from `data/demo_cache/<slug>.json` (see §15.1). `<slug>` = `slugify(address)`
from `services/utils.py`. The synthesis (LLM) still runs live in demo mode — the
cache only insulates you from CKAN/ArcGIS flakiness.

---

## 9. Analysis + Cost (deterministic, `engine/report_engine.py`)

**All dollar math. No LLM. Fully unit-tested (§13).** Constants below are the
canonical V1 values; they override any conflicting copy elsewhere.

All cost logic lives in a single `ReportEngine` class in `engine/report_engine.py`.
There are no separate `cost/*.py` files; having one auditable file for all
financial math simplifies review and testing.

### 9.1 Land Transfer Tax — `observed`, High

Marginal-bracket calculation. **Toronto MLTT uses the full high-value schedule
(correct above $2M), fixing the PRD §5.1 "mirror Ontario" bug.**

```python
ONTARIO_LTT  = [(55_000,0.005),(250_000,0.010),(400_000,0.015),
                (2_000_000,0.020),(float("inf"),0.025)]
TORONTO_MLTT = [(55_000,0.005),(250_000,0.010),(400_000,0.015),
                (2_000_000,0.020),(3_000_000,0.025),(4_000_000,0.035),
                (5_000_000,0.045),(float("inf"),0.055)]
ONTARIO_FTB_REBATE = 4_000
TORONTO_FTB_REBATE = 4_475     # combined cap 8_475, first-time only

def _land_transfer_tax_ontario(price) -> int: ...
def _land_transfer_tax_toronto(price) -> int: ...
```

Apply both rebates only when `buyer_profile == "first_time"`. Combined rebate
capped at total LTT owed.

**Test oracles (verify on ratehub.ca/land-transfer-tax-ontario):**
| Price | Profile | ltt_combined | ltt_net |
|-------|---------|--------------|---------|
| $500,000 | not-first-time | 12,950 | 12,950 |
| $750,000 | first-time | 22,950 | 14,475 |
| $1,200,000 | first-time | 40,950 | 32,475 |

### 9.2 Property Tax — `simulated`, High rate / Medium AV

```python
RATE_RESIDENTIAL = 0.00767311
RATE_MULTI_RES   = 0.01208792          # buyer_profile == "investor"
ANNUAL_GROWTH    = 0.035
MULTIPLIERS = {"condo":0.90,"condo_townhouse":0.80,"semi_detached":0.65,
               "detached_urban":0.70,"detached_suburban":0.55,
               "commercial_mixed":0.70}
rate  = RATE_MULTI_RES if profile=="investor" else RATE_RESIDENTIAL
av_mid = list_price * MULTIPLIERS.get(property_type, 0.70)
av_low, av_high = av_mid*0.85, av_mid*1.15
annual = av_mid * rate
ten_year = annual * ((1+ANNUAL_GROWTH)**10 - 1) / ANNUAL_GROWTH   # 10-term sum
```

Always attach the MPAC-frozen-at-2016 disclaimer (§11) to the signal `message`.

### 9.3 Mortgage — `simulated`, High math / Medium scenarios

```python
# Minimum down payment (validate, warn if below):
#   5% on first 500k; 10% on 500k-1.5M; 20% (no CMHC) over 1.5M
# principal = list_price - down_payment_amount
# CMHC premium added to principal when down<20% AND price<=1.5M
CMHC = [(0.65,0.0060),(0.75,0.0170),(0.80,0.0240),(0.85,0.0280),
        (0.90,0.0310),(0.95,0.0400)]            # by LTV
# +0.20% premium surcharge if amortization > 25
# Ontario PST 8% on premium, paid at CLOSING (not financed)
```

Scenario model: 5-year term, **two 5-year blocks** inside the 10-year window.
Block 1 at `rate`; block 2 at `rate + delta`, recomputed on the remaining balance
with remaining amortization.

| Scenario | delta on block 2 |
|----------|------------------|
| base | 0.0 |
| bear | +1.5 |
| bull | -0.5 |

`mortgage_10yr_<scenario>` = total of monthly payments over 120 months. Standard
payment `M = P*r/(1-(1+r)**-n)`, `r=annual/12/100`, `n=amort*12`.

### 9.4 The 10 V1 Signals (logic in `report_engine.py` over evidence objects)

| # | Signal | Type | Logic → message |
|---|--------|------|-----------------|
| 1 | Heritage | observed | Part IV / Part V / Listed / none → tiered message |
| 2 | HCD | observed | ray-casting PIP hit → "in a heritage conservation district" |
| 3 | Active permits | observed | structural-keyword filter; ≥1 active structural → flag |
| 4 | Cleared permits | observed | structural + within 10 yr; ≥3 → "further due diligence" |
| 5 | Dev intensification | inferred | active OZ/SA within 500 m: 0-4 none, 5-9 Medium, 10+ High |
| 6 | Flood | observed | TRCA intersect → Elevated; within 100 m → Moderate; else none |
| 7 | Building health | observed | Path A RentSafeTO score; Path B structural permit history |
| 8 | LTT | observed | §9.1 |
| 9 | Property tax | simulated | §9.2 |
| 10 | Mortgage | simulated | §9.3 + sub-signals (first-time flags) |

**Structural permit filter (shared by #3, #4, #7B, composites):**
```python
STRUCTURAL_KEYWORDS = ["structural","unsafe","major repair","emergency",
                        "foundation","addition","demolition"]
# NEVER flag routine/cosmetic/interior permits
```

Permits open > 730 days (2 years) are additionally flagged as elevated-risk.

**Dev intensification filter (#5):** keep only
`status in {"Under Review","Application Received","Council Approved","NOAC Issued"}`
and `type in {"OZ","SA"}`; exclude `Closed`. Raw 500 m count drives the tiers.

### 9.5 Composite signals (`report_engine.py`) — `inferred`, **always Low**

Maintenance Complexity and Future Tax Pressure exactly per PRD §5.8–5.9 /
DATA_PARAMETERS #36–37. `confidence` is hardcoded `"Low"` and the disclaimer is
mandatory. Maintenance: ≥3 factors → "Elevated", 1–2 → "Medium", 0 → "Low".
Maintenance factors: active structural, multiple structural permits, deferred
maintenance, low RentSafeTO, heritage designation, flood zone.
Tax pressure: dev_density ≥10 → "High", ≥5 → "Medium", <5 → "Low". Wording:
never "special assessment risk"; use "Elevated maintenance complexity signal".

### 9.6 Risk adjustments (rounded to nearest $1k)

These dollar values are added to the true 10-year cost as a "risk" cost component:

| Condition | Adjustment |
|-----------|-----------|
| Heritage Part IV or V or Listed | +$12,000 |
| HCD (not Part V) | +$20,000 |
| Active structural permits | +$20,000 |
| Active non-structural permits | +$8,000 |
| Development intensity High | +$17,000 |
| Development intensity Medium | +$7,000 |
| Flood zone | `internal_loading × 10` |

### 9.7 Transit dividend (V1)

`transit_dividend_10yr`: keyword check on address — if address contains downtown
keywords (king, queen, yonge, bay, spadina, university, front, etc.) → $87,000;
else → $28,000. Real GTFS distance scoring is V1.5 (TODO).

### 9.8 Verdict derivation (deterministic)

```python
# overall_risk from elevated signals; verdict.level mirrors it
RED    if any: heritage Part IV, active structural permits, flood Elevated
YELLOW if any yellow flag OR composite Elevated/High
GREEN  otherwise → headline "No concerns identified in available city data."
true_10yr_cost = ltt_net + ten_year_property_tax + mortgage_10yr_base
                 + risk_adjustment - transit_dividend_10yr
```

---

## 10. Synthesis (LLM call #1, `services/synthesis/service.py`)

Receives the full `EngineOutput` + flag list + property details. Produces a
buyer-friendly narrative with per-flag explanations and negotiation leverage.
It formats numbers it is given; it must not compute or alter them.

```
SYSTEM: You are a property report synthesis agent for a Toronto home buyer.
Use ONLY the provided analysis JSON. Rules:
- Every claim references a specific finding in the input.
- Use the exact dollar figures provided. Never invent or recompute numbers.
- If a confidence is Medium or Low, say so.
- For each elevated flag, give ONE sentence of negotiation leverage with a
  dollar RANGE drawn from cost_breakdown.
- Never use "red flag" — say "elevated review recommended".
- If a category has no data, say "No concerns identified" for it. Never speculate.
- Tone: direct, clear, protective of the buyer.
Output JSON: {"verdict_paragraph": str,
              "flag_explanations": [...],
              "negotiation_leverage": [{"flag","dollar_low","dollar_high","script"}]}

USER: Analysis: {engine_output_json}. Property: {address} at ${list_price}.
Buyer profile: {buyer_profile}. RAG context: {retrieved_chunks_or_empty}.
```

**Retry logic:** `parsing.py`-style: strip ```json fences, brace-match, retry
once. On second failure, `_templated_summary()` returns deterministic text built
from `EngineOutput` (correct numbers, plainer prose) so the demo never crashes.

**Wording enforcement:** `wording.apply()` runs over every output string before
it enters the `ReportResponse`. `wording.validate()` (used in tests) greps for
banned phrases.

**Conditional RAG:** before the NIM call, for each active flag retrieve from the
matching corpus category and inject as `RAG context`. Heritage flag → heritage
docs, flood flag → flood docs, first-time buyer → FHSA/HBP docs, maintenance
Elevated → assessment docs, tax-pressure High → zoning docs.

---

## 11. Wording Rules (`services/wording.py`)

Substitution map applied to all agent/UI strings; `validate()` asserts none of
the LHS phrases survive (a test fails the build if they do).

| Find | Replace |
|------|---------|
| "red flag" / "hard red flag" / "hard flag" | "elevated review recommended" / "elevated signal" |
| "high special assessment risk" | "elevated maintenance complexity signal" |
| "potential tax increases" | "potential neighbourhood change" |
| "major issues" | "further due diligence recommended" |
| "$3,500" (flood) / "insurance loading" | (removed) |

Mandatory disclaimers (attach to the relevant signal `message`):
- Property tax: MPAC-frozen-at-2016 proxy disclaimer.
- RentSafeTO: "No score available does not indicate lower risk — condos, co-ops,
  and smaller buildings are not covered."
- Composites: "inferred signal, not evidence of a historical special assessment."
- Report `disclaimer` field: not financial/legal/insurance advice.

---

## 12. RAG Subsystem (`services/rag/`, local + offline)

**Build-time ingest (`rag/ingest.py`, entry point `scripts/ingest_docs.py`,
run before hackathon / once):**
1. Place the ~11 corpus docs (PDFs) in `data/land_laws/`.
2. `ingest_pdf()` extracts text via `pypdf`, chunks (~800 tokens, 100 overlap),
   embeds in batches of 32 via NIM `/embeddings` endpoint
   (`RAG_EMBEDDING_MODEL=nvidia/llama-3.2-nv-embedqa-1b-v2`).
3. Persist to Chroma at `data/vector_store/` (on-disk, offline).

**Retriever (`rag/service.py`):** `async query(text, n_results=3) -> list[str]`.
Embeds query via NIM, returns `n_results` closest document chunks from the
"land_laws" Chroma collection. Used by synthesis before the LLM call.
`is_ready()` checks collection has documents before querying.

**Embeddings stay on the GB10** — NIM serves both inference and embeddings, so
privacy/hardware story holds end to end.

---

## 13. Chat Endpoint

**Not yet implemented in V1.** Planned for V1.5 as a follow-up Q&A endpoint
that grounds answers in the already-computed `ReportResponse` + RAG chunks.
Will reuse `rag/service.py` and the NIM backend. Never invents dollar figures
not present in the report.

---

## 14. Error Handling

| Error | Handler | User-visible behavior |
|-------|---------|----------------------|
| CKAN `JSONDecodeError` | log; evidence confidence=UNKNOWN | heuristic fallback used, low-confidence signal |
| TRCA GeoJSON `FileNotFoundError` | log; flood confidence=UNKNOWN | heuristic "low" flood returned |
| Synthesis NIM empty / parse fail ×2 | `_templated_summary()` | correct numbers, plainer prose |
| `httpx.ConnectError` on NIM | surface immediately | 503 with "Local model not responding" |
| `httpx.TimeoutException` on source | confidence=UNKNOWN, gather continues | other sources unaffected |
| Geocode miss (`GeocodingError`) | raise → HTTP 422 | "Address not found; verify and retry" |
| Permit point-proximity miss | `q=` address text search fallback | "no permits found" is "none in available data" |

**Critical-gap check:** every failure path above is either tested, surfaced in
the response, or both. None fail silently. The one to watch: a permit
point-proximity miss that returns "no permits" when permits exist but lack
coordinates — mitigated by the `q=` fallback (§8.2) and called out as a known
V1 limitation.

---

## 15. Demo Data & Build-Time Assets

### 15.1 Slugify (shared by cache write + read, `services/utils.py`)

```python
import re
def slugify(address: str) -> str:
    return re.sub(r"[^a-z0-9]+","-", address.lower()).strip("-")
# "401 Richmond St W" -> "401-richmond-st-w"
```

### 15.2 Three demo properties (different risk profiles)

| Property | Profile | Expected flags |
|----------|---------|----------------|
| 401 Richmond St W | RED | Heritage Part IV, active structural permits, high dev density |
| (Scarborough semi, TBD) | GREEN | clean — exercises "No concerns identified" |
| (Eglinton condo, TBD) | YELLOW | near flood, moderate dev pressure, transit-aligned |

Each cached as `data/demo_cache/<slug>.json` (pre-fetched evidence or full
response) by **Hour 8 gate**. Pick the two TBD addresses early.

### 15.3 Pre-hack asset downloads (before clock starts)

- `data/trca_floodplain_toronto.geojson` (TRCA fallback)
- `data/land_laws/*.pdf` + run `scripts/ingest_docs.py` → `data/vector_store/`
- CKAN resource UUIDs confirmed live in each service file (re-query if 404)

---

## 16. Test Plan (`backend/tests/`)

Coverage target: **100% on deterministic cost math** (highest ROI, zero LLM
flakiness). LLM synthesis gets a contract/shape test only.

```
DETERMINISTIC (must be ★★★ — behavior + edges):
  test_ltt.py          → 3 oracle rows (§9.1) + rebate boundary + >$2M brackets + $0 floor
  test_engine.py       → mortgage payment formula vs known value, CMHC each LTV band,
                         amort>25 surcharge, base/bear/bull ordering (bear>base>bull),
                         down<20% insured vs >=20% uninsured, >$1.5M no-CMHC path,
                         property tax each multiplier + investor rate + 10yr growth sum
  test_composites.py   → factor thresholds, confidence ALWAYS "Low", disclaimer present
  test_wording.py      → validate() catches every banned phrase; substitution idempotent

CONTRACT / INTEGRATION:
  test_engine.py       → verdict derivation: RED on structural/flood/heritage,
                         GREEN on clean, YELLOW in between;
                         cost_breakdown component presence

E2E / EVAL (manual, demo day):
  [→EVAL] Synthesis prompt change → re-check 3 reports reference real numbers, non-generic
  [→E2E]  one live (non-cached) address completes < 35 s
```

**Run from `backend/` directory:**
```
cd backend
pytest -q
```

**Regression guard:** if any refactor breaks the cost math or reintroduces a
banned phrase, `test_wording.py` or `test_engine.py` fails before you demo.

---

## 17. Revised 24-Hour Build Sequence

| Hours | Task | Gate |
|-------|------|------|
| 0–1 | NIM latency benchmark (local model, 300 tok). **>15 s → cap synthesis max_tokens=800.** Wire NIM HTTP call in `synthesis/service.py`. | BLOCKING |
| 1–2 | `schemas/report.py`, `core/config.py`, cost math in `engine/report_engine.py` + unit tests | `pytest -q` green |
| 2–4 | `data_sources/*`: heritage (haversine), HCD (ray-casting), flood (ArcGIS+fallback), permits (bbox-SQL), development | each service tested solo |
| 4–5 | `data_sources/building_health.py` (RentSafeTO Path A + permit-history Path B) | both paths tested |
| 5–6 | `geocoding/service.py` (Nominatim) + `report_service.py` (asyncio.gather orchestration) | live single-address gather works |
| 6–7 | `engine/report_engine.py` (signals + composites + verdict) | 3 demo address profiles produce different verdicts |
| 7–8 | Pre-cache 3 demo properties; `slugify` + `DEMO_MODE` path | **3 caches in data/demo_cache/** |
| 8–10 | `scripts/ingest_docs.py` + `rag/service.py` (offline index) | `is_ready()` true, `query()` returns chunks |
| 10–12 | `synthesis/service.py` (NIM call + conditional RAG + wording + retry + templated fallback) | report references real numbers, no banned phrases |
| 12–13 | `api/routes/report.py` + `main.py` → `uvicorn` running | `curl POST /api/v1/report` returns 200 with full JSON |
| 13–14 | `api/routes/debug.py` (geocode, heritage, flood, development debug endpoints) | debug endpoints useful for live troubleshooting |
| 14–20 | Next.js frontend (separate workstream — consumes `ReportResponse` schema) | report renders correctly in browser |
| 20–21 | Error rescues wired; `pytest -q` green | all 3 demo addresses return correct verdict levels |
| 21–24 | Rehearse, 3 random live addresses, time pitch < 4 min | demo < 35 s end-to-end, pitch < 4 min |

**Cut list:** chat follow-up endpoint → V1.5. RentSafeTO live non-demo queries
→ fall back to permit history. Real GTFS transit scoring → V1.5. Streaming
trace events → not in V1 (single synchronous HTTP response). **Never cut the
synthesis narrative.**

---

## 18. Parallelization (for worktrees / multiple builders)

| Lane | Modules | Depends on |
|------|---------|------------|
| A | `engine/report_engine.py` + tests | `schemas/report.py` |
| B | `data_sources/*` + `geocoding/` + tests | `schemas/report.py`, `core/config.py` |
| C | `rag/*` + `scripts/ingest_docs.py` | `core/config.py` |
| D | `synthesis/service.py` + `report_service.py` + API routes | A, B (and C for RAG) |
| E | Next.js `frontend/` | `schemas/report.py` (schema alone; can stub responses) |

**Launch A + B + C in parallel after `schemas/report.py` + `core/config.py` land.**
Merge, then D. E can start against the `ReportResponse` schema before D finishes,
using `lib/mock-data.ts`. Conflict risk: A and B both import schemas only
(read-only) — no overlap.

---

## 19. Gaps Resolved (audit trail)

| Finding | Old state | Resolution in this PRD |
|---------|-----------|------------------------|
| Agent topology contradiction | PRD: Agents 1/3 deterministic; CEO/OH: all LLM | §1: no Agent 1 planning LLM; property_type is user input; 1 LLM call (synthesis) |
| Model contradiction | "Mistral Medium 3.5" (not local) vs Llama 3.1 8B | §4: NIM local Llama 3.1 8B; no Claude backend in current implementation |
| Signal schema fork | `observed/inferred` vs `severity:red/green` | §5: one `Signal` dataclass; severity-colors dropped |
| Confidence enum | dataclass had 3 values, rules needed Unknown | §5: `Confidence` includes `"UNKNOWN"` |
| CKAN spatial unspecified | slugs given, no resource_id, no radius mechanic | §8.2: bbox-SQL + haversine per source service file |
| Heritage = shapefile vs query | two mechanics | §8.2: haversine distance for heritage rows; ray-casting PIP for HCD polygons |
| Address match fragile | exact string → false "no permits" | §8.2: 30 m point proximity, `q=` fallback |
| Geocoding contradiction | accepted-scope vs build-schedule disagree | §7.1: Nominatim; Address Points CKAN not used |
| Ward normalization | tiers vs density mismatch, no ward source | §7.1 + §9.4: ward not resolved; raw 500 m count tiers |
| LTT >$2M wrong | PRD mirrored Ontario | §9.1: full Toronto MLTT 8-bracket schedule |
| Report schema missing | only Agent 3→4 specified | §5: full `ReportResponse` Pydantic contract |
| Trace not streamable | batch CLI vs live UI | §6: synchronous HTTP API; frontend shows loading state |
| Transit dividend | V1.5 field | §9.7: keyword-based V1 ($87k downtown / $28k default) |
| NIM endpoint shape | unspecified; port ambiguous | §4: OpenAI-compatible `localhost:8080/v1` |
| RAG underspecified | conditional retrieval, no ingest/store | §12: offline ingest (`scripts/ingest_docs.py`) + Chroma + `rag/service.py` |
| RAG paths | `data/rag_corpus`, `data/rag_index` | §12: `data/land_laws/`, `data/vector_store/` |
| RAG embedding model | nv-embedqa-e5-v5 | §12: `nvidia/llama-3.2-nv-embedqa-1b-v2` |
| shapely dependency | PIP for all polygon sources | §3+§8.2: no shapely; haversine for distance, ray-casting for PIP |
| Separate cost/ modules | ltt.py, property_tax.py, mortgage.py, composites.py | §9: all in `engine/report_engine.py` (single auditable file) |
| CLI run_pipeline.py | specified as entrypoint | §6+§17: FastAPI + uvicorn; no CLI; debug via `/api/v1/debug/*` |
| Frontend: Streamlit | separate workstream | §2: Next.js 15 + React 19 consuming `ReportResponse` JSON |

---

## 20. NOT in Scope (V1)

- Chat follow-up Q&A endpoint (V1.5 — `answer_question()` not yet implemented).
- Live GTFS transit scoring (V1.5 — keyword-based dividend for demo).
- V1.5 sources: Heritage Formerly Listed, Residential Fire Inspections, Building
  Violations, Basement Flooding, Property Tax Relief programs.
- V2: zoning spatial joins, Committee of Adjustment, crime, VHT, utilities,
  insurance modeling, RAPIDS cuDF GPU spatial.
- Full `ReportResponse` caching for NIM-independence (only evidence caching for
  DEMO_MODE).
- Claude / Anthropic backend toggle (NIM only in V1).
- Multi-city, auth, persistence, streaming token output in the report path.

---

## 21. Known V1 Limitations (state honestly if asked)

- Property-type is a user-supplied guess at input time; the assessed-value
  multiplier it selects swings the tax estimate. Output is a ±15% range labelled
  Medium confidence — by design, not precision.
- Nominatim geocoding occasionally misresolves Toronto civic addresses to suburbs
  or returns no result. GeocodingError is surfaced immediately as HTTP 422 so the
  user can correct the address.
- Permit point-proximity can miss permits lacking coordinates (mitigated by `q=`
  fallback). A "no permits found" is "none found in available data", not "none exist".
- Composite signals are inferences over public data, never condo-corporation
  facts. Always Low confidence, always disclaimed.
- Transit dividend is keyword-based in V1; real GTFS walk-time scoring is V1.5.
