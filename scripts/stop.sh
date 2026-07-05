#!/usr/bin/env bash
# Stop the local dev processes (web :3000, api :8000) and the SlimX-RAG compose stack.
set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

for port in "${READER_WEB_PORT:-3000}" "${READER_API_PORT:-8000}"; do
  pids="$(lsof -ti tcp:"$port" 2>/dev/null || true)"
  if [ -n "$pids" ]; then
    echo "Stopping process on :$port"
    kill $pids 2>/dev/null || true
  fi
done

if command -v docker >/dev/null 2>&1; then
  echo "Stopping SlimX-RAG compose stack (if running)"
  docker compose -f "$ROOT/docker-compose.rag.yml" down 2>/dev/null || true
fi

echo "Done."
