# Phase 4 — LLM Upgrade (Nemotron + NemoRetriever)

## Goal

Switch synthesis to Nemotron 3 Nano via NVIDIA NIM, feed the Monte Carlo distribution into the prompt context so the LLM can describe the cost range, and add an optional NemoRetriever path for RAG with ChromaDB as fallback.

## Nemotron 3 Nano

Model ID: `nvidia/nemotron-nano-4b-instruct`

The NIM endpoint is OpenAI-compatible so no new SDK is needed — only the model name changes. The model is now config-driven:

```python
# backend/app/core/config.py
nemotron_model: str = "nvidia/nemotron-nano-4b-instruct"
```

```python
# backend/app/services/synthesis/service.py
model = self.settings.nemotron_model  # was hardcoded "meta/llama-3.1-8b-instruct"
```

### Updated Prompt Context

The JSON context passed to Nemotron now includes Monte Carlo output:

```json
{
  "monte_carlo_simulation": {
    "trajectories": 10000,
    "p10": 420000,
    "p50": 510000,
    "p90": 640000,
    "mean": 515000
  }
}
```

The system prompt instructs the model to reference the range in paragraph 1:

> "Based on 10,000 simulated trajectories, the 10-year carrying cost ranges from P10 $420k to P90 $640k with a median of $510k."

## NemoRetriever

Configured via two new settings:

```python
nemo_retriever_enabled: bool = False
nemo_retriever_url: str = ""
```

When `nemo_retriever_enabled=True`, `RAGService.query()` calls the NVIDIA retrieval endpoint first. On any error (connection refused, 4xx, 5xx) it falls back silently to ChromaDB:

```python
class RAGService:
    async def query(self, text: str) -> list[str]:
        if self.settings.nemo_retriever_enabled:
            try:
                return await self._nemo.retrieve(text)
            except Exception:
                pass   # fall through to ChromaDB
        return await self._chroma.query(text)
```

The `_NemoRetriever` class sends a POST to `nemo_retriever_url` with the query string and returns a list of passage strings. ChromaDB remains the default and is always available.

## Enabling NemoRetriever

Set environment variables before starting the backend:

```bash
export NEMO_RETRIEVER_ENABLED=true
export NEMO_RETRIEVER_URL=http://your-retriever-host:8080
```

Or in `.env`:

```
NEMO_RETRIEVER_ENABLED=true
NEMO_RETRIEVER_URL=http://your-retriever-host:8080
```

## Modified Files

| File | Change |
|------|--------|
| `backend/app/core/config.py` | `nemotron_model`, `nemo_retriever_enabled`, `nemo_retriever_url` settings |
| `backend/app/services/synthesis/service.py` | Model name from config; Monte Carlo context in prompt; P10/P90 referenced in system prompt |
| `backend/app/services/rag/service.py` | `_NemoRetriever` class; NemoRetriever-first with ChromaDB fallback |
