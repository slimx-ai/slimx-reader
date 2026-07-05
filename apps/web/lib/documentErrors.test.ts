import { describe, expect, it } from 'vitest';
import { ApiError } from './api/http';
import { classifyPdfLoadError, classifyUploadError, describeDocumentError } from './documentErrors';

describe('classifyPdfLoadError', () => {
  it('detects a password-protected PDF', () => {
    const e = classifyPdfLoadError({ name: 'PasswordException', message: 'No password given' });
    expect(e.code).toBe('pdf_password_required');
  });

  it('detects an invalid PDF', () => {
    const e = classifyPdfLoadError({ name: 'InvalidPDFException', message: 'bad header' });
    expect(e.code).toBe('pdf_invalid');
  });

  it('detects a failed worker load', () => {
    const e = classifyPdfLoadError({ message: 'Failed to load worker script' });
    expect(e.code).toBe('pdf_worker_failed');
    expect(e.retryable).toBe(true);
  });

  it('maps a 404 to document_not_found', () => {
    const e = classifyPdfLoadError({ message: 'nope', status: 404 });
    expect(e.code).toBe('document_not_found');
  });

  it('falls back to unknown', () => {
    const e = classifyPdfLoadError(new Error('weird'));
    expect(e.code).toBe('unknown');
  });
});

describe('classifyUploadError', () => {
  it('flags a dropped fetch as a likely-size network failure', () => {
    const e = classifyUploadError(new TypeError('Failed to fetch'), 'big.pdf');
    expect(e.code).toBe('network_failed');
    expect(e.message).toContain('big.pdf');
  });

  it('maps a 413 to file_too_large', () => {
    const e = classifyUploadError(new ApiError('too big', { status: 413, code: 'file_too_large' }));
    expect(e.code).toBe('file_too_large');
  });

  it('maps a 415 to unsupported_type', () => {
    const e = classifyUploadError(
      new ApiError('nope', { status: 415, code: 'unsupported_type' }),
    );
    expect(e.code).toBe('unsupported_type');
  });

  it('describeDocumentError appends the recovery hint', () => {
    const e = classifyUploadError(new ApiError('too big', { status: 413, code: 'file_too_large' }));
    expect(describeDocumentError(e)).toContain(e.message);
    expect(describeDocumentError(e).length).toBeGreaterThan(e.message.length);
  });
});
