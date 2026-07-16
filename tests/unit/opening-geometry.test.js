import { describe, expect, it } from 'vitest';
import {
  createOpeningFromPreset,
  openingFitsWall,
  reprojectOpening
} from '../../src/domain/openings/openingGeometry.js';

const wall = { id: 'wall:1:a', floor: 1, length: 5, roomIds: ['r1'], start: [0, 0], end: [5, 0] };

describe('opening geometry', () => {
  it('creates glass and open presets with explicit bounds', () => {
    expect(createOpeningFromPreset({ wall, preset: 'window', centerU: 0.5 })).toMatchObject({
      connectedRoomIds: ['r1'], fill: 'glass', preset: 'window', status: 'valid',
      bounds: { centerU: 0.5, width: 1.8, bottom: 0.9, top: 2.1 }
    });
    expect(createOpeningFromPreset({ wall, preset: 'doorway', centerU: 0.5 }).fill).toBe('open');
  });

  it('checks horizontal and vertical fit', () => {
    const opening = createOpeningFromPreset({ wall, preset: 'window', centerU: 0.1 });
    expect(openingFitsWall(opening, wall, 3)).toBe(false);
  });

  it('keeps relative position on a changed wall or marks it invalid', () => {
    const opening = createOpeningFromPreset({ wall, preset: 'window', centerU: 0.7 });
    expect(reprojectOpening(opening, { ...wall, length: 4 }, 3)).toMatchObject({ status: 'valid' });
    expect(reprojectOpening(opening, { ...wall, length: 1 }, 3)).toMatchObject({ status: 'invalid' });
  });
});
