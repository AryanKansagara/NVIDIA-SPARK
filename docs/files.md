# Meridian — Repository File Map

## Root

- `CLAUDE.md` — Instructions for Claude Code: commands, architecture overview, conventions, and critical notes about the TypeScript/Python formula parity requirement.
- `PRD.md` — Full product requirements document covering all six phases, user stories, scoring criteria, and the Spark Story narrative.
- `README.md` — Project overview and quick-start for the hackathon demo.
- `AGENTS.md` — Agent-specific context for agentic coding tools.
- `SKILLS.md` / `SOUL.md` — Claude Code configuration files for skill and behavior tuning.

---

## `backend/`

- `app/main.py` — FastAPI application factory; mounts the v1 router; sets up CORS and lifespan handlers.
- `pyproject.toml` — Python dependencies (uv/pip): FastAPI, DuckDB, pyarrow, pyproj, pyshp, CuPy, chromadb, sentence-transformers, and dev deps.
- `README.md` — Backend-specific quick-start and environment notes.

### `backend/app/api/`

- `router.py` — Central APIRouter that includes all route modules under `/api/v1`; registers health, report, pipeline, rag, chat, and profile routers.

### `backend/app/api/routes/`

- `health.py` — `GET /api/v1/health`; probes the local LLM (:8080) and embedding server (:8081) with a 2 s timeout; returns `{llm_local, embeddings_local, model}`.
- `report.py` — `POST /api/v1/report`; validates request, calls `ReportService.build_report`, returns `ReportResponse`. The main product endpoint.
- `pipeline.py` — `POST /api/v1/pipeline/refresh`; orchestrates concurrent CKAN/SHP fetch, Parquet write, DuckDB load, and cleaning; returns row counts and warnings.
- `debug.py` — `GET /api/v1/debug/{geocode,heritage,flood,development}`; exercises individual data-source agents in isolation for troubleshooting.
- `rag.py` — `POST /api/v1/rag/reload` (re-ingests PDFs from `data/land_laws/` without restart); `GET /api/v1/rag/status` (collection count + indexed PDFs).
- `chat.py` — `POST /api/v1/chat`; RAG land-law lookup + `MemoryService.chat()`; background `remember()` fact extraction.
- `profile.py` — `GET/PUT /api/v1/profile`; `POST /api/v1/reports/save`; `GET /api/v1/reports`; `GET /api/v1/reports/{id}`.

### `backend/app/core/`

- `config.py` — Pydantic-settings `Settings` class; all tunables: financial constants (tax rates, risk loadings, transit dividend), LLM/embedding endpoints (`nim_local_url :8080`, `embedding_local_url :8081`), RAG settings, GPU flags, DuckDB path, Monte Carlo parameters. Overridable via env vars or `backend/.env`.

### `backend/app/schemas/`

- `report.py` — `ReportRequest`, `ReportResponse`, `MonteCarloResult`, `MapGeometry`, `CostBreakdown`, `MortgageScenario`, and all nested types that define the report contract between backend and frontend.
- `pipeline.py` — `PipelineRefreshRequest` / `PipelineRefreshResponse` (row counts, duration, Parquet paths, warnings).
- `profile.py` — `ProfileIn/Out`, `SavedReportSummary`, `SaveReportResponse` for the memory/profile layer.
- `debug.py` — Debug endpoint response types for individual data-source probe results.

### `backend/app/services/`

- `report_service.py` — Orchestrator: runs geocoding, heritage/flood/development lookups (concurrently), deterministic engine, GPU Monte Carlo, RAG, synthesis, and map geometry assembly into a single `ReportResponse`. Cached via `@lru_cache`.

#### `backend/app/services/geocoding/`

- `service.py` — Nominatim geocoder; returns `(lat, lon)` for a Toronto address; used by all downstream spatial lookups.

#### `backend/app/services/data_sources/`

- `models.py` — Typed evidence objects (`HeritageEvidence`, `FloodEvidence`, `DevelopmentEvidence`) returned by data-source services.
- `heritage.py` — Queries `heritage` DuckDB table (bounding-box SQL + haversine); falls back to heuristic when table is empty.
- `flood.py` — Live query against TRCA ArcGIS FeatureServer; fetches GeoJSON flood polygon per address; falls back to heuristic.
- `development.py` — Queries `development` DuckDB table for active applications within 500 m; falls back to heuristic.

#### `backend/app/services/engine/`

- `report_engine.py` — The deterministic financial engine. Owns **all dollar figures**: LTT, MLTT, first-time rebates, property-tax projection, CMHC premium, two-term (60+60 month) mortgage with bull/base/bear renewal scenarios, flood/heritage risk loadings, transit dividend. The LLM never invents numbers.

#### `backend/app/services/gpu/`

- `monte_carlo.py` — `MonteCarloSimulator`; 10,000-trajectory cost simulation using CuPy on GPU or numpy on CPU. Models tax-growth noise, maintenance, insurance, and year-5 renewal rate shock. Returns P10/P50/P90 for 5/10/15-year horizons.
- `spatial.py` — `find_within_radius()`; GPU haversine via cuDF/cuSpatial, numpy-vectorized fallback. Try-import guard at module load decides path once.

#### `backend/app/services/pipeline/`

- `ckan_fetcher.py` — Paginated CKAN `datastore_search` extraction (5,000 rows/request).
- `shp_fetcher.py` — Downloads Heritage Register SHP ZIP (no datastore API); reads with `pyshp`; emits WGS84 dict records.
- `duckdb_store.py` — Singleton DuckDB wrapper; `load_parquet`, `execute`, `fetchdf`, `has_table`, `row_count`.
- `heritage_cleaner.py` — Normalizes raw heritage records to `part_iv / part_v / listed / removed`; idempotent `DELETE + INSERT OR REPLACE`.
- `development_cleaner.py` — Composes address from parts; reprojects EPSG:2952 → WGS84 (critical correctness fix); derives `active` boolean; idempotent load.

#### `backend/app/services/rag/`

- `service.py` — `RAGService`; tries NemoRetriever first (`nemo_retriever_enabled`), falls through to ChromaDB on any error.
- `ingest.py` — Ingests PDFs from `data/land_laws/` into the ChromaDB collection; called by `rag/reload` endpoint.
- `cuvs_store.py` — Optional NVIDIA cuVS GPU index built from the Chroma store; cuVS generates GPU candidates, CuPy dot-product exact-rescores for correct cosine order. Falls back to Chroma on any GPU error.

#### `backend/app/services/synthesis/`

- `service.py` — `SynthesisService`; local-only (no hosted API fallback); posts structured engine output + Monte Carlo + buyer profile + RAG context as JSON to Nemotron :8080; returns narration string or `None` on failure.

#### `backend/app/services/memory/`

- `memory_service.py` — `MemoryService`; `recall()` fuses short-term turns + structured profile + episodic semantic results; `chat()` assembles system prompt and calls local LLM; `remember()` does background fact extraction + episodic embedding.
- `episodic_store.py` — `EpisodicStore`; persists durable fact strings to ChromaDB `user_memories` collection embedded via local NeMo Retriever (:8081).

#### `backend/app/services/storage/`

- `app_store.py` — Singleton `AppStore` sharing the pipeline DuckDB file; manages `user_profile`, `saved_reports`, and `chat_turns` tables; all writes guarded by an instance lock.

#### `backend/app/services/web/`

- `search.py` — Lightweight web search utility (used by some debug/enrichment paths).

### `backend/scripts/`

- `serve_llm.sh` — Launches vLLM serving Nemotron-3 Nano 30B (NVFP4 4-bit) on `:8080`; uses `LLM_MODEL_PATH` env var, falls back to HF download.
- `serve_embed.sh` — Launches the NeMo Retriever embedding server on `:8081`.
- `serve_rerank.sh` — Launches an optional reranker server.
- `restart_llm.sh` — Kills and relaunches the LLM server detached (`-d` flag); logs to `/tmp/llm.log`.
- `seed_land_laws.py` — Ingests the PDFs in `data/land_laws/` into ChromaDB via the running backend.
- `ingest_docs.py` — Alternative ingest script for ad-hoc document loading.

### `backend/tests/`

- `test_engine.py` — Unit tests for `report_engine.py`; covers LTT calculation, mortgage amortization, CMHC premium, property-tax projection, and risk loadings. Run with `uv run pytest`.

---

## `frontend/`

- `next.config.ts` — Next.js config; `/api/*` rewrites proxy to `http://localhost:8000` so both services run on their own ports with no CORS config required.
- `tailwind.config.ts` — Tailwind configuration including the custom design token palette (`ink`, `slate`, `sand`, `moss`, `ember`, etc.).

### `frontend/app/`

- `layout.tsx` — Root layout; imports `leaflet/dist/leaflet.css`; wraps the app in `AppShell` and the global `AppProvider` context.
- `page.tsx` — Home/main page; renders `Hero` + `Workbench` (the primary report UI).
- `analyze/page.tsx` — Dedicated analysis page for deep-dive report view.
- `chat/page.tsx` — Chat interface page; renders the conversational assistant backed by `POST /api/v1/chat`.
- `deck/page.tsx` — Pitch-deck page; renders the `PitchDeck` component for demo/investor presentation.
- `profile/page.tsx` — Buyer profile editor; reads/writes `GET/PUT /api/v1/profile`.
- `reports/page.tsx` — Saved reports list; reads from `GET /api/v1/reports`.

### `frontend/components/`

- `workbench.tsx` — Central report workspace; manages report state, pipeline refresh, and renders all sub-panels (map, charts, summary, agents, flags). Main orchestrator component.
- `input-card.tsx` — Property input form: address, list price, buyer profile; "Generate Report" and "Refresh Live Data" buttons with pipeline status display.
- `summary-card.tsx` — Three-stat summary widget: true 10-year cost, equity projection, and Monte Carlo P50 with P10/P90 sub-text.
- `charts.tsx` — Cost breakdown charts and Monte Carlo chart panel; switches between "Simulation Results" and "Renewal Risk" based on data availability.
- `monte-carlo-chart.tsx` — P10/P50/P90 distribution rendered as labeled progress bars; falls back to scenario ladder when no simulation data.
- `property-map.tsx` — Leaflet interactive map: property marker, 500 m dev pressure ring, 400 m transit ring, TRCA flood GeoJSON overlay. SSR-safe (loaded via `dynamic`).
- `agents-panel.tsx` — Displays the four pipeline agents (Geocode, Data, Engine, Synthesis) with live status indicators during report generation.
- `agents-working.tsx` — Animated agent activity visualization shown while a report is being computed.
- `chat-panel.tsx` — Embedded chat panel within the workbench; sends messages to `/api/v1/chat`.
- `floating-chat.tsx` — Floating chat button/drawer accessible from any page.
- `flag-list.tsx` — Renders the risk and opportunity flag list from the report (heritage, flood, development pressure, transit dividend, etc.).
- `hero.tsx` — Landing hero section with product tagline and quick-start prompt.
- `app-shell.tsx` — Page shell with sidebar navigation and top bar.
- `top-bar.tsx` — Top navigation bar with health badge (LLM/embedder status), page title, and user controls.
- `knowledge-graph.tsx` — Visual knowledge-graph component showing RAG retrieval connections.
- `onboarding-modal.tsx` — First-run modal for capturing the buyer's profile (name, income, goals).
- `pitch-deck.tsx` — Full-screen pitch deck slides for investor/judge presentation.
- `ui/panel.tsx` — Reusable card/panel wrapper with consistent padding and border styling.
- `ui/pill.tsx` — Small status pill badge component (used for source labels and risk flags).

### `frontend/lib/`

- `api.ts` — `fetchReport()` (POST to `/api/v1/report`), `BackendReport` type with snake_case fields, `mapReport()` camelCase conversion. Source of truth for frontend↔backend schema mapping.
- `report.ts` — `MeridianReport` TypeScript type, `buildPreviewReport()` offline fallback that reimplements the financial engine in TypeScript. **Must stay in sync with `report_engine.py`** — any formula change in Python must be mirrored here.
- `app-context.tsx` — Global React context (`AppProvider`) providing report state, profile, and pipeline status across all pages.
- `pipeline-api.ts` — `fetchPipelineRefresh()` typed wrapper for `POST /api/v1/pipeline/refresh`.
- `utils.ts` — Shared formatting and currency utilities (`formatCAD`, `formatPercent`, etc.).

---

## `docs/`

- `README.md` — This documentation index.
- `architecture.md` — System design with Mermaid diagrams for the report request flow, data pipeline flow, and memory/chat flow.
- `nvidia-services.md` — Every NVIDIA technology in the stack: Nemotron model details, vLLM serving config, cuVS GPU index, CuPy Monte Carlo, cuSpatial, NeMo Retriever.
- `data.md` — City of Toronto data sources (CKAN, TRCA), official vs assumed distinction, pipeline flow, DuckDB schema, coordinate reprojection fix, query path, and how to run and verify the pipeline.
- `frontend-parameters.md` — Authoritative list of every financial constant and formula used to generate displayed numbers (LTT brackets, tax rate, CMHC tiers, risk loadings, transit dividend amounts, mortgage model).
- `implementation-history.md` — How Meridian evolved across six phases: DuckDB pipeline → GPU acceleration → Leaflet map → LLM upgrade → frontend changes → on-device memory and chat.
- `files.md` — This file. Full repo file map with purpose descriptions.
- `backend/api-implementation.md` — API implementation reference notes.
