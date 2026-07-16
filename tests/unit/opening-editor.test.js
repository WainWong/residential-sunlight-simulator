// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { createOpeningEditor } from '../../src/features/openings/OpeningEditor.js';
import { createDefaultProject } from '../../src/domain/project/defaultProject.js';
import { deriveWalls } from '../../src/domain/walls/deriveWalls.js';
import { createStore } from '../../src/store/createStore.js';

function fixture() {
  const project = createDefaultProject();
  project.buildings.push({
    id: 'b1', name: '住宅 1', template: 'bar', revision: 1,
    position: { x: 0, z: 0 }, rotation: 0,
    params: { length: 10, depth: 8, floors: 1, floorHeight: 3 },
    rooms: [{ id: 'r1', floor: 1, name: '客厅', type: 'living', objects: [],
      rects: [{ x0: -5, z0: -4, x1: 5, z1: 4 }] }],
    openings: []
  });
  return project;
}

describe('opening editor', () => {
  it('requests a front wall view with the selected wall context', () => {
    const project = fixture();
    const wall = deriveWalls(project.buildings[0], 1)[0];
    const editor = createOpeningEditor({
      store: createStore(project),
      selection: { kind: 'wall', id: wall.id, buildingId: 'b1', floor: 1, centerU: 0.4 }
    });
    const listener = vi.fn();
    editor.addEventListener('face-wall', listener);
    editor.querySelector('[data-action="face-wall"]').click();
    expect(listener).toHaveBeenCalledOnce();
    expect(listener.mock.calls[0][0].detail).toMatchObject({ buildingId: 'b1', wallId: wall.id, floor: 1 });
  });

  it('does not render a null placeholder for a valid opening', () => {
    const project = fixture();
    const wall = deriveWalls(project.buildings[0], 1)[0];
    project.buildings[0].openings.push({
      id: 'o1', floor: 1, status: 'valid', preset: 'window', fill: 'glass',
      wallAnchor: { wallId: wall.id }, connectedRoomIds: ['r1'],
      bounds: { centerU: 0.5, width: 1.8, bottom: 0.9, top: 2.1 }
    });
    const editor = createOpeningEditor({
      store: createStore(project), selection: { kind: 'opening', id: 'o1', buildingId: 'b1' }
    });
    expect(editor.textContent).not.toContain('null');
  });

  it('keeps the wall selected when the opening preset does not fit', () => {
    const project = fixture();
    project.buildings[0].rooms[0].rects = [
      { x0: -0.5, z0: -4, x1: 0.5, z1: -2 }
    ];
    const wall = deriveWalls(project.buildings[0], 1)
      .find(candidate => candidate.normal[1] === -1);
    const selection = {
      kind: 'wall',
      id: wall.id,
      buildingId: 'b1',
      floor: 1,
      centerU: 0.5
    };
    project.view.selection = selection;
    const store = createStore(project);
    const editor = createOpeningEditor({ store, selection });

    editor.querySelector('[data-testid="opening-preset-floorWindow"]').click();

    expect(store.getState().buildings[0].openings).toEqual([]);
    expect(store.getState().view.selection).toEqual(selection);
  });
});
