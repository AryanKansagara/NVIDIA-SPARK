# Meridian — Documentation

Meridian computes the **true cost of ownership** for a Toronto property across 5/10/15/20-year horizons. It pulls live City of Toronto open data, runs a deterministic financial engine, simulates outcome ranges on GPU, and narrates the result with a local NVIDIA LLM. **Everything runs on a DGX Spark — no data leaves the device.**

## Quick start

```bash
# Backend
cd backend && uv run uvicorn app.main:app --reload --port 8000

# Frontend
cd frontend && npm run dev   # http://localhost:3000

# Local model servers (on DGX Spark)
cd backend
bash scripts/serve_llm.sh      # Nemotron-3 Nano 30B on :8080
bash scripts/serve_embed.sh    # NeMo Retriever embeddings on :8081
```

Data pipeline (first run, ~2 min):
```bash
curl -X POST localhost:8000/api/v1/pipeline/refresh
```

## Documents

| File | Purpose |
|------|---------|
| [architecture.md](architecture.md) | System design, request flow, Mermaid diagrams for all three major flows |
| [nvidia-services.md](nvidia-services.md) | Every NVIDIA technology used — model, serving config, GPU code paths |
| [data.md](data.md) | City of Toronto data sources, pipeline flow, DuckDB schema, fallback behaviour |
| [frontend-parameters.md](frontend-parameters.md) | Every financial constant and formula used to generate displayed numbers |
| [implementation-history.md](implementation-history.md) | How Meridian evolved across 6 implementation phases (DuckDB → GPU → Map → LLM → UI → Memory) |
| [files.md](files.md) | Full repo file map with 1–3 line purpose descriptions |

## Key properties

- **Local-only synthesis** — the LLM (`nim_local_url` :8080) and embeddings (:8081) are served on-device; no hosted API fallback exists
- **Deterministic numbers** — the financial engine (`report_engine.py`) owns all dollar figures; the LLM only narrates
- **Graceful degradation** — every data source has a heuristic fallback; reports render even when CKAN or TRCA is unreachable
- **No restart for new PDFs** — drop a PDF into `data/land_laws/` and `POST /api/v1/rag/reload`
- **Session-persistent chat** — conversation history stored in localStorage; backend memory in DuckDB + ChromaDB
