#!/usr/bin/env bash
# Run SlimX Reader locally: FastAPI API on :8000 and the Next.js web app on :3000.
# First run bootstraps the Python venv and npm deps. Ctrl-C stops both.
#
# For indexing and grounded Q&A, also start SlimX-RAG in another terminal:
#   docker compose -f docker-compose.rag.yml up
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
API_DIR="$ROOT/apps/api"
WEB_DIR="$ROOT/apps/web"

echo "==> Preparing backend (apps/api)"
if [ ! -d "$API_DIR/.venv" ]; then
  python3 -m venv "$API_DIR/.venv"
  "$API_DIR/.venv/bin/pip" install -q --upgrade pip
  "$API_DIR/.venv/bin/pip" install -q -e "$API_DIR[dev]"
fi

echo "==> Preparing frontend (apps/web)"
if [ ! -d "$WEB_DIR/node_modules" ]; then
  (cd "$WEB_DIR" && npm install)
fi

echo "==> Starting API (:8000) and web (:3000)"
( cd "$API_DIR" && ./.venv/bin/uvicorn app.main:app --reload --port 8000 ) &
API_PID=$!
( cd "$WEB_DIR" && npm run dev ) &
WEB_PID=$!

trap 'echo; echo "Stopping…"; kill "$API_PID" "$WEB_PID" 2>/dev/null || true' EXIT INT TERM

cat <<'EOF'

  SlimX Reader is starting:
    • Web  →  http://localhost:3000
    • API  →  http://localhost:8000  (health: /health)

  For indexing / grounded Q&A, start SlimX-RAG:
    docker compose -f docker-compose.rag.yml up
    ./scripts/check-rag.sh

EOF

wait
