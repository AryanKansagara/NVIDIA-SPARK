# Meridian Tech Stack

## Proposed Stack

### Frontend

- Next.js
- TypeScript
- Tailwind CSS
- `shadcn/ui`
- Mapbox or Leaflet
- Recharts

### Backend API

- Python 3.11
- FastAPI
- Pydantic
- `httpx`
- `python-dotenv`

### Data And GIS

- Pandas
- NumPy
- GeoPandas
- Shapely
- PyProj
- GeoJSON
- CSV
- Parquet

### LLM Layer On ASUS GX10

- NVIDIA Nemotron model
- Ollama or vLLM
- OpenAI-compatible local API endpoint
- `.env` integration

Example environment variables:

```env
LLM_BASE_URL=http://gx10-tailnet-ip:8000/v1
LLM_MODEL=nemotron-model-name
```

### Infra And DevOps

- GitHub monorepo
- Docker Compose
- GitHub Actions
- Tailscale
- ASUS GX10 as local inference server

## Recommended Architecture

```text
Next.js Frontend
      ↓
FastAPI Backend
      ↓
Deterministic Cost + Risk Engine
      ↓
Structured JSON
      ↓
GX10 Nemotron LLM API
      ↓
Buyer-friendly Summary
```

## What Looks Good

This stack is directionally right for a hackathon:

- Next.js gives you a stronger demo surface than Streamlit if you want something investor-ready
- FastAPI is the correct backend choice for typed JSON contracts and async data retrieval
- GeoPandas and Shapely are the right tools for heritage, flood, and radius checks
- OpenAI-compatible model serving is the right abstraction because it keeps the app portable

## Suggestions And Corrections

### 1. Treat The LLM Serving Layer As An Interface, Not A Product Commitment

Keep your app code dependent on:

- `LLM_BASE_URL`
- `LLM_MODEL`
- OpenAI-compatible chat calls

Do not hardwire the backend to one serving engine.

Recommendation:

- default path: `vLLM` or NVIDIA NIM if the team wants the cleanest OpenAI-compatible serving layer
- fallback path: Ollama if setup speed matters more than absolute performance tuning

Reason:

- this keeps the frontend and backend unchanged if you switch models or serving runtimes mid-hackathon

### 2. Add A Thin Service Boundary Inside The Backend

Do not let FastAPI routes directly hold business logic.

Recommended backend split:

- `api/` for routes
- `schemas/` for Pydantic models
- `services/data_sources/` for Toronto and TRCA fetchers
- `services/engine/` for deterministic cost logic
- `services/llm/` for model calls
- `core/` for config and shared utilities

This matters because Agent 3 will get complicated quickly once mortgage scenarios are added.

### 3. Prefer Parquet For Cached Working Data

Your format list is good, but operationally:

- fetch as CSV, GeoJSON, SHP, or ZIP from source
- normalize once
- cache locally as Parquet where possible

Reason:

- faster reloads
- smaller local working set
- easier repeatable demo startup

### 4. Pick One Map Library Early

Both are fine, but do not carry both.

Recommendation:

- Leaflet if cost and fast setup matter more
- Mapbox if the team wants a more polished visual demo and can tolerate token setup

For the MVP, Leaflet is the lower-risk choice.

### 5. Recharts Is Fine, But Keep Charts Minimal

Only chart things that increase buyer understanding:

- 10-year total cost composition
- mortgage base/bear/bull scenario comparison
- transit dividend versus car-dependent baseline

Do not overbuild dashboard visuals.

### 6. Add One Small Queue Boundary In Your Mental Model

Even if you do not implement an actual queue, separate:

- synchronous request path for deterministic calculations
- optional async enrichment path for heavier data refresh or caching jobs

That avoids tying startup and inference latency to dataset refresh behavior.

### 7. Keep Tailscale For Ops, Not App Logic

Using Tailscale to reach the GX10 is sensible.

But the app should only know:

- `LLM_BASE_URL`

It should not know or care whether that URL is localhost, LAN, or Tailscale.

## Recommended Default Choice For The Hackathon

If the team wants the safest path:

- frontend: Next.js + TypeScript + Tailwind + `shadcn/ui` + Leaflet + Recharts
- backend: FastAPI + Pydantic + `httpx`
- spatial engine: GeoPandas + Shapely + PyProj
- cache format: Parquet
- LLM serving: OpenAI-compatible endpoint backed by NVIDIA NIM or vLLM
- fallback serving: Ollama

## Main Product Rule

No matter which model stack you pick, the architectural rule stays the same:

- deterministic code computes the numbers
- the LLM explains the numbers

That separation is more important than the exact model name.
