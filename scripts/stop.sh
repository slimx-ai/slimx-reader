#!/usr/bin/env bash
# Stop the local dev processes (web :3200, api :8200) and the SlimX-RAG compose stack.
set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

# Read the same ports dev.sh used (from .env, unless already set in the shell).
if [ -f "$ROOT/.env" ]; then
  set -a
  # shellcheck disable=SC1090,SC1091
  . "$ROOT/.env"
  set +a
fi

for port in "${READER_WEB_PORT:-3200}" "${READER_API_PORT:-8200}"; do
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
