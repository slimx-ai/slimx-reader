import { expect, test } from '@playwright/test';
import path from 'node:path';

// End-to-end happy path. Requires the web app (:3000) and API (:8000) running; RAG-dependent
// steps are skipped when SlimX-RAG is not available. Non-blocking in CI.
const SAMPLE = path.resolve(__dirname, '../../../examples/documents/sample-notes.md');

test('upload, open, highlight, and persist across reload', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'SlimX Reader' })).toBeVisible();

  // Upload the sample markdown via the (hidden) file input.
  await page.setInputFiles('input[type="file"]', SAMPLE);

  // It appears in the library; open it.
  const item = page.getByText('sample-notes.md').first();
  await expect(item).toBeVisible();
  await item.click();

  // The reader renders the document text.
  await expect(page.getByText(/384-dimensional/)).toBeVisible();

  // Select the "384" token in the markdown and raise the selection toolbar.
  await page.evaluate(() => {
    const container = document.querySelector('[data-annotate="markdown"]');
    if (!container) return;
    const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT);
    let node: Node | null;
    while ((node = walker.nextNode())) {
      const idx = node.textContent?.indexOf('384') ?? -1;
      if (idx >= 0) {
        const range = document.createRange();
        range.setStart(node, idx);
        range.setEnd(node, idx + 3);
        const sel = window.getSelection();
        sel?.removeAllRanges();
        sel?.addRange(range);
        document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
        break;
      }
    }
  });

  await page.getByRole('button', { name: 'Highlight' }).click();

  // The highlight is painted…
  await expect(page.locator('mark.annotation-highlight')).toHaveCount(1);

  // …and survives a reload (persisted server-side).
  await page.reload();
  await expect(page.getByText(/384-dimensional/)).toBeVisible();
  await expect(page.locator('mark.annotation-highlight')).toHaveCount(1);
});

test('shows the reader panel tabs', async ({ page }) => {
  await page.goto('/');
  await page.setInputFiles('input[type="file"]', SAMPLE);
  await page.getByText('sample-notes.md').first().click();
  for (const tab of ['Annotations', 'Ask', 'Chunks', 'Notes', 'Info']) {
    await expect(page.getByRole('tab', { name: tab })).toBeVisible();
  }
});
