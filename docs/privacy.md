# Privacy

SlimX Reader is local-first by design. This document describes the rules the app enforces in
code, not just aspirations.

## Rules

1. **Local-first default.** Metadata (SQLite), files (local filesystem), the vector index
   (SlimX-RAG), and models (Ollama / local) all run on your machine.
2. **No telemetry.** No analytics, no crash reporting, no phone-home.
3. **No cloud unless enabled.** Cloud providers are off unless
   `READER_ALLOW_CLOUD_PROVIDERS=true`.
4. **No accidental full-document cloud prompt.** Grounded answers send only retrieved chunks,
   not whole documents — and only when cloud is enabled.
5. **Retrieved chunks are document content.** Sending chunks to a cloud model counts as cloud
   egress and requires explicit cloud enablement.
6. **Secret redaction.** Authorization headers, API keys, and tokens are redacted from logs,
   persisted error records, and every response returned to the frontend.
7. **Careful key handling.** For v0.1, cloud keys come from environment variables. If UI-based
   secret entry is added later, keys stay local; OS keychain integration is on the roadmap.
8. **Clear status.** The UI always shows whether you are in **Local mode** ("data stays on this
   machine") or **Cloud mode** ("selected context may leave this machine").

## How egress is blocked

When `READER_ALLOW_CLOUD_PROVIDERS=false`, the API's egress gate rejects a request **before any
data is sent** if either:

- the target model/embedding **provider** classifies as cloud (openai / anthropic / google), or
- the target **base URL** is not a local/internal address (localhost, `127.0.0.1`, private-range
  IPs, or a bare single-label service name like `slimx-rag` / `ollama`).

This gate runs on both the **indexing** path (embedding egress) and the **ask** path (generation
egress). Blocked attempts return a clear, actionable error and never leak the prompt or chunk.

## What leaves your machine, and when

| Action | Local mode (default) | Cloud mode (opt-in) |
|---|---|---|
| Reading / annotating | nothing leaves | nothing leaves |
| Indexing (embeddings) | local embedder (SlimX-RAG `hf`) | may use a cloud embedder if you configure one |
| Retrieval | local vector index | local vector index |
| Grounded answer generation | local model (Ollama/oai) | selected chunks sent to the chosen cloud model |

If you enable cloud, you are responsible for the keys you configure and the data you choose to send.
