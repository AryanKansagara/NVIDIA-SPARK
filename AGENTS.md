# AGENTS.md

Guidance for any AI coding agent working in this repository. This is the tool-agnostic companion to `CLAUDE.md` — read `CLAUDE.md` for the full architecture and command reference. This file highlights the rules that most often trip agents up.

## Project in one line

Meridian computes the **true 10-year cost of ownership** for a Toronto property and runs entirely on an NVIDIA DGX Spark (GB10): live Toronto/TRCA data → deterministic financial engine → GPU Monte Carlo → local Nemotron LLM narration. No data leaves the device.

## Setup & run

```bash
# Backend (Python 3.11+)
cd backend && uv sync
uv run uvicorn app.main:app --reload --port 8000      # health: /api/v1/health
uv run pytest                                          # tests

# Frontend (Next.js 15 + TS)
cd frontend && npm install
npm run dev                                            # http://localhost:3000
npm run lint
node_modules/.bin/tsc --noEmit                        # NOT `npx tsc` (wrong package)
```

The frontend proxies `/api/*` to `localhost:8000` (see `frontend/next.config.ts`). Run both servers; no CORS setup needed.

## Rules that matter

1. **Mirror the financial engine across languages.** The full cost calculation exists twice: `backend/app/services/engine/report_engine.py` (authoritative) and `frontend/lib/report.ts` `buildPreviewReport` (offline fallback). Any change to a formula or constant in one MUST be applied to the other, or live numbers and the preview diverge. See `docs/frontend-parameters.md` for the canonical parameter list.

2. **The LLM never invents numbers.** Agent 4 (`services/synthesis/service.py`) only narrates structured output from the deterministic engine. Do not move financial logic into prompts.

3. **Everything degrades gracefully — preserve that.** Data sources fall back to heuristics (surfaced as `warnings`), synthesis is local-NIM → hosted-API → `None`, GPU Monte Carlo falls back to NumPy, RAG falls back to ChromaDB. Don't introduce hard failures where a fallback is expected.

4. **Config is centralized.** All tunables (tax rates, transit dividend, risk loadings, NIM endpoints/model, RAG, GPU flags) live in `backend/app/core/config.py` and are overridable via `backend/.env` (gitignored). Don't hardcode new constants in services — add them to `Settings`.

5. **Backend is fully async.** Services are constructed once and cached via `@lru_cache` in `get_report_service`. Data-source services return typed evidence objects (`services/data_sources/models.py`).

## Request flow

Frontend form → `lib/api.ts fetchReport` → `POST /api/v1/report` → `report_service.build_report` orchestrates: geocode → heritage/flood/development lookups → deterministic engine → Monte Carlo + RAG + map/community-pricing geometry → LLM synthesis → `ReportResponse`.

Debug individual data-source agents at `GET /api/v1/debug/{geocode,heritage,flood,development}?address=...`.

## Validation before you finish

- Backend: `uv run pytest` passes.
- Frontend: `node_modules/.bin/tsc --noEmit` and `npm run lint` clean.
- If you touched a financial formula, confirm both `report_engine.py` and `report.ts` were updated and `docs/frontend-parameters.md` still matches.

## Git

`backend/.env` is gitignored and contains `NIM_API_KEY` — never commit it. The HTTPS remote has no stored credentials; pushes go over the SSH key (`git@github.com:AryanKansagara/NVIDIA-SPARK.git`).
