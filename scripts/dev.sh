#!/usr/bin/env bash
# Run SlimX Reader locally: FastAPI API and the Next.js web app.
# First run bootstraps the Python venv and npm deps. Ctrl-C stops both.
#
# Ports (override if 3000/8000 are taken — e.g. another app is already running):
#   READER_WEB_PORT=3999 READER_API_PORT=8999 ./scripts/dev.sh
#
# For indexing and grounded Q&A, also start SlimX-RAG in another terminal:
#   docker compose -f docker-compose.rag.yml up
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
API_DIR="$ROOT/apps/api"
WEB_DIR="$ROOT/apps/web"

API_PORT="${READER_API_PORT:-8000}"
WEB_PORT="${READER_WEB_PORT:-3000}"
# Wire the web app to this API port and allow its origin through CORS (both used by the app below).
export NEXT_PUBLIC_API_BASE_URL="${NEXT_PUBLIC_API_BASE_URL:-http://localhost:${API_PORT}}"
export READER_CORS_ORIGINS="${READER_CORS_ORIGINS:-[\"http://localhost:${WEB_PORT}\",\"http://127.0.0.1:${WEB_PORT}\"]}"

port_busy() {
  if command -v ss >/dev/null 2>&1; then
    ss -ltn "( sport = :$1 )" 2>/dev/null | grep -q LISTEN
  elif command -v lsof >/dev/null 2>&1; then
    lsof -iTCP:"$1" -sTCP:LISTEN -t >/dev/null 2>&1
  else
    return 1
  fi
}
for p in "$API_PORT:API" "$WEB_PORT:web"; do
  port="${p%%:*}"; name="${p##*:}"
  if port_busy "$port"; then
    echo "✖ Port $port ($name) is already in use."
    echo "  Run on other ports, e.g.:  READER_WEB_PORT=3999 READER_API_PORT=8999 ./scripts/dev.sh"
    exit 1
  fi
done

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
# Ensure the local pdf.js worker is present (normally copied by the predev hook).
(cd "$WEB_DIR" && node scripts/copy-pdf-worker.mjs)

echo "==> Starting API (:${API_PORT}) and web (:${WEB_PORT})"
( cd "$API_DIR" && ./.venv/bin/uvicorn app.main:app --reload --port "$API_PORT" ) &
API_PID=$!
( cd "$WEB_DIR" && npx next dev -H 0.0.0.0 -p "$WEB_PORT" ) &
WEB_PID=$!

kill_port() {
  local pids
  pids="$(ss -ltnp "( sport = :$1 )" 2>/dev/null | grep -oE 'pid=[0-9]+' | cut -d= -f2 | sort -u)"
  [ -n "$pids" ] && kill $pids 2>/dev/null || true
}
cleanup() {
  trap - EXIT INT TERM
  echo; echo "Stopping…"
  kill "$API_PID" "$WEB_PID" 2>/dev/null || true
  # `next dev` and `uvicorn --reload` spawn children that outlive the wrapper PID; reap by port.
  kill_port "$WEB_PORT"; kill_port "$API_PORT"
}
trap cleanup EXIT INT TERM

cat <<EOF

  SlimX Reader is starting:
    • Web  →  http://localhost:${WEB_PORT}
    • API  →  http://localhost:${API_PORT}  (health: /health)

  For indexing / grounded Q&A, start SlimX-RAG:
    docker compose -f docker-compose.rag.yml up
    ./scripts/check-rag.sh

EOF

wait
