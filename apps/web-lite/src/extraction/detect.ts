// Port of detect_source_type / is_supported_document from
// apps/api/app/services/document_extraction.py — keep the two in sync.

const TEXT_TYPES = new Set(['text/plain', 'text/markdown', 'application/json']);
const PDF_TYPES = new Set(['application/pdf']);
const DOCX_TYPES = new Set([
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
]);
const ALLOWED_MIME_TYPES = new Set([
  ...TEXT_TYPES,
  ...PDF_TYPES,
  ...DOCX_TYPES,
  'application/x-yaml',
  'text/x-python',
  'application/javascript',
  'text/javascript',
  'text/typescript',
]);
const CODE_EXTENSIONS = [
  '.py',
  '.ts',
  '.tsx',
  '.js',
  '.jsx',
  '.md',
  '.txt',
  '.json',
  '.yaml',
  '.yml',
];

export function detectSourceType(filename: string, mimeType: string | null): string {
  const lower = filename.toLowerCase();
  if (lower.endsWith('.pdf') || mimeType === 'application/pdf') return 'pdf';
  if (lower.endsWith('.docx') || (mimeType !== null && DOCX_TYPES.has(mimeType))) return 'docx';
  if (lower.endsWith('.md')) return 'markdown';
  if (CODE_EXTENSIONS.some((ext) => lower.endsWith(ext))) {
    return lower.endsWith('.md') || lower.endsWith('.txt') ? 'text' : 'code';
  }
  return mimeType !== null && TEXT_TYPES.has(mimeType) ? 'text' : 'code';
}

export function isSupportedDocument(filename: string, mimeType: string | null): boolean {
  const lower = filename.toLowerCase();
  if (mimeType !== null && ALLOWED_MIME_TYPES.has(mimeType)) return true;
  return (
    lower.endsWith('.pdf') ||
    lower.endsWith('.docx') ||
    CODE_EXTENSIONS.some((ext) => lower.endsWith(ext))
  );
}
