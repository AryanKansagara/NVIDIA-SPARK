#!/usr/bin/env bash
# Serve the local NVIDIA reranker (OpenAI-compatible /rerank) on :8082 via vLLM.
# Used to reorder RAG candidate passages by relevance before grounding the answer.
# On-device only — no API key. GB10 DGX Spark.
set -euo pipefail

MODEL="${RERANK_MODEL:-nvidia/llama-3.2-nv-rerankqa-1b-v2}"
PORT="${RERANK_PORT:-8082}"
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PY="${VLLM_PYTHON:-$HERE/.venv-serve/bin/python}"

echo "Downloading $MODEL (skips if cached)…"
"$HERE/.venv/bin/hf" download "$MODEL" >/dev/null

echo "Serving reranker $MODEL on :$PORT …"
exec "$PY" -m vllm.entrypoints.openai.api_server \
  --model "$MODEL" \
  --runner pooling \
  --convert classify \
  --port "$PORT" \
  --gpu-memory-utilization "${RERANK_GPU_MEM_UTIL:-0.12}" \
  --trust-remote-code
