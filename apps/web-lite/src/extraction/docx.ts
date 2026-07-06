// Port of _extract_docx_text from apps/api/app/services/document_extraction.py:
// unzip -> word/document.xml -> collect w:p paragraph text -> join with blank lines.
import { unzipSync, strFromU8 } from 'fflate';
import { ExtractionError } from './errors';

const DOCX_MAX_XML_BYTES = 50 * 1024 * 1024;
const W_NS = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';

export function extractDocx(data: ArrayBuffer): string {
  let entries: Record<string, Uint8Array>;
  try {
    entries = unzipSync(new Uint8Array(data));
  } catch {
    throw new ExtractionError('DOCX text extraction failed: invalid DOCX file.');
  }
  const documentXml = entries['word/document.xml'];
  if (!documentXml) {
    throw new ExtractionError('DOCX text extraction failed: invalid DOCX file.');
  }
  if (documentXml.length > DOCX_MAX_XML_BYTES) {
    throw new ExtractionError('DOCX text extraction failed: document XML is too large.');
  }

  const parsed = new DOMParser().parseFromString(strFromU8(documentXml), 'application/xml');
  if (parsed.getElementsByTagName('parsererror').length > 0) {
    throw new ExtractionError('DOCX text extraction failed: malformed document XML.');
  }

  const paragraphs: string[] = [];
  const paragraphNodes = parsed.getElementsByTagNameNS(W_NS, 'p');
  for (let i = 0; i < paragraphNodes.length; i += 1) {
    const textNodes = paragraphNodes[i].getElementsByTagNameNS(W_NS, 't');
    let text = '';
    for (let j = 0; j < textNodes.length; j += 1) text += textNodes[j].textContent ?? '';
    if (text.trim()) paragraphs.push(text);
  }
  return paragraphs.join('\n\n');
}
