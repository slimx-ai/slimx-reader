'use client';

import { useEffect } from 'react';

/**
 * A small transient error banner for action failures (delete/save/export) that shouldn't take over
 * the page the way ErrorCard does. Auto-dismisses; the user can also dismiss it.
 */
export function ErrorToast({ message, onDismiss }: { message: string; onDismiss: () => void }) {
  useEffect(() => {
    const timer = window.setTimeout(onDismiss, 6000);
    return () => window.clearTimeout(timer);
  }, [message, onDismiss]);

  return (
    <div className="error-toast" role="alert">
      <span className="error-toast-message">{message}</span>
      <button type="button" className="text-button" onClick={onDismiss} aria-label="Dismiss error">
        ✕
      </button>
    </div>
  );
}
