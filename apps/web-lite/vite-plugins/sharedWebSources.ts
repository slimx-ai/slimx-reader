// Lets web-lite reuse apps/web sources unchanged by substituting the backend-coupled modules at
// resolve time. Only two seams exist: the lib/api barrel (swapped for the IndexedDB-backed
// local-api) and `next/link` (swapped for a hash-router <a>). AskPanel is swapped for the
// streaming AskPanelLite. Everything else in apps/web resolves normally.
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Plugin } from 'vite';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const WEB = path.resolve(HERE, '../../web');
const SRC = path.resolve(HERE, '../src');

const SUBSTITUTIONS: Record<string, string> = {
  [path.join(WEB, 'lib/api/index.ts')]: path.join(SRC, 'local-api/index.ts'),
  [path.join(WEB, 'components/rag/AskPanel.tsx')]: path.join(SRC, 'components/AskPanelLite.tsx'),
};

export function sharedWebSources(): Plugin {
  return {
    name: 'shared-web-sources',
    enforce: 'pre',
    resolveId(source, importer) {
      if (source === 'next/link') return path.join(SRC, 'shims/next-link.tsx');
      if (!importer) return null;
      const importerPath = importer.split('?')[0];
      if (!importerPath.startsWith(WEB + path.sep)) return null;
      if (!source.startsWith('.')) return null;
      const base = path.resolve(path.dirname(importerPath), source);
      for (const probe of ['', '.ts', '.tsx', `${path.sep}index.ts`]) {
        const hit = SUBSTITUTIONS[base + probe];
        if (hit) return hit;
      }
      return null;
    },
  };
}
