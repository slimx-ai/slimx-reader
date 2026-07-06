import { strToU8, zipSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import { detectSourceType, isSupportedDocument } from './detect';
import { extractDocx } from './docx';

describe('detectSourceType', () => {
  it('mirrors the backend mapping', () => {
    expect(detectSourceType('paper.pdf', null)).toBe('pdf');
    expect(detectSourceType('paper', 'application/pdf')).toBe('pdf');
    expect(detectSourceType('notes.docx', null)).toBe('docx');
    expect(detectSourceType('readme.md', null)).toBe('markdown');
    expect(detectSourceType('notes.txt', null)).toBe('text');
    expect(detectSourceType('script.py', null)).toBe('code');
    expect(detectSourceType('data.json', null)).toBe('code');
    expect(detectSourceType('plain', 'text/plain')).toBe('text');
  });
});

describe('isSupportedDocument', () => {
  it('accepts supported extensions and mime types, rejects others', () => {
    expect(isSupportedDocument('a.pdf', null)).toBe(true);
    expect(isSupportedDocument('a.docx', null)).toBe(true);
    expect(isSupportedDocument('a.ts', null)).toBe(true);
    expect(isSupportedDocument('anything', 'text/markdown')).toBe(true);
    expect(isSupportedDocument('image.png', 'image/png')).toBe(false);
  });
});

describe('extractDocx', () => {
  const W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';

  function docxWith(bodyXml: string): ArrayBuffer {
    const xml =
      `<?xml version="1.0" encoding="UTF-8"?>` +
      `<w:document xmlns:w="${W}"><w:body>${bodyXml}</w:body></w:document>`;
    const zipped = zipSync({ 'word/document.xml': strToU8(xml) });
    return zipped.buffer.slice(zipped.byteOffset, zipped.byteOffset + zipped.byteLength);
  }

  it('joins non-empty paragraphs with blank lines', () => {
    const data = docxWith(
      '<w:p><w:r><w:t>Hello</w:t><w:t> world</w:t></w:r></w:p>' +
        '<w:p><w:r><w:t>  </w:t></w:r></w:p>' +
        '<w:p><w:r><w:t>Second paragraph</w:t></w:r></w:p>',
    );
    expect(extractDocx(data)).toBe('Hello world\n\nSecond paragraph');
  });

  it('rejects non-zip data', () => {
    expect(() => extractDocx(new TextEncoder().encode('not a zip').buffer as ArrayBuffer)).toThrow(
      /invalid DOCX/,
    );
  });
});
