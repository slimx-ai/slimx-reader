// In-browser equivalent of apps/api/app/services/document_extraction.py::extract_text, plus the
// per-page offset map the chunker uses for PDFs.
import type { PageSpan } from '../db/db';
import { detectSourceType } from './detect';
import { extractDocx } from './docx';
import { ExtractionError } from './errors';
import { extractPdf } from './pdf';

export { detectSourceType, isSupportedDocument } from './detect';
export { ExtractionError } from './errors';
export { extractPdf, PDF_MAX_PAGES } from './pdf';

export type Extraction = {
  sourceType: string;
  text: string;
  pages: PageSpan[] | null;
  pageCount: number | null;
};

export async function extractText(
  filename: string,
  mimeType: string | null,
  data: ArrayBuffer,
): Promise<Extraction> {
  const sourceType = detectSourceType(filename, mimeType);
  if (sourceType === 'markdown' || sourceType === 'text' || sourceType === 'code') {
    const text = new TextDecoder('utf-8', { fatal: false }).decode(data);
    return { sourceType, text, pages: null, pageCount: null };
  }
  if (sourceType === 'pdf') {
    const { text, pages, pageCount } = await extractPdf(data);
    return { sourceType, text, pages, pageCount };
  }
  if (sourceType === 'docx') {
    return { sourceType, text: extractDocx(data), pages: null, pageCount: null };
  }
  throw new ExtractionError(`Unsupported document type: ${sourceType}.`);
}
