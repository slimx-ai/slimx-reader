import path from 'node:path';
import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';
import { sharedWebSources } from './vite-plugins/sharedWebSources';

const HERE = path.dirname(fileURLToPath(import.meta.url));

// COOP/COEP enable multithreaded WASM for Transformers.js in dev/preview. Static hosts need the
// equivalent headers (see public/_headers); without them embedding falls back to single-thread.
const isolationHeaders = {
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Embedder-Policy': 'credentialless',
};

export default defineConfig({
  plugins: [sharedWebSources(), react()],
  resolve: {
    alias: { '@web': path.resolve(HERE, '../web') },
    // Shared apps/web sources must NOT resolve these from apps/web/node_modules — a second React
    // instance breaks hooks, and a second pdfjs-dist would ignore the workerSrc set at boot.
    dedupe: ['react', 'react-dom', 'pdfjs-dist', 'marked', 'dompurify'],
  },
  server: {
    headers: isolationHeaders,
    fs: { allow: [path.resolve(HERE, '../..')] },
  },
  preview: { headers: isolationHeaders },
  optimizeDeps: {
    // Both ship WASM/worker assets that break under esbuild pre-bundling.
    exclude: ['@huggingface/transformers', '@mlc-ai/web-llm'],
  },
  build: {
    target: 'es2022',
    rollupOptions: {
      onwarn(warning, warn) {
        // apps/web components carry Next.js 'use client' directives; harmless in a plain SPA.
        if (warning.code === 'MODULE_LEVEL_DIRECTIVE') return;
        warn(warning);
      },
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test-setup.ts'],
  },
});
