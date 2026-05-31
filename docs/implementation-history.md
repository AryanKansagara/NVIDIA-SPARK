# Meridian — Implementation History

Six phases took Meridian from a single-file Python prototype to a fully local-first, GPU-accelerated property analysis platform running on the DGX Spark.

---

## Phase 1 — DuckDB Data Pipeline

**Goal:** Replace in-memory Python lists with a persistent DuckDB database backed by Parquet files. Data is materialized on demand via `POST /api/v1/pipeline/refresh` rather than on every cold start.

**What changed:**
- Added `ckan_fetcher.py` — paginated extraction (5,000 rows/page) from Toronto Open Data CKAN.
- Added `shp_fetcher.py` — downloads the Heritage Register SHP ZIP (no datastore API available) and reads it with `pyshp`, emitting dict records shaped identically to datastore output.
- Added `duckdb_store.py` — singleton wrapper around `data/meridian.duckdb`; `load_parquet`, `execute`, `fetchdf`, `has_table`, `row_count` methods.
- Added `heritage_cleaner.py` — normalizes freeform status strings to `part_iv / part_v / listed / removed`.
- Added `development_cleaner.py` — derives `active` boolean, parses dates, handles missing columns via `_pick_optional`.
- Added `pipeline.py` route — orchestrates concurrent fetch, Parquet write, DuckDB load, cleaning, and audit row.
- Updated `data_sources/heritage.py` and `development.py` — replaced Python list iteration with DuckDB bounding-box SQL + GPU spatial fallback.
- Added `schemas/pipeline.py` — `PipelineRefreshRequest` / `PipelineRefreshResponse`.

**Key files:** `services/pipeline/`, `api/routes/pipeline.py`, `schemas/pipeline.py`.

---

## Phase 2 — GPU Acceleration (RAPIDS + CuPy Monte Carlo)

**Goal:** Replace the Python haversine `for` loop and single-number cost estimate with GPU-accelerated spatial filtering and a 10,000-trajectory Monte Carlo simulation.

**What changed:**
- Added `services/gpu/spatial.py` — `find_within_radius()` uses cuDF + cuSpatial when importable; falls back to a numpy-vectorized haversine on CPU. Try-import guard decides path once at module load.
- Added `services/gpu/monte_carlo.py` — `MonteCarloSimulator(n_sims=10_000)` with CuPy (numpy fallback). Models property-tax growth rate noise, maintenance/reserve, insurance (flood loading), and year-5 renewal rate shock across a `(n_sims, years)` matrix. Returns `MonteCarloResult(p10, p50, p90, mean, n, elapsed_ms)`.
- Extended `schemas/report.py` with `MonteCarloResult` and `MapGeometry` (nullable on `ReportResponse`).
- `report_service.py` runs Monte Carlo after the deterministic engine and builds `MapGeometry` from flood data.
- `synthesis/service.py` passes Monte Carlo P10/P90 into Nemotron context so the narrative describes the cost range.
- `data_sources/flood.py` fetches the TRCA GeoJSON polygon (`returnGeometry=true`) and stores it in `FloodEvidence.polygon_geojson`.

**Key files:** `services/gpu/spatial.py`, `services/gpu/monte_carlo.py`, `schemas/report.py`.

---

## Phase 3 — Interactive Leaflet Map

**Goal:** Replace the static CSS gradient map placeholder with a real interactive map showing property pin, development pressure ring, TTC transit ring, and TRCA flood polygon.

**What changed:**
- Added `frontend/components/property-map.tsx` — Leaflet `MapContainer` with four layers: property `Marker`, 500 m ember `Circle` (dev pressure), 400 m dashed moss `Circle` (TTC), and `GeoJSON` layer for the flood polygon. Renders a CSS placeholder when `geometry` is null.
- `workbench.tsx` loads the component via `dynamic(..., { ssr: false })` — Leaflet references `window` at import time and crashes Next.js SSR without this guard.
- `app/layout.tsx` imports `leaflet/dist/leaflet.css`.
- `frontend/lib/api.ts` maps `map_geometry` snake_case → camelCase `MapGeometry` type.

**Key files:** `frontend/components/property-map.tsx`, `frontend/app/layout.tsx`.

---

## Phase 4 — LLM Upgrade (Nemotron + NemoRetriever RAG)

**Goal:** Switch synthesis to Nemotron 3 Nano, feed Monte Carlo distribution into the prompt, and add NemoRetriever as a first-try RAG retrieval path with ChromaDB fallback.

**What changed:**
- `config.py` gains `nemotron_model`, `nemo_retriever_enabled`, `nemo_retriever_url` settings.
- `synthesis/service.py` — model name from config (was hardcoded); Monte Carlo P10/P90/P50 included in JSON context; system prompt instructs model to reference the range in paragraph 1.
- `rag/service.py` — added `_NemoRetriever` class; `query()` tries NemoRetriever first, catches any error, falls through to ChromaDB. ChromaDB remains the default and is always available.
- Prompt context now includes `monte_carlo_simulation` block with `trajectories`, `p10`, `p50`, `p90`, `mean`.

**Key files:** `services/synthesis/service.py`, `services/rag/service.py`, `core/config.py`.

---

## Phase 5 — Frontend Changes

**Goal:** Surface Monte Carlo results and the live map in the UI; simplify the input form; add a pipeline refresh control.

**What changed:**
- `frontend/lib/report.ts` — added `MonteCarloDistribution` and `MapGeometry` types; extended `MeridianReport`; `buildPreviewReport()` returns both as `null`.
- `frontend/lib/api.ts` — extended `BackendReport` with snake_case Monte Carlo and map geometry fields; `mapReport()` converts to camelCase.
- `frontend/lib/pipeline-api.ts` (new) — `fetchPipelineRefresh()` POSTs to `/api/v1/pipeline/refresh` and maps response to `PipelineStatus`.
- `frontend/components/input-card.tsx` — removed Down Payment %, Mortgage Rate, and Amortization Years fields; added "Refresh Live Data" button with spinner; added status row showing last refresh time and row counts.
- `frontend/components/summary-card.tsx` — color-scheme fix (dark → light theme); third stat box shows P50 with P10/P90 sub-text when Monte Carlo data is present.
- `frontend/components/charts.tsx` — accepts `monteCarlo` and `listPrice` props; renders `MonteCarloChart` when data is present.
- `frontend/components/monte-carlo-chart.tsx` (new) — P10/P50/P90 distribution as labeled progress bars; falls back to scenario ladder when null.
- `frontend/components/workbench.tsx` — added `pipelineStatus` state and `handleRefreshPipeline()`; passes Monte Carlo data to `Charts`; renders `PropertyMap`.

**Key files:** `frontend/lib/`, `frontend/components/input-card.tsx`, `frontend/components/summary-card.tsx`, `frontend/components/charts.tsx`.

---

## Phase 6 — On-Device Memory, Chat & Saved Reports

**Goal:** Add a persistent three-tier memory layer, a conversational assistant, an editable buyer profile, and saved reports — all running entirely on the DGX Spark. Simultaneously complete the local-first migration: the hosted NVIDIA API fallback for synthesis is removed.

**What changed:**
- Added `services/storage/app_store.py` — singleton `AppStore` sharing the pipeline DuckDB file; creates and manages `user_profile`, `saved_reports`, and `chat_turns` tables.
- Added `services/memory/memory_service.py` — `MemoryService` with `recall()` (fuses short-term turns + structured profile + episodic semantic results), `remember()` (background fact extraction → episodic store), and `chat()` (assembles system prompt from memory, calls local LLM :8080, stores turns).
- Added `services/memory/episodic_store.py` — `EpisodicStore` persists durable fact strings to ChromaDB `user_memories` collection, embedded via the local NeMo Retriever server (:8081).
- Added `api/routes/chat.py` — `POST /api/v1/chat`; RAG land-law context lookup followed by `MemoryService.chat()`; `remember()` runs as a fire-and-forget background task.
- Added `api/routes/profile.py` — `GET/PUT /api/v1/profile`; `POST/GET /api/v1/reports` (save and list); `GET /api/v1/reports/{id}`.
- Added `schemas/profile.py` — `ProfileIn/Out`, `SavedReportSummary`, `SaveReportResponse`.
- `synthesis/service.py` — local-only (no cloud fallback); injects `buyer_situation` (non-empty profile fields) and `horizon_simulations` (5/10/15-year P10/P50/P90) into the JSON context.
- `report_service.py` — reads profile from `AppStore` and passes it into synthesis.
- `api/routes/health.py` — probes `:8080` and `:8081` with 2 s timeout; returns `{llm_local, embeddings_local, model}`.
- Frontend: added `/chat`, `/profile`, and `/reports` pages; `floating-chat.tsx` component; `onboarding-modal.tsx` for first-run profile capture; health badge in top bar.

**Key files:** `services/storage/app_store.py`, `services/memory/`, `api/routes/chat.py`, `api/routes/profile.py`, `schemas/profile.py`.
