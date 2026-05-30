# Meridian — True Cost of Ownership Agent

Takes a Toronto address, list price, and buyer profile and returns the **true 10-year cost of ownership** by pulling live data from Toronto Open Data and the TRCA. Runs entirely local on NVIDIA GX10 (GB10 Blackwell). No data leaves the device.

---

## Running locally

### Backend setup

The backend requires **Python 3.11+** and uses [`uv`](https://github.com/astral-sh/uv) for dependency management.

**1. Install uv** (if not already installed)
```bash
curl -LsSf https://astral.sh/uv/install.sh | sh
```

**2. Install dependencies**
```bash
cd backend
uv sync
```

**3. Configure environment**

Copy the example env file and fill in your values:
```bash
cp .env.example .env   # if .env.example exists, otherwise create .env manually
```

Minimum `.env` for local development (NIM disabled):
```env
NIM_ENABLED=false
```

See the [Configuration](#configuration) section below for all available variables.

**4. Start the backend**
```bash
uv run uvicorn app.main:app --reload --port 8000
```

Or, if you activated the virtual environment manually (`source .venv/bin/activate`):
```bash
uvicorn app.main:app --reload --port 8000
```

Confirm healthy: `http://localhost:8000/api/v1/health`

> The first report request takes 10–20 s while heritage and development datasets load from CKAN into memory. Subsequent requests are fast.

---

### Full stack (all terminals)

You need two terminals (three if running NIM).

**Terminal 1 — backend**
```bash
cd backend
uv run uvicorn app.main:app --reload --port 8000
```

**Terminal 2 — frontend**
```bash
cd frontend
npm install   # first time only
npm run dev
```
Open `http://localhost:3000`

**Terminal 3 — NIM (optional, for AI narrative)**
```bash
docker run --gpus all -p 8080:8000 \
  nvcr.io/nim/meta/llama-3.1-8b-instruct:latest-dgx-spark
```
If NIM is not running, set `NIM_ENABLED=false` in `backend/.env`. The report still works; the narrative summary will be blank.

---

## What's implemented

### Backend (FastAPI + Python 3.11)

**Agent 1 — Intake**
- Address geocoding via Nominatim (OpenStreetMap)
- Returns lat/lon used by all downstream services

**Agent 2 — Data retrieval (live, async)**
- **Heritage Register** — loads all ~12k records from Toronto CKAN at startup; spatial match within 80 m; classifies as Part IV (red), Part V (yellow), or Listed (info)
- **Flood zone** — live point-in-polygon query against TRCA ArcGIS REST API; flags property if it intersects a flood polygon
- **Development applications** — loads all ~26k records from Toronto CKAN at startup; counts active applications within 500 m using haversine; classifies as high (≥10), medium (≥5), or low pressure
- All three services fall back to a heuristic if the live API is unreachable

**Agent 3 — Cost computation (deterministic)**
- Ontario + Toronto land transfer tax (progressive brackets, hardcoded 2026 rates)
- First-time buyer rebate: $8,475
- Property tax 10-year projection (rate 0.00767311, assessed value proxy 60% of list price, 3% annual growth)
- CMHC insured mortgage premium (tiered by down payment %)
- Two-term mortgage model over 10 years (base / bull −0.5% / bear +1.5% renewal scenarios)
- Risk-weighted loadings: flood (+$3,500/yr), heritage (+$12,000), development pressure (+$7,000–$17,000)
- Transit Dividend: estimated 10-year savings vs. car-dependent baseline based on proximity to downtown TTC stations

**Agent 4 — Synthesis (local LLM)**
- Calls NVIDIA NIM (OpenAI-compatible API) with structured engine output
- Generates a 3-paragraph buyer narrative: verdict, cost drivers, actionable steps
- Gracefully skipped if NIM is unavailable; rest of report is unaffected

### Frontend (Next.js 15 + TypeScript)
- Address, list price, buyer profile, down payment, mortgage rate, amortization input form
- True 10-year cost summary with above-list percentage
- Cost breakdown bar chart (mortgage, transfer tax, property tax, risk loadings, transit dividend)
- Mortgage scenario ladder (bull / base / bear)
- Red / yellow / green flag display
- Falls back to client-side calculation if backend is unreachable

---

## Configuration

All settings can be overridden via environment variables in `backend/.env`:

| Variable | Default | Description |
|----------|---------|-------------|
| `NIM_BASE_URL` | `http://localhost:8080/v1` | NIM OpenAI-compatible endpoint |
| `NIM_MODEL` | `meta/llama-3.1-8b-instruct` | Model served by NIM |
| `NIM_ENABLED` | `true` | Set to `false` to skip synthesis |
| `TRCA_FLOOD_QUERY_URL` | TRCA ArcGIS REST URL | Flood polygon service endpoint |

---

## Data sources

| Source | Dataset | Refresh |
|--------|---------|---------|
| Toronto Open Data (CKAN) | Heritage Register | Quarterly |
| Toronto Open Data (CKAN) | Development Applications | Weekly |
| TRCA ArcGIS REST | Floodline polygon | External |
| Hardcoded (2026) | Ontario + Toronto LTT brackets | Annual |
| Hardcoded (2026) | Property tax rate 0.00767311 | Annual |
