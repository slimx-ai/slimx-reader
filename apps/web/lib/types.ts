// Shared domain types for the SlimX Reader web app.

export type AnnotationType = 'highlight' | 'comment' | 'ask_anchor' | 'ai_note';

export type PdfAnchorRect = {
  page: number;
  x: number; // 0..1 of page width
  y: number; // 0..1 of page height
  width: number; // 0..1
  height: number; // 0..1
};

export type PdfAnchor = { rects: PdfAnchorRect[] };

export type Annotation = {
  id: string;
  document_id: string;
  type: AnnotationType;
  quote: string;
  start_offset: number | null;
  end_offset: number | null;
  page: number | null;
  color: string | null;
  body: string | null;
  labels: string[];
  pdf_anchor: PdfAnchor | null;
  created_at: string;
  updated_at: string;
};

export type AnnotationCreate = {
  type: AnnotationType;
  quote: string;
  start_offset?: number | null;
  end_offset?: number | null;
  page?: number | null;
  color?: string | null;
  body?: string | null;
  labels?: string[];
  pdf_anchor?: PdfAnchor | null;
};

export type DocumentIndexingStatus =
  | 'not_indexed'
  | 'uploaded'
  | 'waiting_for_rag'
  | 'extracting'
  | 'chunking'
  | 'embedding'
  | 'indexing'
  | 'ready'
  | 'failed';

export type Document = {
  id: string;
  title: string;
  filename: string;
  mime_type: string | null;
  source_type: string | null;
  content_hash: string | null;
  file_size: number;
  page_count: number | null;
  status: string;
  indexing_status: DocumentIndexingStatus;
  rag_index_ref: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
};

export type DocumentList = {
  items: Document[];
  total: number;
  limit: number;
  offset: number;
};

export type DocumentContent = {
  document_id: string;
  source_type: string | null;
  text: string;
  available: boolean;
};

export type IndexingJob = {
  id: string;
  document_id: string;
  status: DocumentIndexingStatus | string;
  attempt: number;
  error_reason: string | null;
  chunk_count: number | null;
  embedding_provider: string | null;
  embedding_model: string | null;
  vector_backend: string | null;
  rag_index_ref: string | null;
  trace: Record<string, unknown> | null;
  elapsed_ms: number | null;
  created_at: string;
  started_at: string | null;
  finished_at: string | null;
};

export type DocumentChunk = {
  rag_chunk_id: string;
  ordinal: number;
  text: string;
  page: number | null;
  section: string | null;
  start_offset: number | null;
  end_offset: number | null;
  section_path: string[] | null;
  parent_id: string | null;
  page_type: string | null;
  token_count: number | null;
};

export type DocumentChunksResponse = {
  document_id: string;
  status: 'ready' | 'not_indexed' | 'unavailable' | string;
  chunk_count: number;
  chunks: DocumentChunk[];
};

export type RagHealth = {
  enabled: boolean;
  url_configured: boolean;
  adapter_kind: string;
  real_available: boolean;
  fallback_reason: string | null;
  service_url: string | null;
  vector_backend: string | null;
  auth_enabled: boolean | null;
};

export type ModelOption = { provider: string; model: string; ref: string };

export type ModelsHealth = {
  slimx: { available: boolean; version: string | null };
  ollama: { reachable: boolean; base_url: string; models: string[] };
  rag: {
    enabled: boolean;
    real_available: boolean;
    vector_backend: string | null;
    fallback_reason: string | null;
  };
  default_model: { ref: string; available: boolean; cloud_enabled: boolean };
};

export type RetrievedChunkView = {
  rag_chunk_id: string;
  document_id: string | null;
  rank: number;
  score: number;
  text: string;
  page: number | null;
  section: string | null;
  citation: string | null;
  metadata: Record<string, unknown>;
};

export type ContextUsed = {
  chunks_used?: number;
  top_k?: number;
  min_score?: number;
  chars_sent?: number;
  embedding_provider?: string | null;
  embedding_model?: string | null;
  vector_backend?: string | null;
  elapsed_ms?: number | null;
};

export type AskResponse = {
  run_id: string;
  status: string;
  answer: string | null;
  model_ref: string | null;
  degraded_reason: string | null;
  note: string | null;
  context_used: ContextUsed;
  chunks: RetrievedChunkView[];
};

export type AskRequest = {
  question: string;
  document_ids?: string[] | null;
  top_k?: number | null;
  min_score?: number | null;
  generate?: boolean;
};

export type NoteKind = 'note' | 'evidence' | 'summary' | 'explanation' | 'flashcard';

export type Note = {
  id: string;
  document_id: string;
  annotation_id: string | null;
  retrieval_run_id: string | null;
  kind: NoteKind | string;
  body: string;
  created_at: string;
  updated_at: string;
};

export type NoteCreate = {
  document_id: string;
  kind?: NoteKind | string;
  body: string;
  annotation_id?: string | null;
  retrieval_run_id?: string | null;
};

export type ReaderSettings = {
  enable_rag: boolean;
  slimx_rag_url: string | null;
  slimx_rag_auth_token_set: boolean;
  allow_cloud_providers: boolean;
  default_provider: string;
  default_model: string;
  ollama_base_url: string;
  oai_base_url: string | null;
  rag_default_top_k: number;
  rag_min_score: number;
  max_document_upload_mb: number;
};
