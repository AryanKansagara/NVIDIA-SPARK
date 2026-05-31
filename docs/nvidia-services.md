# NVIDIA Technologies in Meridian

This document records exactly which NVIDIA technologies the Meridian app uses, where
they live in the code, and how they behave. It is tied to the current source —
capabilities not present in the code are not claimed here.

Meridian analyzes a Toronto property's **true 10-year cost of ownership** and runs
**entirely on an NVIDIA DGX Spark (GB10 Blackwell)**. Every model — the LLM, the
embedding model, the reranker, and the speech model — is served **locally** via vLLM
on the device, and all simulation/retrieval runs on-device. **No data leaves the
machine, and there is no hosted-API fallback** (the previous cloud path has been
removed). The box has CUDA available (`nvidia-smi -L` → `NVIDIA GB10`; `nvcc` → CUDA
release 13.0).

The serving runtime for all three NVIDIA models is **vLLM** (OpenAI-compatible HTTP),
launched by the `scripts/serve_*.sh` scripts. NIM containers / the hosted NVIDIA API
are no longer part of the request path.

## At a glance

| # | NVIDIA technology | Served on | Used for |
| --- | --- | --- | --- |
| 1 | **Nemotron-3 Nano 30B-A3B (NVFP4)** LLM | vLLM `:8080` | Buyer summary + 4-agent reasoning narration + chat assistant |
| 2 | **llama-3.2-nv-embedqa-1b-v2** embedding model | vLLM `:8081` | RAG land-law embeddings + episodic chat-memory embeddings |
| 3 | **llama-3.2-nv-rerankqa-1b-v2** reranker | vLLM `:8082` | Reranking RAG candidates before grounding |
| 4 | **NVIDIA cuVS** GPU vector index | GB10 GPU | Optional GPU-accelerated RAG candidate search |
| 5 | **CuPy** | GB10 GPU | 10,000-trajectory Monte Carlo simulation |
| 6 | **RAPIDS cuDF + cuSpatial** | GB10 GPU | Haversine spatial proximity (heritage / development / comparables) |
| 7 | **NeMo Nemotron streaming ASR (0.6B)** | on-device (NeMo/Torch) | Speech-to-text for the chat microphone |
| 8 | **DGX Spark GB10 Blackwell + CUDA 13.0** | — | The hardware/runtime everything runs on |

---

## 1. NVIDIA Nemotron LLM via vLLM (local-only)

**Model:** `nemotron-3-nano-30b-a3b` — NVIDIA Nemotron-3 Nano 30B-A3B, a hybrid
Mamba + Mixture-of-Experts model in **NVFP4** (Blackwell-native 4-bit, ~19 GB on disk).
**Served by:** vLLM, OpenAI-compatible, on `:8080` (`scripts/serve_llm.sh`, loaded from
the local NVFP4 model directory `LLM_MODEL_PATH`; restart with `scripts/restart_llm.sh -d`).
**Config:** `nim_local_url` = `http://localhost:8080/v1`, `nim_model` =
`nemotron-3-nano-30b-a3b`, `nim_enabled`, `nim_timeout_seconds` (`backend/app/core/config.py`).

The deterministic scoring engine (`EngineOutput`) is the single source of truth for
every number; the LLM only **narrates** that output. It is used in two places:

### a. Report synthesis + agent reasoning — `backend/app/services/synthesis/service.py`

`SynthesisService.synthesize()` makes **one** structured chat-completion call
(`response_format={"type":"json_object"}`, `max_tokens=650`, `temperature=0.3`,
`enable_thinking=False`) and parses a JSON object with three fields:

- **`summary`** — the 3-paragraph buyer summary (verdict + Monte Carlo P10/P90 range,
  the two largest non-mortgage cost drivers, two pre-closing action steps).
- **`intake_reasoning`** — narration for **Agent 1 (Intake + Planning)**.
- **`synthesis_reasoning`** — narration for **Agent 4 (Synthesis)**: verdict +
  negotiation leverage assembled from the flags.

The system prompt enforces **"use only numbers from the input"** — all figures (true
cost, LTT, property tax, mortgage scenarios, Monte Carlo percentiles, flag leverage
ranges) are injected as a JSON `context` dict and reused verbatim. **The LLM never
invents numbers.** If the `:8080` server is unreachable or the JSON fails to parse,
`synthesize()` returns an empty result and the pipeline composes the summary and Agents
1 & 4 from deterministic fallback strings — the report still renders. Agents 2 (Data
Retrieval) and 3 (Analysis + Cost) are **always** composed deterministically from the
evidence and engine figures, never from the LLM.

### b. Conversational chat assistant — `backend/app/services/` chat path

The same local Nemotron model powers the report-grounded chat assistant, fed with RAG
land-law passages, the active report context, and on-device memory (see §3, §7).

---

## 2. NVIDIA embedding model via vLLM (NeMo Retriever family)

**Model:** `nvidia/llama-3.2-nv-embedqa-1b-v2` (NVIDIA's llama-3.2 NV-EmbedQA 1B).
**Served by:** vLLM on `:8081` (`scripts/serve_embed.sh`), OpenAI-compatible
`/embeddings`. **Config:** `embedding_local_url` = `http://localhost:8081/v1`,
`rag_embedding_model`.

Used to embed text **on-device** in two subsystems:

- **RAG land-law retrieval** (`backend/app/services/rag/service.py` → `_embed()`):
  embeds the query before searching the vector store (ChromaDB or cuVS).
- **Episodic chat memory** (`backend/app/services/memory/episodic_store.py` →
  `_embed()`): embeds extracted user facts and recall queries for the ChromaDB
  `user_memories` collection.

The legacy `nemo_retriever_*` HTTP-endpoint path still exists as config but is disabled
(`nemo_retriever_enabled=False`); embeddings go to the local `:8081` server.

---

## 3. NVIDIA reranker via vLLM + the RAG pipeline

**Model:** `nvidia/llama-3.2-nv-rerankqa-1b-v2`. **Served by:** vLLM `--task score` on
`:8082` (`scripts/serve_rerank.sh`), OpenAI-compatible `/rerank`. **Config:**
`rag_rerank_enabled`, `rerank_url`, `rerank_model`, `rag_candidate_k` (12),
`rag_n_results` (3).

The RAG pipeline (`backend/app/services/rag/service.py`) is **embed → vector search
(candidate_k) → rerank (:8082) → top n_results grounded passages**:

1. `_embed()` embeds the query via the `:8081` embedding model (§2).
2. The vector store returns `rag_candidate_k` (12) candidates — from **ChromaDB**
   (default) or **NVIDIA cuVS** (§4).
3. `_Reranker.rerank()` POSTs `{query, passages}` to the local NVIDIA reranker and
   reorders by relevance score; the top `rag_n_results` (3) become the grounded,
   source-tagged passages attached to reports and chat answers.
4. If the reranker is unreachable, the pipeline degrades gracefully to
   vector-similarity order.

New PDFs dropped into `data/land_laws/` can be re-indexed in-process via
`POST /api/v1/rag/reload`.

---

## 4. NVIDIA cuVS — GPU vector index

**Where:** `backend/app/services/rag/cuvs_store.py` (`CuvsIndex`), selected by
`vector_backend = "cuvs"` (default `chroma`). Packaged in the `.venv` as `cuvs-cu13` /
`cupy-cuda13x`.

When enabled, cuVS builds a GPU index **from the existing ChromaDB store** and serves
RAG candidate generation on the GB10: cuVS produces GPU candidates, then a CuPy
dot-product **exact-rescores** them for correct ordering and real cosine scores. On any
GPU error it **automatically falls back to ChromaDB**, which remains the persistence
layer either way (and always backs episodic chat memory).

---

## 5. GPU Monte Carlo — CuPy

**Where:** `backend/app/services/gpu/monte_carlo.py`. **Config:** `gpu_enabled`,
`monte_carlo_n_sims` (10,000).

`MonteCarloSimulator` runs 10,000 trajectories of the ownership-cost simulation across
the **5/10/15-year horizons**, vectorized over `xp` (CuPy on the GB10 when available,
else NumPy). Each trajectory models property-tax growth (with a development-density
bias), maintenance/reserve, insurance (with a flood-zone surcharge), and a rate-renewal
shock, then adds the deterministic base cost. It returns **P10/P50/P90/mean** per
horizon plus `elapsed_ms`. The 10-year P10/P90 band is what the Nemotron summary
narrates in paragraph 1 (§1).

---

## 6. GPU spatial proximity — RAPIDS cuDF + cuSpatial

**Where:** `backend/app/services/gpu/spatial.py`.

`find_within_radius()` returns rows within a radius (metres) of a query lat/lon using a
haversine distance. The GPU path (`_gpu_haversine`) uses **RAPIDS cuDF + cuSpatial**
(`cuspatial.haversine_distance`) when those libraries import on the DGX Spark;
otherwise a vectorized NumPy CPU path is used transparently. This backs the spatial
lookups used by the heritage / development data-source agents and community comparables.

---

## 7. NVIDIA NeMo — Nemotron streaming ASR (speech-to-text)

**Model:** `nemotron-speech-streaming-en-0.6b` (NVIDIA NeMo Nemotron streaming ASR).
**Where:** `backend/app/services/speech/asr_service.py`, exposed at
`POST /api/v1/transcribe`. **Config:** `asr_enabled`, `asr_model_path`.

Powers the **microphone** in the chat UI — on-device speech-to-text so spoken questions
never leave the device. The NeMo/Torch dependencies are heavy and may be absent; when
they are, `/transcribe` returns **HTTP 503** and the frontend simply hides the mic
button. Inference runs on the GB10.

---

## 8. Hardware / runtime context

The whole app runs **locally on an NVIDIA DGX Spark (GB10 Blackwell)** with CUDA 13.0:

- Three NVIDIA models (LLM `:8080`, embeddings `:8081`, reranker `:8082`) served by
  vLLM on-device.
- RAG persists in local ChromaDB; cuVS GPU search is opt-in.
- Monte Carlo (CuPy) and spatial scoring (RAPIDS cuDF + cuSpatial) run on the GB10.
- Speech-to-text runs on-device via NeMo.

The two virtualenvs are kept separate: `.venv` (app + `cuvs-cu13`/`cupy-cuda13x`) and
`.venv-serve` (vLLM model servers).

---

## Local-only execution summary

| NVIDIA capability | Local on-device path | Degradation if unavailable |
| --- | --- | --- |
| Nemotron LLM (summary, agent reasoning, chat) | vLLM `:8080` (`nemotron-3-nano-30b-a3b`, NVFP4) | Summary `None` + deterministic Agent 1/4 fallback; rest of report still renders |
| Query / memory embeddings | vLLM `:8081` (`llama-3.2-nv-embedqa-1b-v2`) | RAG/memory store skips affected items |
| RAG reranking | vLLM `:8082` (`llama-3.2-nv-rerankqa-1b-v2`) | Falls back to vector-similarity order |
| RAG vector search | cuVS GPU index (opt-in) or ChromaDB | cuVS errors fall back to ChromaDB |
| Monte Carlo simulation | CuPy on GB10 | NumPy on CPU |
| Spatial proximity scoring | RAPIDS cuDF + cuSpatial on GB10 | NumPy on CPU |
| Speech-to-text | NeMo Nemotron streaming ASR on GB10 | `/transcribe` → HTTP 503, mic hidden |

There is **no hosted NVIDIA cloud API** in the request path — every NVIDIA model is
served locally on the DGX Spark.

---

## Related docs

- [`frontend-parameters.md`](./frontend-parameters.md)
- `../CLAUDE.md` — architecture overview and commands
- `../PRD.md` — product requirements
