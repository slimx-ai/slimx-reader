// Point pdf.js at the locally served worker before any consumer loads a document. PdfViewer only
// assigns workerSrc when unset, so setting it here (with the deploy base path) wins everywhere —
// including the in-browser text extraction path.
export async function ensurePdfjs(): Promise<typeof import('pdfjs-dist')> {
  const pdfjs = await import('pdfjs-dist');
  if (!pdfjs.GlobalWorkerOptions.workerSrc) {
    pdfjs.GlobalWorkerOptions.workerSrc = `${import.meta.env.BASE_URL}pdf.worker.min.mjs`;
  }
  return pdfjs;
}
