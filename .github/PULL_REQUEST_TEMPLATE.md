## Summary

<!-- What does this change and why? -->

## Changes

-

## How I verified

<!-- Commands run, manual steps, screenshots. -->

- [ ] `apps/api`: `ruff check . && ruff format --check . && mypy && python -m pytest -q`
- [ ] `apps/web`: `npm run typecheck && npm run lint && npm run test`
- [ ] Verified the behavior end-to-end (not just tests)

## Checklist

- [ ] Stays local-first (no new default cloud calls, no telemetry)
- [ ] Respects the SlimX / SlimX-RAG layering (no reimplemented RAG or provider plumbing)
- [ ] No secrets in logs, errors, or frontend responses
- [ ] Tests added/updated for new behavior
- [ ] Docs updated if behavior changed
