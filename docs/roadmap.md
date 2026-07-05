# Roadmap

## v0.1 (current)

A professional, local-first reader with grounded Q&A:

- Open/upload PDF, DOCX, Markdown, TXT, code.
- Professional PDF viewing: zoom, page nav, search, long-PDF virtualization, local PDF.js worker.
- Highlight, comment, ask, copy — annotations persist across reloads.
- Index with SlimX-RAG; visible indexing status and chunk inspector.
- Ask over one or more documents; grounded answers with page/section citations and a
  "context used" panel.
- Save chunks/answers as evidence/notes; export notes/annotations/citations to Markdown/JSON.
- Ollama/local by default; cloud opt-in and off by default.

### Known limitations

- OCR for scanned/image-only PDFs is **not** included (they surface a clear message, never a
  fabricated answer).
- Annotations are app-level overlays; writing them back into the PDF is future work.
- Cloud models are optional and disabled by default.
- No multi-user/team mode; no agents, MCP, or web search.

## v0.2

- OCR for scanned PDFs.
- Real PDF annotation export (write highlights/comments into the PDF).
- Flashcards + summary/study mode.
- Collection-level Q&A (ask across a small local library).

## v0.3

- Figure/table understanding.
- VLM question over a selected page region.
- Zotero export/import.
- Obsidian / Markdown vault export.

## v0.4

- Desktop packaging (Tauri or Electron).
- Plugin API.
- Optional agents for reading plans.
- Multi-document literature-review mode.
