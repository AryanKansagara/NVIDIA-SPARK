#!/usr/bin/env bash
# Kill any running vLLM server and relaunch the local Nemotron LLM on :8080.
# Usage:  bash scripts/restart_llm.sh            # foreground (see logs live)
#         bash scripts/restart_llm.sh -d         # detached (logs -> /tmp/llm.log)
set -uo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PORT="${LLM_PORT:-8080}"

echo "Killing any existing vLLM on :$PORT …"
pkill -9 -f "vllm.entrypoints" 2>/dev/null || true
pkill -9 -f "EngineCore"       2>/dev/null || true
# Free the port if something is still holding it.
fuser -k "${PORT}/tcp" 2>/dev/null || true
sleep 2

if [ "${1:-}" = "-d" ]; then
  nohup bash "$HERE/scripts/serve_llm.sh" > /tmp/llm.log 2>&1 &
  echo "Started detached (pid $!). Tail logs: tail -f /tmp/llm.log"
  echo "Ready when:  curl -s localhost:$PORT/v1/models"
else
  exec bash "$HERE/scripts/serve_llm.sh"
fi
