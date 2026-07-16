import { describe, expect, it } from 'vitest';
import { selectedBuildingId } from '../../src/scene/sceneSelection.js';

describe('selectedBuildingId', () => {
  it('highlights the selected building without a separate preview mode', () => {
    expect(selectedBuildingId({ selection: { kind: 'building', id: 'b1' } })).toBe('b1');
  });
  it('highlights the owning building for a nested selection', () => {
    expect(selectedBuildingId({ selection: { kind: 'room', id: 'r1', buildingId: 'b1' } }))
      .toBe('b1');
    expect(selectedBuildingId({ selection: { kind: 'opening', id: 'o1', buildingId: 'b1' } }))
      .toBe('b1');
  });
  it('does not highlight when nothing is selected', () => {
    expect(selectedBuildingId({ selection: null })).toBeNull();
  });
});
