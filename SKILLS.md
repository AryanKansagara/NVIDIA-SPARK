# SKILLS.md

The capabilities Meridian provides, mapped to where they live in the code. Think of these as the system's "skills" — what it can do, what it depends on, and how it behaves when a dependency is unavailable.

Each skill lists its **entry point** and its **fallback** (Meridian degrades rather than fails — see `SOUL.md` principle 3).

## 1. Address intake & geocoding

Resolve a free-text Toronto address to coordinates used by every downstream skill.
- **Entry:** `backend/app/services/geocoding/service.py` (Nominatim / OpenStreetMap)
- **Debug:** `GET /api/v1/debug/geocode?address=...`

## 2. Heritage register lookup

Flag heritage-designated or heritage-sensitive properties (Part IV / Part V / Listed).
- **Entry:** `services/data_sources/heritage.py` — spatial match (~80 m) against ~12k Toronto CKAN records loaded at startup
- **Fallback:** heuristic; emits a `warnings` entry
- **Debug:** `GET /api/v1/debug/heritage?address=...`

## 3. Flood-zone detection

Point-in-polygon test for TRCA floodline exposure; adds annual risk loading.
- **Entry:** `services/data_sources/flood.py` (live TRCA ArcGIS REST query)
- **Fallback:** heuristic; emits a `warnings` entry
- **Debug:** `GET /api/v1/debug/flood?address=...`

## 4. Development-pressure analysis

Count active development applications within 500 m (haversine); classify high/medium/low pressure.
- **Entry:** `services/data_sources/development.py` — ~26k Toronto CKAN records loaded at startup
- **Fallback:** heuristic; emits a `warnings` entry
- **Debug:** `GET /api/v1/debug/development?address=...`

## 5. Deterministic cost engine (the core skill)

Compute every dollar figure: Ontario + Toronto land transfer tax, first-time rebate, 10-year property-tax projection, CMHC insured premium, two-term (60+60 month) mortgage model with bull/base/bear renewal scenarios, risk loadings, and transit dividend.
- **Entry:** `services/engine/report_engine.py`
- **Mirror:** `frontend/lib/report.ts` `buildPreviewReport` (offline client-side copy — keep in sync)
- **Parameters:** documented in `docs/frontend-parameters.md`

## 6. GPU Monte Carlo simulation

Simulate 10k cost trajectories to produce a P10/P50/P90 outcome band.
- **Entry:** `services/gpu/monte_carlo.py` (CuPy on GB10)
- **Fallback:** NumPy on CPU

## 7. Land-law RAG context

Retrieve relevant land-law passages to ground the buyer narrative.
- **Entry:** `services/rag/service.py` — NemoRetriever first
- **Fallback:** local ChromaDB vector store
- **Ingest:** `backend/scripts/ingest_docs.py`

## 8. LLM synthesis (buyer narrative)

Turn structured engine output into a 3-paragraph plain-English summary (verdict / cost drivers / next steps).
- **Entry:** `services/synthesis/service.py` — model `nvidia/nemotron-nano-12b-v2-vl`
- **Order:** local NIM container (`localhost:8080`) → hosted NVIDIA API (`NIM_API_KEY`) → `None` (report still renders)

## 9. Interactive map & community pricing

Render the property pin, development-pressure radius (500 m), TTC walkability ring (400 m), flood polygon overlay, and a clickable "$" pin with surrounding-community pricing insights.
- **Backend geometry:** `report_service._community_insights` + `MapGeometry` schema
- **Frontend:** `frontend/components/property-map.tsx` (Leaflet)

## 10. Data pipeline (Parquet / DuckDB)

Materialize CKAN datasets to Parquet and DuckDB for fast local querying.
- **Entry:** `services/pipeline/` + `POST /api/v1/pipeline/refresh`

---

### Orchestration

All report skills are sequenced by `report_service.build_report` and exposed at `POST /api/v1/report`. The frontend reaches it through the `/api/*` proxy in `frontend/next.config.ts`. Skills 5 and the frontend mirror are the most fragile coupling in the system — see `AGENTS.md` rule 1.
