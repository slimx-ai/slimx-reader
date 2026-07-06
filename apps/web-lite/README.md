# SlimX Reader Lite — 100% in the browser

A zero-install demo build of SlimX Reader: the same reader UI as `apps/web`, but with **no
backend at all**. Documents, annotations, notes, chunks, and retrieval runs live in IndexedDB;
text extraction runs on pdf.js / fflate; semantic search runs on
[Transformers.js](https://huggingface.co/docs/transformers.js) (`Xenova/all-MiniLM-L6-v2`, the
same embedder the full stack uses); grounded answers run on
[WebLLM](https://github.com/mlc-ai/web-llm) (Llama 3.2 3B or 1B, WebGPU). Nothing leaves the tab.

```bash
cd apps/web-lite
npm install
npm run dev        # http://localhost:3300
npm run build      # static site in dist/ — host anywhere
npm test           # unit tests (packing/prompt/chunking/extraction + IndexedDB round-trip)
npm run typecheck  # covers the shared apps/web sources too — catches drift
```

## How it reuses apps/web

Shared components are imported **unchanged** straight from `../web`. A ~30-line Vite plugin
(`vite-plugins/sharedWebSources.ts`) substitutes exactly three modules at resolve time:

| apps/web module | replaced by | why |
| --- | --- | --- |
| `lib/api/index.ts` | `src/local-api/index.ts` | same function signatures, backed by IndexedDB + in-browser models |
| `next/link` | `src/shims/next-link.tsx` | hash-router `<a href="#…">` (no Next runtime) |
| `components/rag/AskPanel.tsx` | `src/components/AskPanelLite.tsx` | adds token streaming + the explicit model-download flow |

Everything else — PdfViewer, selection/highlighting, comments, find, markdown rendering, the
panels — is the exact same source. If `apps/web` refactors those files, `npm run typecheck` here
fails fast.

## Model downloads (first run only, cached by the browser)

- **Embeddings** (`Xenova/all-MiniLM-L6-v2`, ~23 MB): downloads automatically the first time a
  document is indexed. Works everywhere (WASM; WebGPU when available).
- **Answers** (WebLLM): explicit opt-in from the status bar — Llama 3.2 3B (~2 GB, needs WebGPU
  and ~3 GB of GPU memory) or 1B (~880 MB). Without WebGPU, Ask degrades to retrieval-only:
  ranked passages with `[Title, p. N]` citations, no generated answer.

## Deploying the demo

`npm run build` produces a fully static `dist/`. Host it at a **root path** (Netlify, Cloudflare
Pages, Vercel static, `python -m http.server`). `public/_headers` ships COOP/COEP so hosts that
honor it get multithreaded WASM embedding; hosts that don't still work single-threaded.

## Manual verification script

1. Open the app in Chrome/Edge → the library shows the seeded `sample-notes.md`, status bar reads
   "100% in-browser".
2. Drop in a PDF → it opens instantly (blob URL, no server), thumbnails + find work, the badge
   walks `Queued → Extracting → Chunking → Embedding → Indexing → Indexed`.
3. Select text → highlight in a color, add a comment. Reload the page — everything is still
   there (IndexedDB).
4. Ask tab → ask a question. Without the LLM loaded you get retrieval-only with citations;
   click **Load** in the status bar (WebGPU required), re-ask, and the answer streams in with
   `[Title, p. N]` citations. Check "Context used" for the packing transparency.
5. DevTools → Network → "Offline" → re-ask. Everything still works: models and documents are
   local.
6. Info tab → export Markdown/JSON. Delete the document → gone from every store.

## Known limits

- No OCR (scanned/image-only PDFs upload but index as `no_extractable_text`) — same as the full
  stack.
- The 3B model needs real GPU memory; on weak hardware pick the 1B model or stay retrieval-only.
- Browser storage is origin-scoped: clearing site data deletes the library (the app requests
  `navigator.storage.persist()` to resist eviction).
