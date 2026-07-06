import { DocumentReader } from '@web/components/reader/DocumentReader';
import { LibraryView } from '@web/components/library/LibraryView';
import { ModelStatusBar } from './components/ModelStatusBar';
import { useHashRoute } from './router';

export function App() {
  const route = useHashRoute();
  return (
    <>
      <ModelStatusBar />
      {route.name === 'reader' ? (
        <DocumentReader key={route.documentId} documentId={route.documentId} />
      ) : (
        <main className="page">
          <LibraryView />
        </main>
      )}
    </>
  );
}
