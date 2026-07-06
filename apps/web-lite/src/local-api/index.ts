// Substituted for apps/web/lib/api/index.ts by the sharedWebSources Vite plugin. The export
// surface must stay a superset of that barrel so shared components compile and run unchanged.
export { API_BASE_URL, ApiError, apiFetch } from './errors';
export { documentFileUrl } from './fileUrls';
export {
  deleteDocument,
  getDocument,
  getDocumentContent,
  listDocuments,
  uploadDocument,
} from './documents';
export {
  createAnnotation,
  deleteAnnotation,
  listAnnotations,
  updateAnnotation,
} from './annotations';
export { getSettings, updateSettings } from './settings';
export {
  askOverDocuments,
  askOverDocumentsStreaming,
  getIndexingJob,
  indexDocument,
  listDocumentChunks,
} from './rag';
export { createNote, deleteNote, listNotes, updateNote } from './notes';
export { exportJson, exportMarkdown } from './export';
