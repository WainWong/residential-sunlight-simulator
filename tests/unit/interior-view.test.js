import { describe, expect, it, beforeEach } from 'vitest';
import { createInteriorView } from '../../src/scene/createInteriorView.js';

// ── Lightweight scene-graph stubs ───────────────────────────────────────────
// The module only reads a narrow slice of Three.js: object trees with userData
// tags, a directional light's shadow config, a hemisphere light by name, and a
// camera rig. We fake exactly that surface so the orchestration is testable
// without a real WebGL context — the whole point of the extraction.

function makeMaterial() {
  return { opacity: 1, transparent: false, clone() { return makeMaterial(); }, dispose() {} };
}

function makeMesh({ kind, entityId, fromY = 0 }) {
  const mesh = {
    userData: { kind, entityId, fromY },
    material: makeMaterial(),
    visible: true,
    children: [],
    traverse(fn) { fn(mesh); mesh.children.forEach(c => c.traverse?.(fn)); }
  };
  return mesh;
}

function makeBuildingGroup(meshes) {
  const root = {
    userData: { entityId: 'b1' },
    children: meshes,
    traverse(fn) { fn(root); root.children.forEach(m => m.traverse(fn)); }
  };
  return { children: [root] };
}

function makeDeps(meshes) {
  const hemi = { name: 'ambient-sky', intensity: 1.5 };
  const scene = { getObjectByName: name => (name === 'ambient-sky' ? hemi : null) };
  const sunlight = {
    target: { position: { set() {} }, updateMatrixWorld() {} },
    shadow: {
      camera: { left: 0, right: 0, top: 0, bottom: 0, updateProjectionMatrix() {} },
      mapSize: { set() {} },
      map: null,
      needsUpdate: false
    }
  };
  const flown = [];
  let editControls = 'initial';
  const cameraRig = {
    camera: { position: { x: 0, y: 0, z: 0 } },
    flyToArea: area => flown.push(area),
    setEditControls: v => { editControls = v; }
  };
  // Fake raycaster: our stub meshes have no geometry, so we can't run the real
  // one. Report no occluders — visibility (lid lift) is what these tests cover.
  const raycaster = { set() {}, far: 0, intersectObjects: () => [] };
  return {
    scene, sunlight, cameraRig, buildingsGroup: makeBuildingGroup(meshes), hemi,
    flown, getEditControls: () => editControls, raycaster
  };
}

const building = {
  id: 'b1',
  position: { x: 0, z: 0 },
  rotation: 0,
  params: { floors: 3, floorHeight: 3, firstFloorHeight: 3 }
};
const room = { id: 'r1', floor: 1, rects: [{ x0: -2, z0: -2, x1: 2, z1: 2 }] };

describe('createInteriorView', () => {
  let deps;
  let segment; // observation-floor wall, below the band → NOT a lid
  let lid;     // this room's own top cap, at the band → a lid
  let above;   // a full floor segment above → a lid

  beforeEach(() => {
    // floor 1 band top (bandToY) = floorBaseY(floor 2) = firstFloorHeight = 3.
    segment = makeMesh({ kind: 'building-segment', entityId: 'b1', fromY: 0 });
    lid = makeMesh({ kind: 'building-lid', entityId: 'b1', fromY: 3 });
    above = makeMesh({ kind: 'building-segment', entityId: 'b1', fromY: 3 });
    deps = makeDeps([segment, lid, above]);
  });

  it('collects lid-and-above meshes on enter and leaves lower segments alone', () => {
    const view = createInteriorView(deps);
    view.enter(building, room);
    view.tick(); // visibility is applied per-frame, as in the animation loop
    expect(view.active).toBe(true);
    // camera flew to the room frame
    expect(deps.flown).toHaveLength(1);
    // hemisphere dimmed for contrast
    expect(deps.hemi.intensity).toBe(0.9);
    // camera at y=0 (below liftY) → first-person: lid/ceiling in place (visible).
    expect(lid.visible).toBe(true);
    expect(above.visible).toBe(true);
    expect(segment.visible).toBe(true);
  });

  it('hides the lid (reveals the room) when the camera rises above liftY', () => {
    const view = createInteriorView(deps);
    view.enter(building, room);
    // Below liftY: first-person, lid in place.
    view.tick();
    expect(lid.visible).toBe(true);
    // liftY = center.y (1.5) + floorHeight/2 (1.5) = 3. Rise above → lift the lid off.
    deps.cameraRig.camera.position.y = 5;
    view.tick();
    expect(lid.visible).toBe(false);
    expect(above.visible).toBe(false);
  });

  it('re-collects the lid on project change after meshes are rebuilt', () => {
    const view = createInteriorView(deps);
    view.enter(building, room);
    // Camera above liftY → room revealed, lid should be hidden.
    deps.cameraRig.camera.position.y = 5;
    // Simulate a rebuild: replace the lid mesh with a fresh instance.
    const newLid = makeMesh({ kind: 'building-lid', entityId: 'b1', fromY: 3 });
    newLid.visible = true;
    deps.buildingsGroup.children[0].children = [segment, newLid, above];
    view.onProjectChange();
    // fresh lid picked up and hidden per current camera height
    expect(newLid.visible).toBe(false);
  });

  it('restores visibility, ambient and edit controls on exit', () => {
    const view = createInteriorView(deps);
    view.enter(building, room);
    view.exit();
    expect(view.active).toBe(false);
    expect(lid.visible).toBe(true);
    expect(above.visible).toBe(true);
    expect(deps.hemi.intensity).toBe(1.5);
    expect(deps.getEditControls()).toBeNull();
  });

  it('is a no-op when entering with an invalid room', () => {
    const view = createInteriorView(deps);
    view.enter(building, { floor: 1, rects: [] });
    expect(view.active).toBe(false);
  });
});
