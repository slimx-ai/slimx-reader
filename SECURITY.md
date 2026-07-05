# Security Policy

SlimX Reader is a local-first application. It is designed to keep your documents and reading
on your own machine.

## Reporting a vulnerability

Please report security issues **privately**. Do not open a public GitHub issue for a
vulnerability.

- Email: **security@slimx.ai**
- Or use GitHub's private "Report a vulnerability" advisory flow on this repository.

We aim to acknowledge reports within a few business days.

## Scope & design notes

- **No telemetry.** The app makes no analytics or phone-home calls.
- **Cloud is opt-in.** With `READER_ALLOW_CLOUD_PROVIDERS=false` (the default), the API blocks
  any request that would send a prompt, document chunk, or evidence to a non-local endpoint,
  before that data leaves the machine.
- **Secret redaction.** Authorization headers, API keys, and tokens are redacted from logs,
  persisted error records, and any response returned to the frontend.
- **Local network trust.** SlimX-RAG, Ollama, and any OpenAI-compatible server are treated as
  local/internal services. Point them only at endpoints you control.

If you enable cloud providers, you are responsible for the keys you configure and for the data
you choose to send to those providers.
