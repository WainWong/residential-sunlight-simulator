import { describe, expect, it } from 'vitest';
import { buildAnalysisOverlays } from '../../src/scene/analysisOverlays.js';

const project = {
  buildings: [{
    id: 'b1', template: 'bar', rotation: 0, position: { x: 0, z: 0 },
    params: { length: 60, depth: 18, floors: 3, floorHeight: 3 },
    observationAreas: [{ id: 'a', name: '客厅', floor: 1, cells: [[0, -12]], sampleHeight: 1.2, openingIds: ['op1'] }],
    openings: [{ id: 'op1', wallId: 'south-0', floor: 1, width: 3, height: 1.6, sillHeight: 0.9 }]
  }]
};

describe('buildAnalysisOverlays', () => {
  it('returns area + opening descriptors for the active area', () => {
    const out = buildAnalysisOverlays(project, { activeAreaId: 'a', litSampleIds: ['0:-12:0'], noArea: false });
    expect(out.area).toMatchObject({ cells: [[0, -12]], litSampleIds: ['0:-12:0'] });
    expect(out.area.group).toMatchObject({ position: { x: 0, z: 0 }, rotationDeg: 0 });
    expect(out.openings).toHaveLength(1);
    expect(out.openings[0]).toMatchObject({ id: 'op1', width: 3, height: 1.6 });
  });

  it('returns null when noArea', () => {
    expect(buildAnalysisOverlays(project, { activeAreaId: null, litSampleIds: [], noArea: true })).toBeNull();
  });
});
