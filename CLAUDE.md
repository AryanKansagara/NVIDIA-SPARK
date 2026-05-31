# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Meridian computes the **true 10-year cost of ownership** for a Toronto property from an address, list price, and buyer profile. It pulls live Toronto Open Data (CKAN) + TRCA flood data, runs a deterministic financial engine, simulates outcome ranges on GPU, and narrates the result with a local NVIDIA LLM. Designed to run entirely on an NVIDIA DGX Spark (GB10) — no data leaves the device.

## Commands

**Backend** (Python 3.11+, FastAPI; the repo uses `uv`, but a `.venv` also exists at `backend/.venv`):
```bash
cd backend
uv sync                                              # install deps (or: pip install -e ".[dev]")
uv run uvicorn app.main:app --reload --port 8000     # run; health at /api/v1/health
uv run pytest                                         # all tests
uv run pytest tests/test_engine.py::<name>           # single test
```
With the existing venv instead of uv: `backend/.venv/bin/uvicorn app.main:app --reload --port 8000` and `backend/.venv/bin/pytest`.

**Frontend** (Next.js 15, TypeScript):
```bash
cd frontend
npm install            # first time
npm run dev            # http://localhost:3000
npm run build          # production build
npm run lint           # eslint
node_modules/.bin/tsc --noEmit   # typecheck (plain `npx tsc` installs the wrong package)
```

**Local model servers (on-device, OpenAI-compatible)** — served by vLLM, no hosted API, no API key:
```bash
cd backend
bash scripts/serve_llm.sh            # LLM  on :8080  (model nemotron-3-nano-30b-a3b, NVFP4 ~19GB)
bash scripts/serve_embed.sh          # NeMo Retriever embeddings on :8081
bash scripts/restart_llm.sh -d       # kill + relaunch LLM detached (logs -> /tmp/llm.log)
```
`serve_llm.sh` loads a local model directory (`LLM_MODEL_PATH`, default the on-disk NVFP4 30B) and falls back to an HF download if absent. Synthesis and chat are **local-only** — if `:8080` is down, narration returns `None` and the rest of the report still renders. Set `NIM_ENABLED=false` to skip narration entirely.

## Architecture

**Request flow:** Frontend form → `frontend/lib/api.ts` `fetchReport` → `POST /api/v1/report`. The frontend proxies `/api/*` to `http://localhost:8000` via rewrites in `frontend/next.config.ts`, so both run on their own ports with no CORS config.

**Backend is a 4-agent pipeline orchestrated by `backend/app/services/report_service.py` (`build_report`):**
1. **Geocode** (`services/geocoding`) — Nominatim → lat/lon used by everything downstream.
2. **Data retrieval** (`services/data_sources/{heritage,flood,development}.py`) — async lookups against CKAN (heritage ~12k records, development ~26k records) and TRCA ArcGIS (flood polygon). **Each service silently falls back to a heuristic** if the live API is unreachable; fallbacks surface as `warnings` in the response (string match on `"heuristic"` in the source field).
3. **Deterministic engine** (`services/engine/report_engine.py`) — owns ALL numbers: LTT, property tax projection, CMHC premium, two-term (60+60 month) mortgage model with bull/base/bear renewal scenarios, risk loadings, transit dividend. The LLM never invents figures.
4. **Synthesis** (`services/synthesis/service.py`) — sends structured engine output as JSON to the **local** Nemotron LLM (`nim_local_url`, :8080, model `nim_model`). **Local-only — no hosted-API fallback** (the previous cloud path has been removed). Returns `None` on any failure so the report degrades gracefully. The prompt is personalized with the stored buyer profile and includes 5/10/15-year horizon simulations.

Also in `build_report`: a **GPU Monte Carlo** simulation (`services/gpu/monte_carlo.py`, CuPy with NumPy fallback, 10k trajectories) producing the P10/P50/P90 band across **5/10/15-year horizons**, **RAG land-law context** (`services/rag/service.py`, NemoRetriever-first with ChromaDB fallback) fed into the synthesis prompt, the buyer **profile** pulled from `services/storage/app_store.py`, and **map geometry** including the community-pricing heuristic (`_community_insights`).

**Vector search backend** (`config.vector_backend`, default `chroma`): RAG retrieval runs on **ChromaDB** by default. Set `vector_backend=cuvs` to use the **NVIDIA cuVS** GPU index (built from the Chroma store; `services/rag/cuvs_store.py` — cuVS generates GPU candidates, then a cupy dot-product exact-rescores them for correct order + real cosine scores), which automatically falls back to Chroma on any GPU error. ChromaDB is always the persistence layer and backs episodic chat memory. The `.venv` carries `cuvs-cu13`/`cupy-cuda13x`; model servers in `.venv-serve` are unaffected.

**Re-indexing without a restart:** drop a PDF into `data/land_laws/` then `POST /api/v1/rag/reload` — it ingests in-process against the shared RAG collection (`get_rag_service`), so new chunks are immediately queryable by chat and reports. `GET /api/v1/rag/status` reports the collection count + indexed PDFs.

**Phase 6 — on-device memory, chat & profile** (`services/memory/`, `services/storage/`): a three-tier memory layer — short-term DuckDB `chat_turns`, structured DuckDB `user_profile`, and episodic ChromaDB `user_memories` embedded via the local NeMo Retriever server (:8081). Exposed via `POST /api/v1/chat` (conversational assistant, background fact extraction), `GET/PUT /api/v1/profile`, and `POST/GET /api/v1/reports[/{id}]` (saved reports). Memory feeds both chat and report synthesis. Everything runs on-device; see `docs/gpu-pipeline-upgrade/06-memory-chat.md` and `PRD.md`.

**Critical duplication:** the entire financial engine is reimplemented identically in TypeScript at `frontend/lib/report.ts` (`buildPreviewReport`) as an offline fallback used when the backend is unreachable. **Any change to a formula or constant in `report_engine.py` must be mirrored in `report.ts`, and vice versa**, or the preview and live numbers diverge. All such constants are documented in `docs/frontend-parameters.md`.

**Configuration:** all tunables live in `backend/app/core/config.py` (pydantic-settings), overridable via env vars or `backend/.env` (gitignored). This includes financial constants (tax rates, transit dividend amounts, risk loadings), local LLM/embedding endpoints (`nim_local_url` :8080, `embedding_local_url` :8081) and model names (`nim_model`), RAG settings, and GPU/Monte Carlo flags.

**Other endpoints:** `GET /api/v1/debug/{geocode,heritage,flood,development}?address=...` exercise individual data-source agents in isolation — useful for diagnosing which upstream dataset is failing. `POST /api/v1/pipeline/refresh` materializes CKAN data to Parquet/DuckDB (`services/pipeline/`).

## Conventions

- Backend: fully async services, pydantic schemas in `app/schemas/`, services constructed once and cached via `@lru_cache` in `get_report_service`. Data-source services return typed evidence objects (`services/data_sources/models.py`).
- `down_payment_percent`, `mortgage_rate`, `amortization_years` have schema defaults — only `address`, `list_price`, `buyer_profile` are truly required.
- Financial rates are hardcoded for 2026 (LTT brackets, property tax rate `0.00767311`, first-time rebate `$8,475`).

## Docs

`PRD.md` (repo root) is the whole-product requirements doc; `docs/prd-memory-chat.md` is the Phase 6 memory/chat sub-PRD. `docs/` holds the product/architecture narrative; `docs/gpu-pipeline-upgrade/` documents the DuckDB/GPU/LLM/map/memory upgrade phases (1–6); `docs/frontend-parameters.md` is the authoritative list of every parameter behind the displayed numbers.
