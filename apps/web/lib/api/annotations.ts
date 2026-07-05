import type { Annotation, AnnotationCreate } from '../types';
import { apiFetch } from './http';

export async function listAnnotations(documentId: string): Promise<Annotation[]> {
  return apiFetch<Annotation[]>(`/api/documents/${documentId}/annotations`);
}

export async function createAnnotation(
  documentId: string,
  payload: AnnotationCreate,
): Promise<Annotation> {
  return apiFetch<Annotation>(`/api/documents/${documentId}/annotations`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function updateAnnotation(
  annotationId: string,
  payload: Partial<AnnotationCreate>,
): Promise<Annotation> {
  return apiFetch<Annotation>(`/api/annotations/${annotationId}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });
}

export async function deleteAnnotation(annotationId: string): Promise<void> {
  await apiFetch<void>(`/api/annotations/${annotationId}`, { method: 'DELETE' });
}
