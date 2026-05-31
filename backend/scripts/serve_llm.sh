#!/usr/bin/env bash
# Serve the single local Nemotron LLM (OpenAI-compatible) on :8080 via vLLM.
# On-device only — no hosted API, no API key. GB10 DGX Spark.
#
# Default: Nemotron-3 Nano 30B-A3B (hybrid Mamba+MoE), NVFP4 — Blackwell-native
# 4-bit, ~19 GB resident, fits with room for the embedder + Monte-Carlo buffers.
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PY="${VLLM_PYTHON:-$HERE/.venv-serve/bin/python}"
# vLLM JIT-compiles the Mamba/hybrid kernels with ninja — ensure it's on PATH.
export PATH="$(dirname "$PY"):$PATH"
PORT="${LLM_PORT:-8080}"
SERVED_NAME="${NIM_MODEL:-nemotron-3-nano-30b-a3b}"

# Prefer a local model directory (no download); else a HF repo id.
MODEL="${LLM_MODEL_PATH:-/home/asus/Desktop/NVIDIA_SPARK_HACK/nvidia--NVIDIA-Nemotron-3-Nano-30B-A3B-NVFP4}"
if [ ! -d "$MODEL" ]; then
  MODEL="${NIM_MODEL:-nvidia/NVIDIA-Nemotron-Nano-12B-v2}"
  echo "Local path not found — downloading $MODEL …"
  "$HERE/.venv/bin/hf" download "$MODEL" >/dev/null
fi

echo "Serving $MODEL as '$SERVED_NAME' on :$PORT …"
exec "$PY" -m vllm.entrypoints.openai.api_server \
  --model "$MODEL" \
  --served-model-name "$SERVED_NAME" \
  --port "$PORT" \
  --gpu-memory-utilization "${GPU_MEM_UTIL:-0.55}" \
  --max-model-len "${MAX_MODEL_LEN:-8192}" \
  --trust-remote-code
