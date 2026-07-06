import { defineConfig, devices } from '@playwright/test';

// E2E runs against a locally running web app (and API). It is non-blocking in CI; the specs
// guard RAG-dependent steps so they skip cleanly when SlimX-RAG is not up. See docs/testing.
export default defineConfig({
  testDir: './e2e',
  timeout: 30_000,
  fullyParallel: false,
  retries: 0,
  reporter: [['list']],
  use: {
    baseURL: process.env.READER_WEB_URL || 'http://localhost:3200',
    trace: 'on-first-retry',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
