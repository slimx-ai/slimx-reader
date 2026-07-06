// Vitest setup: a real (in-memory) IndexedDB so the local-api round-trips run un-mocked, plus the
// two browser APIs jsdom lacks.
import 'fake-indexeddb/auto';
import { webcrypto } from 'node:crypto';

if (!globalThis.crypto?.subtle) {
  Object.defineProperty(globalThis, 'crypto', { value: webcrypto });
}
if (typeof URL.createObjectURL !== 'function') {
  URL.createObjectURL = () => `blob:vitest-${Math.random().toString(36).slice(2)}`;
  URL.revokeObjectURL = () => undefined;
}
if (typeof Blob.prototype.arrayBuffer !== 'function') {
  Blob.prototype.arrayBuffer = function arrayBuffer(this: Blob): Promise<ArrayBuffer> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as ArrayBuffer);
      reader.onerror = () => reject(reader.error);
      reader.readAsArrayBuffer(this);
    });
  };
}
