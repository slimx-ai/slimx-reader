#!/usr/bin/env bash
# Probe SlimX-RAG readiness and print an actionable result.
# Uses READER_SLIMX_RAG_URL (default http://localhost:8080).
set -uo pipefail

URL="${READER_SLIMX_RAG_URL:-http://localhost:8080}"
echo "Checking SlimX-RAG at ${URL} …"

code="$(curl -s -o /tmp/slimx-rag-ready.$$ -w '%{http_code}' "${URL}/ready" 2>/dev/null || echo 000)"
body="$(cat /tmp/slimx-rag-ready.$$ 2>/dev/null || true)"
rm -f /tmp/slimx-rag-ready.$$

if [ "$code" = "200" ]; then
  echo "✅ SlimX-RAG is ready."
  echo "   $body"
  exit 0
fi

if [ "$code" = "000" ]; then
  cat <<EOF
❌ SlimX-RAG is not reachable at ${URL}.

Start it, then re-run this check:
   docker compose -f docker-compose.rag.yml up
   ./scripts/check-rag.sh

(You can still read and annotate documents without SlimX-RAG — indexing just parks
 as "waiting_for_rag" until the service is up.)
EOF
  exit 1
fi

echo "⚠️  SlimX-RAG responded with HTTP ${code} (not ready):"
echo "   $body"
echo "   The embedder may still be loading — wait a moment and re-run ./scripts/check-rag.sh"
exit 1
