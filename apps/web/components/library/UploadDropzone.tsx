'use client';

import { useCallback, useRef, useState } from 'react';
import { uploadDocument } from '../../lib/api';
import { classifyUploadError, type DocumentError } from '../../lib/documentErrors';
import type { Document } from '../../lib/types';
import { ErrorCard } from '../common/ErrorCard';
import { Spinner } from '../common/Spinner';

const ACCEPT = '.pdf,.docx,.md,.txt,.py,.ts,.tsx,.js,.jsx,.json,.yaml,.yml';

export function UploadDropzone({ onUploaded }: { onUploaded: (doc: Document) => void }) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [busy, setBusy] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState<DocumentError | null>(null);

  const upload = useCallback(
    async (file: File) => {
      setBusy(true);
      setError(null);
      try {
        const doc = await uploadDocument(file);
        onUploaded(doc);
      } catch (err) {
        setError(classifyUploadError(err, file.name));
      } finally {
        setBusy(false);
      }
    },
    [onUploaded],
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
          if (e.key === 'Enter' || e.key === ' ') inputRef.current?.click();
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
