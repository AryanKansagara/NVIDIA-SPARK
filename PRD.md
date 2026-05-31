# PRD.md — Meridian

Product Requirements Document for **Meridian**, the on-device true-cost-of-ownership agent for Toronto real estate. This is the whole-product PRD; it sits alongside `SOUL.md` (the why), `AGENTS.md`/`CLAUDE.md` (how to build it), and `SKILLS.md`. For the deep feature spec of the conversational memory layer, see `docs/prd-memory-chat.md`.

---

## 1. Summary

A list price is a lie of omission. It hides land transfer tax, a decade of property tax, mortgage renewal risk, flood exposure, heritage restrictions, and the slow churn of redevelopment next door. **Meridian replaces a single misleading number with the true 10-year cost of ownership** for one specific Toronto property — and explains it in plain language a first-time buyer can act on.

Meridian runs **entirely on an NVIDIA DGX Spark (GB10)**. Live Toronto/TRCA data → a deterministic financial engine → a GPU Monte Carlo simulation → a local Nemotron LLM narration, plus a private per-user memory and chat assistant. No address and no financial detail leaves the device.

## 2. Problem

Home buyers anchor on list price, but real ownership cost depends on variables that are fragmented across city websites, open datasets, and personal-finance rules:

- Toronto's double land transfer tax (municipal + provincial)
- property tax compounded over a decade
- CMHC mortgage-default insurance and renewal-rate risk
- flood exposure (TRCA regulated areas)
- heritage restrictions on alteration/demolition
- redevelopment pressure from nearby active applications
- transportation cost differences by location

Buyers rarely see these in one place before they commit to the largest purchase of their life. Generic AI chatbots that could help instead **forget context between sessions** and **send private finances to the cloud**.

## 3. Goals & Non-Goals

**Goals**
- Turn `(address, list price, buyer profile)` into an auditable 10-year cost of ownership with a transparent breakdown.
- Quantify uncertainty as a P10/P50/P90 range, not a single false-precision number.
- Surface red/yellow/green risk flags from live municipal/flood data.
- Narrate the result in plain language without ever inventing a figure.
- Let the buyer reason interactively via a private assistant that remembers their situation across sessions.
- Run the full stack — LLM, embeddings, simulation, memory — on-device on the DGX Spark.

**Non-Goals**
- Not an appraisal, lending-decision, or insurance-quote tool.
- No buy/sell/investment advice — facts and flags only.
- No multi-user accounts, auth, or cloud sync (single implicit local user).

## 4. Users

- **Primary:** first-time Toronto home buyer.
- **Secondary:** investors, downsizers, and real-estate/mortgage advisors using it as a decision aid.

## 5. Principles (from `SOUL.md`)

1. **Numbers are sacred; prose is service.** Every dollar comes from deterministic code; the LLM only explains it.
2. **Local-first, private by default.** The product runs on the user's device; cloud is never the default path and never silent.
3. **Degrade, don't disappear.** A flaky API, missing GPU, or offline LLM narrows the answer — it never breaks it — and every fallback is surfaced as a `warning`.
4. **Honest about uncertainty.** Show ranges, label heuristics, never present an estimate as an appraisal.
5. **No financial advice, just clarity.**

## 6. Functional Requirements

### 6.1 Report generation (core)
`POST /api/v1/report` orchestrated by `report_service.build_report`:

1. **Geocode** the address (Nominatim) → lat/lon used by everything downstream.
2. **Data retrieval** — concurrent lookups against Toronto Open Data (CKAN: ~12k heritage, ~26k development records) and TRCA flood polygons. Each source **falls back to a heuristic** if the API is unreachable; fallbacks surface as `warnings`.
3. **Deterministic engine** (`report_engine.py`) owns ALL numbers: land transfer tax, property-tax projection, CMHC premium, a two-term (60+60-month) mortgage model with bull/base/bear renewal scenarios, risk loadings, and the transit dividend.
4. **GPU Monte Carlo** (`monte_carlo.py`, CuPy → NumPy fallback, 10,000 trajectories) producing P10/P50/P90 bands across **5/10/15-year horizons**.
5. **RAG land-law context** (NeMo Retriever → ChromaDB fallback) fed into synthesis.
6. **Synthesis** (`synthesis/service.py`) — sends structured engine output as JSON to the **local** Nemotron LLM, personalized with the buyer's stored profile. The LLM never produces a figure.

The same engine is mirrored in TypeScript (`frontend/lib/report.ts`) as an offline preview fallback when the backend is unreachable.

### 6.2 Conversational assistant
`POST /api/v1/chat` → `MemoryService.chat` on the local Nemotron model, optionally grounded with RAG land-law context. Durable facts are extracted from each message in the background (`remember()`). See `docs/prd-memory-chat.md` for the full spec.

### 6.3 Three-tier memory
- **Short-term:** DuckDB `chat_turns`, a rolling per-session buffer (last 10 turns).
- **Long-term structured:** DuckDB `user_profile` (single row, id=1) — name, email, phone, monthly income.
- **Long-term episodic:** ChromaDB `user_memories`, facts embedded via the local NeMo Retriever server (:8081).

Memory feeds **both** the chat assistant and the report synthesis prompt (personalized reports).

### 6.4 Buyer profile & saved reports
- `GET/PUT /api/v1/profile` — read/update the single buyer profile.
- `POST /api/v1/reports/save`, `GET /api/v1/reports`, `GET /api/v1/reports/{id}` — persist and retrieve full report payloads from DuckDB `saved_reports`.

### 6.5 Health & transparency
- `GET /api/v1/health` probes the local LLM (:8080) and embeddings (:8081) servers so the UI can show a 🟢 local / 🟡 degraded badge.
- `GET /api/v1/debug/{geocode,heritage,flood,development}?address=...` exercise individual data agents.
- `POST /api/v1/pipeline/refresh` materializes CKAN data to Parquet/DuckDB.

## 7. Non-Functional Requirements

- **Privacy / on-device (headline):** the entire LLM, embedding model, Monte Carlo simulation, vector store, and relational state run locally on the DGX Spark. No address or financial detail leaves the box; synthesis is **local-only** (the previous hosted-API fallback has been removed).
- **Graceful degradation:** every layer has a fallback (heuristic data sources, NumPy Monte Carlo, ChromaDB RAG), each surfaced honestly.
- **Latency:** DuckDB-backed spatial queries replace the prior per-request Python loop over 26k records.
- **Auditability:** all financial constants live in `backend/app/core/config.py` and `docs/frontend-parameters.md`.

## 8. Architecture (current)

```
Next.js :3000 ──/api proxy──▶ FastAPI :8000
                                   │  build_report
                                   ├─ geocode → heritage/flood/development (CKAN/TRCA, heuristic fallback)
                                   ├─ deterministic engine (authoritative numbers)
                                   ├─ GPU Monte Carlo (CuPy, 5/10/15-yr P10/P50/P90)
                                   ├─ RAG land-law (NeMo Retriever → ChromaDB)
                                   ├─ memory layer (DuckDB + ChromaDB)
                                   └─ synthesis ─▶ local Nemotron LLM
        ┌──────────────── DGX Spark — on device ────────────────┐
        │ vLLM LLM :8080 (nemotron-3-nano-30b-a3b, NVFP4 ~19GB) │
        │ NeMo Retriever embeddings :8081                       │
        │ DuckDB (meridian.duckdb)   ChromaDB (user_memories)   │
        └───────────────────────────────────────────────────────┘
```

Full diagrams in `docs/architecture.md`; phase history in `docs/gpu-pipeline-upgrade/`.

## 9. NVIDIA / DGX Spark Alignment

- **Local Nemotron** (`nemotron-3-nano-30b-a3b`, NVFP4 4-bit, served by vLLM on :8080) — targets the Nemotron bounty's emphasis on *local* inference; no hosted-API calls.
- **NeMo Retriever** embeddings for RAG grounding and episodic memory.
- **RAPIDS / CuPy** GPU Monte Carlo.
- **Spark Story:** the DGX Spark's 128 GB unified memory holds the Nemotron LLM, the NeMo Retriever embedder, the Monte Carlo buffers, and the per-user memory store **simultaneously — no model swapping** — and every user's financial profile never leaves the device.

## 10. Success Metrics

- A full report renders without crashing on flaky upstream data (every fallback exercised).
- 100% of displayed dollar figures trace to the deterministic engine.
- LLM narration and chat run entirely on-device (health badge 🟢, zero hosted calls).
- Chat assistant correctly recalls profile + prior facts across sessions.
- P10/P50/P90 range shown for every report.

## 11. Future Work

- Upgrade the local model to Nemotron Super (49B/120B FP8) as unified-memory headroom allows.
- Richer profile (risk tolerance, preferred/avoid neighborhoods) feeding synthesis.
- Multi-property comparison and saved-report diffing.
- Tighten `docs/nvidia-services.md` to the current local-only synthesis path.

## 12. Out of Scope / What We Will Not Do

- Invent, smooth, or round numbers to tell a cleaner story.
- Send an address or finances off-device without an explicit, visible fallback.
- Dress a heuristic up as ground truth.
- Give buy/sell/investment advice.
