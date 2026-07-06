# Contributing to SlimX Reader

Thanks for your interest! SlimX Reader aims to be a calm, professional, local-first reading
environment. Contributions of all sizes are welcome.

## Ground rules

- **Local-first & privacy.** No telemetry. No new outbound network calls without an explicit,
  documented opt-in. Cloud providers stay disabled by default.
- **Respect the layering.** The reader owns UX + local persistence. **SlimX-RAG** owns
  parsing/chunking/embedding/indexing/retrieval/citations; **SlimX** owns model execution.
  Do not reimplement RAG or provider plumbing inside the reader — go through the `RagAdapter`
  boundary (`apps/api/app/services/rag/`) and the model client.
- **Small, focused changes.** Don't mix a layout refactor with a behavior fix.
- **Never leak secrets.** API keys and tokens must be redacted from logs, errors, and
  frontend responses.

## Development setup

```bash
# Backend
cd apps/api && python -m venv .venv && . .venv/bin/activate
pip install -e '.[dev]'
ruff check . && ruff format --check . && mypy && python -m pytest -q

# Frontend
cd apps/web && npm install
npm run typecheck && npm run lint && npm run test
```

### End-to-end tests

Playwright e2e is a live-stack integration test, so it is **not** part of push CI. Run it against a
running stack (start it, then point Playwright at it):

```bash
./scripts/dev.sh                        # start API + web (see port note below)
npx playwright install chromium         # first time only
cd apps/web && npm run e2e
```

If ports 3200/8200 are already in use, run the app on other ports and tell Playwright where it is:

```bash
READER_WEB_PORT=3999 READER_API_PORT=8999 ./scripts/dev.sh
READER_WEB_URL=http://localhost:3999 npm run e2e   # from apps/web
```

## Pull requests

1. Fork and branch from `main` (`feat/...`, `fix/...`, `docs/...`).
2. Keep the backend and frontend checks green (CI runs them on every PR).
3. Add tests for new behavior. Describe how you verified the change end-to-end.
4. Fill in the PR template.

## Reporting bugs / requesting features

Use the issue templates. For security issues, see [SECURITY.md](SECURITY.md) — please do
**not** open a public issue for vulnerabilities.

## Good first issues

Look for the `good first issue` label. Docs, tests, empty/error states, and small UI polish
are great places to start.
