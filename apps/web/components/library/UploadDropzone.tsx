'use client';

import { useCallback, useRef, useState } from 'react';
import { uploadDocument } from '../../lib/api';
import { classifyUploadError, type DocumentError } from '../../lib/documentErrors';
import type { Document } from '../../lib/types';
import { ErrorCard } from '../common/ErrorCard';
import { Spinner } from '../common/Spinner';

const ACCEPT = '.pdf,.docx,.md,.txt,.py,.ts,.tsx,.js,.jsx,.json,.yaml,.yml';

export function UploadDropzone({
  onUploaded,
  maxUploadMb,
}: {
  onUploaded: (doc: Document) => void;
  /** When known (from settings), oversized files are rejected before any bytes are sent. */
  maxUploadMb?: number | null;
}) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [busy, setBusy] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState<DocumentError | null>(null);

  const upload = useCallback(
    async (file: File) => {
      setError(null);
      if (maxUploadMb && file.size > maxUploadMb * 1024 * 1024) {
        setError({
          code: 'file_too_large',
          message: `“${file.name}” is ${(file.size / (1024 * 1024)).toFixed(1)} MB — over the ${maxUploadMb} MB upload limit.`,
          recovery: `Split the file, or raise READER_MAX_DOCUMENT_UPLOAD_MB.`,
          retryable: false,
        });
        return;
      }
      setBusy(true);
      try {
        const doc = await uploadDocument(file);
        onUploaded(doc);
      } catch (err) {
        setError(classifyUploadError(err, file.name));
      } finally {
        setBusy(false);
      }
    },
    [onUploaded, maxUploadMb],
  );

  return (
    <div>
      <div
        className={`upload-dropzone ${dragging ? 'dragging' : ''}`}
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          const file = e.dataTransfer.files?.[0];
          if (file) void upload(file);
        }}
        onClick={() => inputRef.current?.click()}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault(); // Space must not scroll the page
            inputRef.current?.click();
          }
        }}
      >
        <input
          ref={inputRef}
          type="file"
          accept={ACCEPT}
          hidden
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void upload(file);
            e.target.value = '';
          }}
        />
        {busy ? (
          <Spinner label="Uploading…" />
        ) : (
          <>
            <p className="upload-dropzone-title">Drop a document, or click to choose</p>
            <p className="muted">PDF, DOCX, Markdown, TXT, or code — everything stays on this machine.</p>
          </>
        )}
      </div>
      {error ? <ErrorCard error={error} /> : null}
    </div>
  );
}
