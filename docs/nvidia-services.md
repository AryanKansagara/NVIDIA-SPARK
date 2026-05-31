# NVIDIA Technologies in Meridian

This document records exactly which NVIDIA technologies and services the Meridian
app uses, where they live in the code, and how they behave. It is tied to the
current source — capabilities not present in the code are not claimed here. Where
the code and older planning notes disagree (e.g. `docs/gpu-pipeline-upgrade/04-llm-upgrade.md`),
this doc reflects what the code actually does.

Meridian analyzes a Toronto property's **true 10-year cost of ownership** and runs
locally on an **NVIDIA DGX Spark (GB10 Blackwell)**. All inference, retrieval, and
simulation default to on-device paths so no data needs to leave the machine. The
hosted NVIDIA cloud API is only ever a fallback. The box has CUDA available
(verified: `nvidia-smi -L` → `NVIDIA GB10`; `nvcc` → CUDA release 13.0).

The NVIDIA building blocks are:

1. NVIDIA Nemotron LLM served via NIM (3-paragraph buyer summary)
2. NVIDIA NIM (Inference Microservices) container runtime
3. NVIDIA NeMo Retriever (optional RAG) + NVIDIA embedding model
4. GPU acceleration on the GB10 via CuPy / RAPIDS (Monte Carlo + spatial)
5. The DGX Spark hardware/runtime context

---

## 1. NVIDIA Nemotron LLM via NIM

**Model:** `nvidia/nemotron-nano-12b-v2-vl`
**Where:** `backend/app/services/synthesis/service.py`
**API:** OpenAI-compatible chat completions (`POST {base_url}/chat/completions`).

The deterministic scoring engine (`EngineOutput`) is the single source of truth
for every number. The LLM's only job is to **narrate** that output into a concise
**3-paragraph buyer summary**:

- Paragraph 1 (verdict): true 10-year cost, % above list price, top risk flag, and
  the Monte Carlo P10/P90 range ("Across 10,000 simulations, outcomes range from
  $P10 to $P90") when simulation data is present.
- Paragraph 2 (cost drivers): the two largest costs beyond the mortgage, in plain
  English, using the exact dollar figures provided.
- Paragraph 3 (action): two concrete pre-closing steps, referencing any land-law
  excerpts supplied.

The system prompt (`_SYSTEM_PROMPT`) explicitly states: **"use only numbers from
the input."** All figures (10-year cost, land transfer tax, property tax,
mortgage scenarios, Monte Carlo P10/P50/P90/mean, flood/heritage/development flags)
are injected as a JSON `context` dict by `_call_nim()` and the model reuses them
verbatim. **The LLM never invents numbers — it only narrates.** Request
parameters: `max_tokens=450`, `temperature=0.3`, `stream=False`.

### Default vs. fallback routing (`SynthesisService.synthesize` → `_call_nim`)

1. If `nim_enabled` is false → `synthesize()` returns `None` (no LLM call; the API
   layer falls back to its non-LLM output).
2. **Default = LOCAL NIM container.** `_call_nim` first POSTs to
   `nim_local_url` (`http://localhost:8080/v1`) `/chat/completions` with no API
   key — this is the NIM container running on the DGX Spark.
3. **Fallback = hosted NVIDIA API.** If the local call raises (e.g. container not
   running), it falls through to `nim_base_url`
   (`https://integrate.api.nvidia.com/v1`), adding an
   `Authorization: Bearer {nim_api_key}` header when `nim_api_key` is set.
4. If the hosted call also raises, the exception propagates up to `synthesize()`,
   which logs it and returns `None`.

Note: the local-vs-hosted preference is **unconditional in code** (local is always
tried first) — there is no separate "prefer local" config flag. The request body
uses `nim_model` as the `model` field.

### Config keys (`backend/app/core/config.py`)

| Key | Default | Purpose |
| --- | --- | --- |
| `nim_enabled` | `True` | Master switch for LLM narration; if false, `synthesize()` returns `None`. |
| `nim_local_url` | `http://localhost:8080/v1` | Local NIM container endpoint (the default/preferred path). |
| `nim_base_url` | `https://integrate.api.nvidia.com/v1` | Hosted NVIDIA API endpoint (fallback). |
| `nim_api_key` | `""` | Bearer token for the hosted NVIDIA API (only used on the fallback path). |
| `nim_model` | `nvidia/nemotron-nano-12b-v2-vl` | Model name sent in the chat-completions request body. |
| `nemotron_model` | `nvidia/nemotron-nano-12b-v2-vl` | Declared Nemotron model identifier (mirrors `nim_model`; not referenced by the current `_call_nim`). |
| `nim_timeout_seconds` | `60.0` | HTTP timeout (seconds) for NIM calls; also reused by the RAG client. |

---

## 2. NVIDIA NIM (NVIDIA Inference Microservices)

NIM is the OpenAI-compatible container runtime that serves the Nemotron model
**locally on the DGX Spark**. Because both the container and the hosted NVIDIA API
are OpenAI-compatible, the same `_call_nim()` client code works against either —
only the base URL and auth differ.

### Running the NIM container

```bash
docker login nvcr.io        # requires an NGC key with NIM container entitlement
docker run --gpus all -p 8080:8000 <nim-image>
```

This maps the app's expected local port `8080` to the container's internal NIM
port `8000`, matching `nim_local_url` (`http://localhost:8080/v1`).

### Known caveat (current machine)

On this machine, pulling the 12B NIM image returns **`DENIED: Payment Required`**:
the configured `nvcr.io` credentials lack NIM container entitlement. As a result,
**the app currently runs via the hosted-API fallback** — the same model
(`nvidia/nemotron-nano-12b-v2-vl`) served from `integrate.api.nvidia.com`.

No code change is required to switch back to local: `_call_nim` always tries the
local container on `:8080` first, so once an entitled NIM image is running there
the app auto-prefers it and only falls back to the hosted API on failure.

---

## 3. NVIDIA NeMo Retriever (optional RAG) + NVIDIA embeddings

**Where:** `backend/app/services/rag/service.py`

The RAG layer retrieves Toronto land-law excerpts that get attached to the buyer
summary. It has two NVIDIA touchpoints:

**NeMo Retriever (primary, optional).** The `_NemoRetriever` class POSTs
`{query, top_k}` to `nemo_retriever_url` and parses passages from
`{"passages": [...]}` or `{"results": [...]}`. It is constructed only when
`nemo_retriever_enabled` is true.

**ChromaDB fallback (always available).** `RAGService.query()`:

- Calls NeMo Retriever first when enabled.
- **Falls back to local ChromaDB** (`_chroma_query`) when NeMo Retriever is
  disabled **or** if the NeMo call raises (a warning is logged). ChromaDB is a
  `PersistentClient` over the `land_laws` collection (cosine space) at
  `rag_vector_store_path`.

**NVIDIA embedding model.** The ChromaDB path embeds the query via
`_embed()`, which POSTs to `{nim_base_url}/embeddings` with model
`rag_embedding_model` = `nvidia/llama-3.2-nv-embedqa-1b-v2` (NVIDIA's
llama-3.2 NV EmbedQA 1B). So even the local fallback retrieval path uses an NVIDIA
embedding model (currently via the hosted NVIDIA API base URL).

### Config keys (`backend/app/core/config.py`)

| Key | Default | Purpose |
| --- | --- | --- |
| `rag_enabled` | `True` | Master switch for the RAG layer. |
| `nemo_retriever_enabled` | `False` | Enables the NeMo Retriever path; when false, ChromaDB is used. |
| `nemo_retriever_url` | `""` | NeMo Retriever endpoint (must be set to enable the path). |
| `rag_embedding_model` | `nvidia/llama-3.2-nv-embedqa-1b-v2` | NVIDIA embedding model used for ChromaDB query embeddings. |
| `rag_vector_store_path` | `data/vector_store` | On-disk path for the local ChromaDB store. |
| `rag_n_results` | `3` | Default number of passages to retrieve. |

Note: the NeMo Retriever and embedding HTTP clients reuse `nim_timeout_seconds`.

---

## 4. GPU acceleration on the NVIDIA GB10 (DGX Spark)

GPU work runs on the GB10 Blackwell GPU with a transparent CPU fallback. Each
module attempts to import its GPU library at module load; on `ImportError` it logs
a warning and uses NumPy/pandas instead.

### `backend/app/services/gpu/monte_carlo.py` — CuPy

`MonteCarloSimulator._simulate()` runs `monte_carlo_n_sims` (default **10,000**)
trajectories of a 10-year ownership-cost simulation, vectorized over the array
backend `xp` (CuPy on GPU when `_GPU` and `gpu_enabled`, else NumPy). It models,
per trajectory: property-tax growth (with development-density upward bias),
maintenance/reserve, insurance (with a flood-zone surcharge), and a year-5
interest-rate renewal shock, then adds the deterministic base cost. It returns
**P10/P50/P90 (and mean)** of the total 10-year cost plus an `elapsed_ms` timing.
This P10/P90 band is exactly what the Nemotron summary narrates in paragraph 1
(see §1). GPU import: `import cupy as cp`; results are copied back to host with
`total.get()` before percentiles are taken with NumPy.

### `backend/app/services/gpu/spatial.py` — RAPIDS (cuDF + cuSpatial)

`find_within_radius()` returns the candidate rows (POIs / comparables) within a
given radius (metres) of a query lat/lon using a haversine distance. The GPU path
(`_gpu_haversine`) uses **RAPIDS cuDF + cuSpatial** (`cuspatial.haversine_distance`)
when those libraries import successfully on the DGX Spark; otherwise the
vectorized NumPy CPU path (`_numpy_haversine`) is used transparently. Note this
returns all points within the radius (a mask), not a fixed k-nearest set.

### Config keys (`backend/app/core/config.py`)

| Key | Default | Purpose |
| --- | --- | --- |
| `gpu_enabled` | `True` | Enables GPU execution for Monte Carlo; when false (or CuPy unavailable), uses NumPy. |
| `monte_carlo_n_sims` | `10_000` | Number of Monte Carlo trajectories. |

CUDA is available on this box (GPU `NVIDIA GB10`, CUDA 13.0), so the GPU paths run
natively when the GPU libraries (CuPy / RAPIDS) are installed.

---

## 5. Hardware / runtime context

The whole app is designed to run **locally on an NVIDIA DGX Spark (GB10
Blackwell)**:

- LLM narration tries a local NIM container on the device first.
- RAG defaults to local ChromaDB (NeMo Retriever, when enabled, is a separate
  retrieval endpoint).
- Monte Carlo simulation and spatial scoring run on the on-device GB10 via
  CUDA (CuPy / RAPIDS cuDF + cuSpatial).

No data needs to leave the device for simulation or local retrieval. The hosted
NVIDIA cloud API (`integrate.api.nvidia.com`) is used as a fallback for LLM
narration and is also the configured base URL for query embeddings.

---

## Local-first vs. cloud-fallback summary

| NVIDIA capability | Default / local path | Fallback |
| --- | --- | --- |
| Nemotron LLM narration | Local NIM container on DGX Spark (`nim_local_url`, `http://localhost:8080/v1`) | Hosted NVIDIA API (`nim_base_url`, `nim_api_key`); then `None` (no LLM summary) if that also fails. **Currently the active path** — local NIM image blocked by `DENIED: Payment Required`. |
| NIM runtime | NIM container (`docker run --gpus all -p 8080:8000`) on the GB10 | Hosted NVIDIA API serving the same model |
| RAG retrieval | NeMo Retriever (`nemo_retriever_url`) when `nemo_retriever_enabled` | Local ChromaDB (`rag_vector_store_path`, `land_laws` collection) |
| Query embeddings | NVIDIA `llama-3.2-nv-embedqa-1b-v2` via `{nim_base_url}/embeddings` | (none — embeddings always go to `nim_base_url`) |
| Monte Carlo simulation | CuPy on the GB10 GPU | NumPy on CPU |
| Spatial proximity scoring | RAPIDS cuDF + cuSpatial on the GB10 GPU | NumPy on CPU |

---

## Related docs

- [`frontend-parameters.md`](./frontend-parameters.md)
- [`gpu-pipeline-upgrade/README.md`](./gpu-pipeline-upgrade/README.md)
