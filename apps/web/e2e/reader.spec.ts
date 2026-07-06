import { expect, test } from '@playwright/test';
import path from 'node:path';

// End-to-end happy path. Requires the web app (:3200) and API (:8200) running; RAG-dependent
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

  // The toolbar offers a color palette; pick yellow.
  await page.getByRole('button', { name: 'Highlight Yellow' }).click();

  // The highlight is painted…
  await expect(page.locator('mark.annotation-highlight')).toHaveCount(1);

  // …and survives a reload (persisted server-side).
  await page.reload();
  await expect(page.getByText(/384-dimensional/)).toBeVisible();
  await expect(page.locator('mark.annotation-highlight')).toHaveCount(1);
});

test('shows the reader panel tabs with Ask as the default', async ({ page }) => {
  await page.goto('/');
  await page.setInputFiles('input[type="file"]', SAMPLE);
  await page.getByText('sample-notes.md').first().click();
  // The annotations panel was removed; Ask is now the default tab.
  await expect(page.getByRole('tab', { name: 'Annotations' })).toHaveCount(0);
  for (const tab of ['Ask', 'Chunks', 'Notes', 'Info']) {
    await expect(page.getByRole('tab', { name: tab })).toBeVisible();
  }
  await expect(page.getByRole('tab', { name: 'Ask' })).toHaveAttribute('aria-selected', 'true');
});

test('add a comment via the inline composer and persist it', async ({ page }) => {
  await page.goto('/');
  await page.setInputFiles('input[type="file"]', SAMPLE);
  await page.getByText('sample-notes.md').first().click();
  await expect(page.getByText(/384-dimensional/)).toBeVisible();

  // Select the "passages" token and raise the selection toolbar (mirrors the highlight test).
  await page.evaluate(() => {
    const container = document.querySelector('[data-annotate="markdown"]');
    if (!container) return;
    const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT);
    let node: Node | null;
    while ((node = walker.nextNode())) {
      const idx = node.textContent?.indexOf('passages') ?? -1;
      if (idx >= 0) {
        const range = document.createRange();
        range.setStart(node, idx);
        range.setEnd(node, idx + 'passages'.length);
        const sel = window.getSelection();
        sel?.removeAllRanges();
        sel?.addRange(range);
        document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
        break;
      }
    }
  });

  // Comment / Ask opens the native in-app composer (no browser prompt); save as a Comment.
  await page.getByRole('button', { name: 'Comment / Ask' }).click();
  const composer = page.locator('.comment-composer textarea');
  await expect(composer).toBeVisible();
  await composer.fill('a floating note');
  await page.locator('.comment-composer button.btn-comment').click();

  // The comment shows as a gutter pin next to the text…
  await expect(page.locator('.comment-pin')).toHaveCount(1);
  // …clicking the pin expands its card with the saved body…
  await page.locator('.comment-pin').first().click();
  await expect(page.locator('.comment-card')).toContainText('a floating note');
  // …and it survives a reload (persisted server-side).
  await page.reload();
  await expect(page.getByText(/384-dimensional/)).toBeVisible();
  await expect(page.locator('.comment-pin')).toHaveCount(1);
});
