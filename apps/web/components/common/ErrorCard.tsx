'use client';

import { useState } from 'react';
import type { DocumentError } from '../../lib/documentErrors';

/** Renders a typed DocumentError with a recovery hint, optional Retry, and collapsible details. */
export function ErrorCard({
  error,
  onRetry,
}: {
  error: DocumentError;
  onRetry?: () => void;
}) {
  const [showDetails, setShowDetails] = useState(false);
  return (
    <div className="error-card" role="alert">
      <p className="error-card-message">{error.message}</p>
      {error.recovery ? <p className="error-card-recovery muted">{error.recovery}</p> : null}
      <div className="error-card-actions">
        {error.retryable && onRetry ? (
          <button type="button" className="secondary-button" onClick={onRetry}>
            Retry
          </button>
        ) : null}
        {error.detail ? (
          <button
            type="button"
            className="text-button"
            aria-expanded={showDetails}
            onClick={() => setShowDetails((v) => !v)}
          >
            {showDetails ? 'Hide details' : 'Details'}
          </button>
        ) : null}
      </div>
      {showDetails && error.detail ? (
        <pre className="error-card-details" data-error-code={error.code}>
          {error.code}
          {error.status ? ` · HTTP ${error.status}` : ''}
          {`\n${error.detail}`}
        </pre>
      ) : null}
    </div>
  );
}
