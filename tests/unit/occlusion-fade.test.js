import { describe, it, expect } from 'vitest';
import { createFadeState } from '../../src/scene/occlusionFade.js';

describe('occlusionFade', () => {
  it('eases opacity down toward fadeIn while occluding', () => {
    const { update } = createFadeState({ fadeIn: 0.15, restore: 0.85, step: 0.2 });
    let o = 0.85;
    o = update(o, true); expect(o).toBeCloseTo(0.65);
    o = update(o, true); expect(o).toBeCloseTo(0.45);
    for (let i = 0; i < 10; i++) o = update(o, true);
    expect(o).toBeCloseTo(0.15);
  });

  it('eases opacity up toward restore when not occluding', () => {
    const { update } = createFadeState({ fadeIn: 0.15, restore: 0.85, step: 0.2 });
    let o = 0.15;
    o = update(o, false); expect(o).toBeCloseTo(0.35);
    for (let i = 0; i < 10; i++) o = update(o, false);
    expect(o).toBeCloseTo(0.85);
  });
});
