# Local models

SlimX Reader runs model calls through [SlimX](https://github.com/slimx-ai/slimx), which speaks
to providers over their HTTP APIs. Local-first means **Ollama by default**, with an
OpenAI-compatible option for other local servers, and cloud providers strictly opt-in.

## Model reference format

SlimX addresses a model as `provider:model_id`. The provider is everything before the **first**
colon, so `ollama:llama3.2:3b` means provider `ollama`, model `llama3.2:3b`.

## Ollama (default, recommended)

```bash
ollama serve
ollama pull llama3.2:3b
```

Reader defaults (`.env`):

```
READER_DEFAULT_PROVIDER=ollama
READER_DEFAULT_MODEL=llama3.2:3b
READER_OLLAMA_BASE_URL=http://localhost:11434
```

No API key required. Ollama is treated as a local endpoint.

## OpenAI-compatible local servers (vLLM, LM Studio, llama.cpp, LocalAI, Ollama `/v1`)

Use SlimX's `oai` provider with a required `base_url`:

```
READER_DEFAULT_PROVIDER=oai
READER_DEFAULT_MODEL=<your-model>
READER_OAI_BASE_URL=http://localhost:8000/v1
READER_OAI_API_KEY=EMPTY
```

## Embeddings

Embeddings are handled by **SlimX-RAG**, not the reader. The default local setup uses SlimX-RAG's
`hf` provider (Sentence-Transformers MiniLM, 384-dim), which is baked into the SlimX-RAG image and
runs fully offline — you do **not** need Ollama just to index and retrieve.

## Cloud providers (opt-in, off by default)

Cloud is disabled unless you set `READER_ALLOW_CLOUD_PROVIDERS=true` and provide keys:

```
READER_ALLOW_CLOUD_PROVIDERS=true
OPENAI_API_KEY=sk-...
ANTHROPIC_API_KEY=...
GOOGLE_API_KEY=...
```

When cloud is off, the API blocks any generation or embedding that would reach a non-local
endpoint **before** the prompt or document chunk leaves your machine. See [privacy.md](privacy.md).

## Preflight

`GET /api/models/health` reports: SlimX import/version, Ollama reachability, whether the default
model is available, SlimX-RAG readiness, and the embedding model. The UI surfaces this so you know
what's ready before you ask a question.
