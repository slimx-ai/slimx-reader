// PDF text extraction with pdf.js (the same engine that renders the pages). Unlike the backend's
// pypdf path this also records per-page character offsets, which page-aware chunking needs.
import { ensurePdfjs } from '../pdfWorker';
import type { PageSpan } from '../db/db';
import { ExtractionError } from './errors';

export const PDF_MAX_PAGES = 500;

export type PdfExtraction = {
  text: string;
  pages: PageSpan[];
  pageCount: number;
};

export async function extractPdf(data: ArrayBuffer): Promise<PdfExtraction> {
  const pdfjs = await ensurePdfjs();
  let doc;
  try {
    // pdf.js detaches the buffer it is given; hand it a copy so the caller's bytes stay usable.
    doc = await pdfjs.getDocument({ data: data.slice(0) }).promise;
  } catch (err) {
    throw new ExtractionError(
      `PDF text extraction failed: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
  try {
    const pageCount = doc.numPages;
    if (pageCount > PDF_MAX_PAGES) {
      throw new ExtractionError(
        `PDF has ${pageCount} pages; the maximum supported is ${PDF_MAX_PAGES}.`,
        pageCount,
      );
    }
    let text = '';
    const pages: PageSpan[] = [];
    for (let n = 1; n <= pageCount; n += 1) {
      const page = await doc.getPage(n);
      const content = await page.getTextContent();
      let pageText = '';
      for (const item of content.items) {
        if ('str' in item) {
          pageText += item.str;
          if (item.hasEOL) pageText += '\n';
        }
      }
      const start = text.length;
      text += pageText;
      pages.push({ page: n, start, end: text.length });
      if (n < pageCount) text += '\n\n'; // pages joined like pypdf's "\n\n".join(...)
    }
    return { text, pages, pageCount };
  } finally {
    await doc.destroy();
  }
}
