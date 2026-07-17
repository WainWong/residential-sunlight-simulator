import { describe, expect, it } from 'vitest';
import { SLAB_THICKNESS } from '../../src/domain/buildings/segmentBuilding.js';
import {
  BUILDING_LID,
  BUILDING_SEGMENT,
  FLOOR_LINES,
  ROOM_WALL,
  SEGMENT_EDGES,
  bandThreshold,
  eachEdge,
  isBuildingShell,
  isFloorLines,
  isLidOrAbove,
  isRoomGeometry,
  isSegment
} from '../../src/scene/sceneTags.js';

const mesh = (kind, extra = {}) => ({ userData: { kind, ...extra }, children: [] });

describe('sceneTags predicates', () => {
  it('isSegment matches only wall segments', () => {
    expect(isSegment(mesh(BUILDING_SEGMENT))).toBe(true);
    expect(isSegment(mesh(BUILDING_LID))).toBe(false);
    expect(isSegment(mesh(FLOOR_LINES))).toBe(false);
  });

  it('isBuildingShell matches segments and lids', () => {
    expect(isBuildingShell(mesh(BUILDING_SEGMENT))).toBe(true);
    expect(isBuildingShell(mesh(BUILDING_LID))).toBe(true);
    expect(isBuildingShell(mesh(ROOM_WALL))).toBe(false);
  });

  it('isFloorLines / isRoomGeometry classify their groups', () => {
    expect(isFloorLines(mesh(FLOOR_LINES))).toBe(true);
    expect(isRoomGeometry(mesh(ROOM_WALL))).toBe(true);
    expect(isRoomGeometry(mesh(BUILDING_SEGMENT))).toBe(false);
  });

  it('bandThreshold subtracts slab thickness and a small epsilon', () => {
    expect(bandThreshold(10)).toBeCloseTo(10 - SLAB_THICKNESS - 0.01);
  });

  it('isLidOrAbove flags shells at or above the band, keeps those below', () => {
    const bandToY = 6;
    // A lid sits at bandToY - SLAB (its fromY), which is above the threshold.
    expect(isLidOrAbove(mesh(BUILDING_LID, { fromY: bandToY - SLAB_THICKNESS }), bandToY)).toBe(true);
    // An upper-floor segment starts at bandToY → above.
    expect(isLidOrAbove(mesh(BUILDING_SEGMENT, { fromY: bandToY }), bandToY)).toBe(true);
    // The observation-floor wall starts below the band → kept (not a lid).
    expect(isLidOrAbove(mesh(BUILDING_SEGMENT, { fromY: bandToY - 3 }), bandToY)).toBe(false);
  });

  it('eachEdge visits only segment-edges children', () => {
    const seen = [];
    const parent = {
      userData: { kind: BUILDING_SEGMENT },
      children: [
        mesh(SEGMENT_EDGES, { id: 'a' }),
        mesh('something-else', { id: 'b' }),
        mesh(SEGMENT_EDGES, { id: 'c' })
      ]
    };
    eachEdge(parent, child => seen.push(child.userData.id));
    expect(seen).toEqual(['a', 'c']);
  });
});
