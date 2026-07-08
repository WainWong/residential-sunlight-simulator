import { describe, expect, it } from 'vitest';
import { buildAnalysisOverlays } from '../../src/scene/analysisOverlays.js';

const project = {
  buildings: [{
    id: 'b1', template: 'bar', rotation: 0, position: { x: 0, z: 0 },
    params: { length: 60, depth: 18, floors: 3, floorHeight: 3 },
    observationAreas: [{ id: 'a', name: '客厅', floor: 1, rects: [{ x0: -3, z0: -11, x1: 3, z1: -4 }], sampleHeight: 1.2 }],
    openings: []
  }]
};

describe('buildAnalysisOverlays', () => {
  it('returns area rects + derived aperture openings for the active area', () => {
    const out = buildAnalysisOverlays(project, { activeAreaId: 'a', litSampleIds: ['1:1'], noArea: false });
    expect(out.area.rects).toEqual([{ x0: -3, z0: -11, x1: 3, z1: -4 }]);
    expect(out.area.draft).toBe(false);
    expect(out.area.lit).toBe(true);
    expect(out.area.group).toMatchObject({ position: { x: 0, z: 0 }, rotationDeg: 0 });
    expect(out.openings.length).toBeGreaterThan(0);
  });

  it('renders draft rects with a draft flag when a matching draft exists', () => {
    const withDraft = {
      ...project,
      view: { areaDraft: { buildingId: 'b1', areaId: 'a', rects: [{ x0: 0, z0: 0, x1: 1, z1: 1 }] } }
    };
    const out = buildAnalysisOverlays(withDraft, { activeAreaId: 'a', litSampleIds: [], noArea: false });
    expect(out.area.draft).toBe(true);
    expect(out.area.rects).toEqual([{ x0: 0, z0: 0, x1: 1, z1: 1 }]);
  });

  it('returns null when noArea', () => {
    expect(buildAnalysisOverlays(project, { activeAreaId: null, litSampleIds: [], noArea: true })).toBeNull();
  });
});
