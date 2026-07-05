// Copy the pdf.js worker into public/ so it is served locally (no CDN). Runs on predev/prebuild.
// The worker must exactly match the installed pdfjs-dist major version.
import { mkdirSync, copyFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
mkdirSync('public', { recursive: true });
const src = require.resolve('pdfjs-dist/build/pdf.worker.min.mjs');
copyFileSync(src, 'public/pdf.worker.min.mjs');
console.log('Copied pdf.worker.min.mjs -> public/');
