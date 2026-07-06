// Thin fetch wrapper. All backend calls go through here; components never fetch directly.

export const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL?.replace(/\/$/, '') || 'http://localhost:8200';

export class ApiError extends Error {
  status?: number;
  code?: string;
  detail?: unknown;

  constructor(message: string, opts: { status?: number; code?: string; detail?: unknown } = {}) {
    super(message);
    this.name = 'ApiError';
    this.status = opts.status;
    this.code = opts.code;
    this.detail = opts.detail;
  }
}

function extractError(status: number, payload: unknown): ApiError {
  // FastAPI puts our structured detail under `detail` ({code, message, ...}).
  const detail = (payload as { detail?: unknown })?.detail ?? payload;
  if (detail && typeof detail === 'object' && 'message' in detail) {
    const d = detail as { code?: string; message?: string };
    return new ApiError(d.message || `Request failed (${status})`, {
      status,
      code: d.code,
      detail,
    });
  }
  return new ApiError(`Request failed (${status})`, { status, detail });
}

async function parse(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

export async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      ...init,
      headers: {
        Accept: 'application/json',
        ...(init?.body && !(init.body instanceof FormData)
          ? { 'Content-Type': 'application/json' }
          : {}),
        ...init?.headers,
      },
    });
  } catch (cause) {
    throw new ApiError('Could not reach the SlimX Reader API. Is it running on :8200?', {
      code: 'network_failed',
      detail: cause instanceof Error ? cause.message : String(cause),
    });
  }
  if (!response.ok) {
    throw extractError(response.status, await parse(response));
  }
  if (response.status === 204) return undefined as T;
  return (await parse(response)) as T;
}

/** Absolute URL to a document's stored file (served with byte-range support for pdf.js). */
export function documentFileUrl(documentId: string): string {
  return `${API_BASE_URL}/api/documents/${documentId}/file`;
}
