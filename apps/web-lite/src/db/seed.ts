// First-boot seed: import the bundled sample document through the normal upload path so a new
// visitor lands on a populated library with the indexing badge already animating.
import { getDb } from './db';
import { uploadDocument } from '../local-api/documents';

const SEED_KEY = 'seeded';

export async function seedSampleDocument(): Promise<void> {
  const db = await getDb();
  if (await db.get('settings', SEED_KEY)) return;
  await db.put('settings', true, SEED_KEY);
  try {
    const res = await fetch(`${import.meta.env.BASE_URL}samples/sample-notes.md`);
    if (!res.ok) return;
    const text = await res.text();
    const file = new File([text], 'sample-notes.md', { type: 'text/markdown' });
    await uploadDocument(file);
  } catch {
    // Seeding is cosmetic; an empty library is a fine fallback.
  }
}
