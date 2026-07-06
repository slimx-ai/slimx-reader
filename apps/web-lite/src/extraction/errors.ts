/** Extraction failed for a reason worth surfacing. `pageCount` is carried when the PDF was
 * readable enough to count pages even though text extraction was refused (e.g. page cap). */
export class ExtractionError extends Error {
  pageCount: number | null;

  constructor(message: string, pageCount: number | null = null) {
    super(message);
    this.name = 'ExtractionError';
    this.pageCount = pageCount;
  }
}
