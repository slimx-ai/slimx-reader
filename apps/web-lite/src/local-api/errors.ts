// Mirror of apps/web/lib/api/http.ts's error surface. Local operations throw the same ApiError
// shape (status + code) so lib/documentErrors.ts classifies them exactly like backend responses.

export const API_BASE_URL = '';

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

/** Surface-compatibility stub: nothing in the browser build performs HTTP calls. */
export async function apiFetch<T>(path: string, _init?: RequestInit): Promise<T> {
  throw new ApiError(`The browser demo has no backend API (requested ${path}).`, {
    code: 'bad_request',
  });
}

export function notFound(what = 'Document'): ApiError {
  return new ApiError(`${what} not found.`, { status: 404, code: 'document_not_found' });
}
