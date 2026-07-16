import { describe, expect, it } from 'vitest';
import { build } from 'vite';

const CHUNK_BUDGET_BYTES = 650 * 1024;

describe('production build output', () => {
  it('keeps lazy-loaded JavaScript chunks within the build budget', async () => {
    const result = await build({
      logLevel: 'silent',
      build: { write: false }
    });
    const chunks = result.output.filter(item => item.type === 'chunk');
    const oversized = chunks
      .filter(chunk => Buffer.byteLength(chunk.code) > CHUNK_BUDGET_BYTES)
      .map(chunk => ({ fileName: chunk.fileName, bytes: Buffer.byteLength(chunk.code) }));

    expect(chunks.some(chunk => chunk.isDynamicEntry && chunk.name === 'createSceneController')).toBe(true);
    expect(oversized).toEqual([]);
  }, 30_000);
});
