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

  it('returns null when noArea', () => {
    expect(buildAnalysisOverlays(project, { activeAreaId: null, litSampleIds: [], noArea: true })).toBeNull();
  });

  it('renders areaEditing rects while editing without requiring an active saved area', () => {
    const out = buildAnalysisOverlays({
      ...project,
      view: { areaEditing: { mode: 'create', buildingId: 'b1', areaId: null, floor: 2, name: '', rects: [{ x0: 0, z0: 0, x1: 1, z1: 1 }], tool: 'draw' } }
    }, { activeAreaId: null, litSampleIds: [], noArea: false });
    expect(out.area.draft).toBe(true);
    expect(out.area.rects).toEqual([{ x0: 0, z0: 0, x1: 1, z1: 1 }]);
  });

  it('suppresses lit/unlit analysis overlays in the edit phase but still allows the editing draft', () => {
    const simState = { activeAreaId: 'a', litSampleIds: ['1:1'], noArea: false };
    expect(buildAnalysisOverlays(project, simState, 'edit')).toBeNull();
    const present = buildAnalysisOverlays(project, simState, 'present');
    expect(present).not.toBeNull();
    expect(present.area.draft).toBe(false);
    expect(present.area.lit).toBe(true);
    const def = buildAnalysisOverlays(project, simState);
    expect(def).not.toBeNull();
    expect(def.area.lit).toBe(true);
  });

  it('still returns the editing-draft overlay in edit when areaEditing is set', () => {
    const editingProject = {
      ...project,
      view: { areaEditing: { mode: 'create', buildingId: 'b1', areaId: null, floor: 2, name: '', rects: [{ x0: 0, z0: 0, x1: 1, z1: 1 }], tool: 'draw' } }
    };
    const out = buildAnalysisOverlays(editingProject, { activeAreaId: 'a', litSampleIds: ['1:1'], noArea: false }, 'edit');
    expect(out).not.toBeNull();
    expect(out.area.draft).toBe(true);
    expect(out.area.rects).toEqual([{ x0: 0, z0: 0, x1: 1, z1: 1 }]);
  });
});
