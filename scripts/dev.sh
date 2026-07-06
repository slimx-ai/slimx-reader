#!/usr/bin/env bash
# Run SlimX Reader locally: FastAPI API and the Next.js web app.
# First run bootstraps the Python venv and npm deps. Ctrl-C stops both.
#
# Ports (override if 3200/8200 are taken — e.g. another app is already running):
#   READER_WEB_PORT=3999 READER_API_PORT=8999 ./scripts/dev.sh
#
# For indexing and grounded Q&A, also start SlimX-RAG in another terminal:
#   docker compose -f docker-compose.rag.yml up
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
API_DIR="$ROOT/apps/api"
WEB_DIR="$ROOT/apps/web"

# Load the repo-root .env (if present) so everything there — ports, model settings, RAG URL, cloud
# opt-in — takes effect for BOTH the API and the web app. Values already set in your shell win.
if [ -f "$ROOT/.env" ]; then
  set -a
  # shellcheck disable=SC1090,SC1091
  . "$ROOT/.env"
  set +a
fi

API_PORT="${READER_API_PORT:-8200}"
WEB_PORT="${READER_WEB_PORT:-3200}"
# Wire the web app to this API port and allow its origin through CORS (both used by the app below).
export NEXT_PUBLIC_API_BASE_URL="${NEXT_PUBLIC_API_BASE_URL:-http://localhost:${API_PORT}}"
export READER_CORS_ORIGINS="${READER_CORS_ORIGINS:-[\"http://localhost:${WEB_PORT}\",\"http://127.0.0.1:${WEB_PORT}\"]}"
# Keep all runtime data in the repo-root data/ dir (gitignored) regardless of the API's cwd.
export READER_DATA_DIR="${READER_DATA_DIR:-$ROOT/data}"

port_busy() {
  if command -v ss >/dev/null 2>&1; then
    ss -ltn "( sport = :$1 )" 2>/dev/null | grep -q LISTEN
  elif command -v lsof >/dev/null 2>&1; then
    lsof -iTCP:"$1" -sTCP:LISTEN -t >/dev/null 2>&1
  else
    return 1
  fi
}
# A busy port is fine when it's OUR healthy service (e.g. the web app survived but the API died —
# re-running dev.sh then just restarts the missing half). A foreign occupant still aborts.
is_our_api() {
  command -v curl >/dev/null 2>&1 || return 1
  curl -sf -m 2 "http://localhost:$1/health" 2>/dev/null | grep -q "slimx-reader-api"
}
is_our_web() {
  command -v curl >/dev/null 2>&1 || return 1
  curl -sf -m 2 "http://localhost:$1/" 2>/dev/null | grep -qi "SlimX Reader"
}

START_API=1
START_WEB=1
if port_busy "$API_PORT"; then
  if is_our_api "$API_PORT"; then
    echo "==> API already running on :$API_PORT — leaving it alone."
    START_API=0
  else
    echo "✖ Port $API_PORT (API) is in use by something else."
    echo "  Run on other ports, e.g.:  READER_WEB_PORT=3999 READER_API_PORT=8999 ./scripts/dev.sh"
    exit 1
  fi
fi
if port_busy "$WEB_PORT"; then
  if is_our_web "$WEB_PORT"; then
    echo "==> Web already running on :$WEB_PORT — leaving it alone."
    START_WEB=0
  else
    echo "✖ Port $WEB_PORT (web) is in use by something else."
    echo "  Run on other ports, e.g.:  READER_WEB_PORT=3999 READER_API_PORT=8999 ./scripts/dev.sh"
    exit 1
  fi
fi
if [ "$START_API" = 0 ] && [ "$START_WEB" = 0 ]; then
  echo "SlimX Reader is already fully running (web :${WEB_PORT}, API :${API_PORT}). Nothing to do."
  exit 0
fi

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

echo "==> Starting$([ "$START_API" = 1 ] && echo " API (:${API_PORT})")$([ "$START_WEB" = 1 ] && echo " web (:${WEB_PORT})")"
API_PID=""
WEB_PID=""
if [ "$START_API" = 1 ]; then
  ( cd "$API_DIR" && ./.venv/bin/uvicorn app.main:app --reload --port "$API_PORT" ) &
  API_PID=$!
fi
if [ "$START_WEB" = 1 ]; then
  ( cd "$WEB_DIR" && npx next dev -H 0.0.0.0 -p "$WEB_PORT" ) &
  WEB_PID=$!
fi

kill_port() {
  local pids
  pids="$(ss -ltnp "( sport = :$1 )" 2>/dev/null | grep -oE 'pid=[0-9]+' | cut -d= -f2 | sort -u)"
  [ -n "$pids" ] && kill $pids 2>/dev/null || true
}
cleanup() {
  trap - EXIT INT TERM
  echo; echo "Stopping…"
  # Only stop what THIS run started — a pre-existing healthy service stays up.
  # (`next dev` / `uvicorn --reload` spawn children that outlive the wrapper PID; reap by port.)
  if [ -n "$API_PID" ]; then kill "$API_PID" 2>/dev/null || true; kill_port "$API_PORT"; fi
  if [ -n "$WEB_PID" ]; then kill "$WEB_PID" 2>/dev/null || true; kill_port "$WEB_PORT"; fi
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
