// Typed, actionable errors for opening/serving documents & PDFs.
//
// Adapted from SlimX-AI ControlRoom's lib/documentErrors.ts (MIT). Maps both API errors (backend
// `detail.code` from apps/api/app/api/document_errors.py) and in-browser pdf.js load errors to a
// stable code + human message + recovery hint, so the UI shows something the user can act on
// instead of a raw stack trace.

export type DocumentErrorCode =
  // backend (mirror apps/api/app/api/document_errors.py::ErrorCode)
  | 'file_too_large'
  | 'unsupported_type'
  | 'document_not_found'
  | 'no_extractable_text'
  | 'storage_error'
  | 'invalid_range'
  | 'rag_disabled'
  | 'rag_unavailable'
  | 'cloud_egress_blocked'
  | 'model_unavailable'
  | 'bad_request'
  // frontend-only (pdf.js / transport)
  | 'pdf_worker_failed'
  | 'pdf_password_required'
  | 'pdf_invalid'
  | 'network_failed'
  | 'timeout'
  | 'unknown';

export type DocumentError = {
  code: DocumentErrorCode;
  message: string;
  recovery?: string;
  retryable: boolean;
  status?: number;
  detail?: string;
};

type ApiLikeError = Error & { status?: number; code?: string; detail?: unknown };

function detailCode(err: ApiLikeError): string | undefined {
  if (typeof err?.code === 'string') return err.code;
  const detail = err?.detail;
  if (detail && typeof detail === 'object' && 'code' in detail) {
    const code = (detail as { code?: unknown }).code;
    if (typeof code === 'string') return code;
  }
  return undefined;
}

const RECOVERY: Partial<Record<DocumentErrorCode, string>> = {
  file_too_large: 'Open an optimized/linearized copy, or raise READER_MAX_DOCUMENT_UPLOAD_MB.',
  unsupported_type: 'Supported types: PDF, DOCX, Markdown, TXT, and code/text files.',
  document_not_found: 'The file may have been removed — go back to the library.',
  no_extractable_text: 'This may be a scanned/image-only PDF. OCR is planned (see the roadmap).',
  storage_error: 'The stored file is unavailable — retry in a moment.',
  rag_disabled: 'Enable SlimX-RAG (READER_ENABLE_RAG=true) to index and ask over documents.',
  rag_unavailable: 'Start SlimX-RAG (docker compose -f docker-compose.rag.yml up) then retry.',
  cloud_egress_blocked:
    'Cloud is disabled. Use a local model, or set READER_ALLOW_CLOUD_PROVIDERS=true to opt in.',
  model_unavailable: 'Start Ollama and pull the model, or configure a local OpenAI-compatible server.',
  pdf_worker_failed: 'Reload the page; if it persists, the PDF.js worker failed to load.',
  pdf_password_required: 'This PDF is password-protected — remove the password and re-open.',
  pdf_invalid: 'This file does not look like a valid PDF.',
  network_failed: 'Check that the SlimX Reader API is running, then retry.',
  timeout: 'The document took too long to load — retry, or open an optimized copy.',
};

const RETRYABLE: Set<DocumentErrorCode> = new Set([
  'storage_error',
  'rag_unavailable',
  'network_failed',
  'timeout',
  'pdf_worker_failed',
  'unknown',
]);

function build(
  code: DocumentErrorCode,
  message: string,
  extra?: Partial<DocumentError>,
): DocumentError {
  return {
    code,
    message,
    recovery: extra?.recovery ?? RECOVERY[code],
    retryable: extra?.retryable ?? RETRYABLE.has(code),
    status: extra?.status,
    detail: extra?.detail,
  };
}

/** Classify an error thrown while uploading/opening a document via the API client. */
export function classifyUploadError(error: unknown, filename?: string): DocumentError {
  const err = error as ApiLikeError;
  const status = typeof err?.status === 'number' ? err.status : undefined;
  const code = detailCode(err);
  const raw = err instanceof Error ? err.message : String(error ?? '');

  if (status === undefined && /failed to fetch|networkerror|load failed|fetch failed/i.test(raw)) {
    return build(
      'network_failed',
      filename
        ? `Could not upload “${filename}”. The connection dropped — often because the file is over the size limit.`
        : 'Could not reach the server while uploading. Is the SlimX Reader API running on :8000?',
      { detail: raw },
    );
  }
  if (status === 413 || code === 'file_too_large') {
    return build('file_too_large', err.message || raw, { status, detail: raw });
  }
  if (status === 415 || code === 'unsupported_type') {
    return build('unsupported_type', err.message || raw, { status, detail: raw });
  }
  if (status === 404 || code === 'document_not_found') {
    return build('document_not_found', err.message || raw, { status, detail: raw });
  }
  if (code && isKnownCode(code)) {
    return build(code, err.message || raw, { status, detail: raw });
  }
  return build('unknown', err.message || raw || 'Could not open the document.', {
    status,
    detail: raw,
  });
}

/** Classify an error thrown by pdf.js `getDocument().promise` while loading a served PDF. */
export function classifyPdfLoadError(error: unknown): DocumentError {
  const err = error as { name?: string; message?: string; status?: number };
  const name = err?.name || '';
  const raw = err?.message || String(error ?? '');
  const status = typeof err?.status === 'number' ? err.status : undefined;

  if (/PasswordException/i.test(name) || /password/i.test(raw)) {
    return build('pdf_password_required', 'This PDF is password-protected.', { detail: raw });
  }
  if (/InvalidPDFException/i.test(name) || /invalid pdf/i.test(raw)) {
    return build('pdf_invalid', 'This file could not be read as a PDF.', { detail: raw });
  }
  if (/worker/i.test(raw) && /(fail|load|import|fetch)/i.test(raw)) {
    return build('pdf_worker_failed', 'The PDF viewer could not load its worker.', { detail: raw });
  }
  if (status === 413) {
    return build('file_too_large', 'The PDF is larger than the current size limit.', {
      status,
      detail: raw,
    });
  }
  if (status === 404 || /MissingPDFException/i.test(name)) {
    return build('document_not_found', 'The document file could not be found in storage.', {
      status,
      detail: raw,
    });
  }
  if (/timeout|timed out/i.test(raw)) {
    return build('timeout', 'The PDF stream timed out while loading.', { detail: raw });
  }
  if (/failed to fetch|networkerror|load failed|fetch failed|network/i.test(raw)) {
    return build('network_failed', 'The PDF could not be fetched from the server.', { detail: raw });
  }
  return build('unknown', 'Could not display this PDF.', { detail: raw });
}

function isKnownCode(code: string): code is DocumentErrorCode {
  return (
    [
      'file_too_large',
      'unsupported_type',
      'document_not_found',
      'no_extractable_text',
      'storage_error',
      'invalid_range',
      'rag_disabled',
      'rag_unavailable',
      'cloud_egress_blocked',
      'model_unavailable',
      'bad_request',
    ] as string[]
  ).includes(code);
}

/** One-line summary for a toast/status line: message + recovery hint. */
export function describeDocumentError(error: DocumentError): string {
  return error.recovery ? `${error.message} ${error.recovery}` : error.message;
}
