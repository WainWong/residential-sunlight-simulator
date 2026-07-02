import { describe, expect, it } from 'vitest';
import { APP_NAME } from '../../src/main.js';

describe('application bootstrap', () => {
  it('exports the product name', () => {
    expect(APP_NAME).toBe('日照 · 住宅采光模拟器');
  });
});
