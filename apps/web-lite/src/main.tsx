import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@web/app/globals.css';
import './styles/lite.css';
import { App } from './App';
import { seedSampleDocument } from './db/seed';
import { ensurePdfjs } from './pdfWorker';

async function bootstrap() {
  void ensurePdfjs();
  // Ask the browser not to evict our documents/annotations under storage pressure.
  void navigator.storage?.persist?.().catch(() => undefined);
  await seedSampleDocument();

  const root = document.getElementById('root');
  if (!root) throw new Error('Missing #root element');
  createRoot(root).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
}

void bootstrap();
