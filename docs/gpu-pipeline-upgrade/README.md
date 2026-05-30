# GPU Pipeline Upgrade — Overview

This folder documents the full upgrade applied to Meridian after the initial MVP, covering four implementation phases:

| Phase | Topic | Doc |
|-------|-------|-----|
| 1 | DuckDB Data Pipeline | [01-duckdb-pipeline.md](01-duckdb-pipeline.md) |
| 2 | GPU Acceleration (RAPIDS + CuPy Monte Carlo) | [02-gpu-acceleration.md](02-gpu-acceleration.md) |
| 3 | Interactive Leaflet Map | [03-leaflet-map.md](03-leaflet-map.md) |
| 4 | LLM Upgrade (Nemotron + NemoRetriever) | [04-llm-upgrade.md](04-llm-upgrade.md) |
| — | Frontend Changes | [05-frontend-changes.md](05-frontend-changes.md) |

## Why This Upgrade Existed

The original MVP fetched 12k heritage and 26k development records from CKAN into Python memory on every cold start, then iterated them with a Python `for` loop on every report request. Problems:

- **Stale data** — no refresh without a restart
- **Slow** — ~200ms haversine loop over 26k dicts per request
- **No uncertainty** — single deterministic cost number, no range
- **Placeholder map** — a CSS gradient instead of real geography
- **Oversized LLM** — Llama 3.1 8B with no P10/P50/P90 context

The upgrade addresses every one of these issues while keeping full CPU fallback paths so the app runs on any machine.

## Running the Pipeline

After starting the backend, trigger a one-time data load:

```bash
curl -X POST http://localhost:8000/api/v1/pipeline/refresh
```

This fetches live CKAN data, writes Parquet files to `backend/data/parquet/`, and populates DuckDB. Subsequent report calls use the database instead of the Python in-memory lists.
