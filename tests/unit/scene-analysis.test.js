import { describe, expect, it } from 'vitest';
import { buildAnalysisOverlays } from '../../src/scene/analysisOverlays.js';

const project = {
  buildings: [{
    id: 'b1', template: 'bar', rotation: 0, position: { x: 0, z: 0 },
    params: { length: 60, depth: 18, floors: 3, floorHeight: 3 },
    rooms: [{ id: 'r1', name: '客厅', floor: 1, rects: [{ x0: -3, z0: -9, x1: 3, z1: -4 }] }],
    openings: []
  }]
};

describe('buildAnalysisOverlays', () => {
  it('returns area rects for the active area', () => {
    const out = buildAnalysisOverlays(project, { activeRoomId: 'r1', litSampleIds: ['1:1'], noRoom: false });
    expect(out.room.rects).toEqual([{ x0: -3, z0: -9, x1: 3, z1: -4 }]);
    expect(out.room.draft).toBe(false);
    expect(out.room.lit).toBe(true);
    expect(out.room.group).toMatchObject({ position: { x: 0, z: 0 }, rotationDeg: 0 });
  });

  it('returns null when no room is selected', () => {
    expect(buildAnalysisOverlays(project, { activeRoomId: null, litSampleIds: [], noRoom: true })).toBeNull();
  });

  it('renders roomEditing rects without requiring an active saved room', () => {
    const out = buildAnalysisOverlays({
      ...project,
      view: { roomEditing: { mode: 'create', buildingId: 'b1', roomId: 'draft', floor: 2, name: '', rects: [{ x0: 0, z0: 0, x1: 1, z1: 1 }] } }
    }, { activeRoomId: null, litSampleIds: [], noRoom: false });
    expect(out.room.draft).toBe(true);
    expect(out.room.rects).toEqual([{ x0: 0, z0: 0, x1: 1, z1: 1 }]);
  });

  it('suppresses lit/unlit analysis overlays in the edit phase but still allows the editing draft', () => {
    const simState = { activeRoomId: 'r1', litSampleIds: ['1:1'], noRoom: false };
    expect(buildAnalysisOverlays(project, simState, 'edit')).toBeNull();
    const present = buildAnalysisOverlays(project, simState, 'present');
    expect(present).not.toBeNull();
    expect(present.room.draft).toBe(false);
    expect(present.room.lit).toBe(true);
    const def = buildAnalysisOverlays(project, simState);
    expect(def).not.toBeNull();
    expect(def.room.lit).toBe(true);
  });

  it('still returns the editing-draft overlay in edit when roomEditing is set', () => {
    const editingProject = {
      ...project,
      view: { roomEditing: { mode: 'create', buildingId: 'b1', roomId: 'draft', floor: 2, name: '', rects: [{ x0: 0, z0: 0, x1: 1, z1: 1 }] } }
    };
    const out = buildAnalysisOverlays(editingProject, { activeRoomId: 'r1', litSampleIds: ['1:1'], noRoom: false }, 'edit');
    expect(out).not.toBeNull();
    expect(out.room.draft).toBe(true);
    expect(out.room.rects).toEqual([{ x0: 0, z0: 0, x1: 1, z1: 1 }]);
  });

  it('consumes room-first project state without a legacy scene adapter', () => {
    const roomProject = {
      buildings: [{
        id: 'b1', template: 'bar', rotation: 0, position: { x: 0, z: 0 },
        params: { length: 20, depth: 10, floors: 2, floorHeight: 3 },
        rooms: [{
          id: 'r1', floor: 1, name: 'Living room',
          rects: [{ x0: -4, z0: -3, x1: 4, z1: 3 }], objects: []
        }],
        openings: []
      }],
      view: {
        roomEditing: {
          mode: 'create', buildingId: 'b1', roomId: 'draft', floor: 2,
          rects: [{ x0: 0, z0: 0, x1: 1, z1: 1 }]
        },
        interiorRoomId: null
      }
    };
    const draft = buildAnalysisOverlays(roomProject, {
      activeRoomId: null, litSampleIds: [], noRoom: false
    }, 'edit');
    expect(draft.room.rects).toEqual([{ x0: 0, z0: 0, x1: 1, z1: 1 }]);

    roomProject.view.roomEditing = null;
    roomProject.view.interiorRoomId = 'r1';
    expect(buildAnalysisOverlays(roomProject, {
      activeRoomId: 'r1', litSampleIds: ['sample'], noRoom: false
    })).toBeNull();
  });
});
