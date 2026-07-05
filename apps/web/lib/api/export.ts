import { API_BASE_URL } from './http';

function triggerDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

async function download(path: string, documentId: string, fallback: string): Promise<void> {
  const res = await fetch(`${API_BASE_URL}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ document_id: documentId }),
  });
  if (!res.ok) throw new Error(`Export failed (${res.status})`);
  const blob = await res.blob();
  const cd = res.headers.get('Content-Disposition') || '';
  const name = /filename="([^"]+)"/.exec(cd)?.[1] || fallback;
  triggerDownload(blob, name);
}

export async function exportMarkdown(documentId: string): Promise<void> {
  await download('/api/export/markdown', documentId, 'export.md');
}

export async function exportJson(documentId: string): Promise<void> {
  await download('/api/export/json', documentId, 'export.json');
}
