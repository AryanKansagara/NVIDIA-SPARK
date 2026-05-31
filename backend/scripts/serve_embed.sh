#!/usr/bin/env bash
# Serve the local Nemotron RAG embedding model (OpenAI-compatible /embeddings) on :8081.
# Used for RAG grounding + episodic chatbot memory. On-device only — no API key.
set -euo pipefail

MODEL="${RAG_EMBEDDING_MODEL:-nvidia/llama-3.2-nv-embedqa-1b-v2}"
PORT="${EMBED_PORT:-8081}"
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PY="${VLLM_PYTHON:-$HERE/.venv-serve/bin/python}"

echo "Downloading $MODEL (skips if cached)…"
# The hf CLI can raise a benign Exit traceback on success; don't let `set -e` abort here.
"$HERE/.venv/bin/hf" download "$MODEL" >/dev/null 2>&1 || true

echo "Serving embeddings $MODEL on :$PORT …"
exec "$PY" -m vllm.entrypoints.openai.api_server \
  --model "$MODEL" \
  --runner pooling \
  --port "$PORT" \
  --gpu-memory-utilization "${EMBED_GPU_MEM_UTIL:-0.15}" \
  --trust-remote-code
