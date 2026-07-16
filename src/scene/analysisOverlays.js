import { floorBaseY } from '../domain/buildings/floorMath.js';

export function buildAnalysisOverlays(project, simulationState, phase = 'present') {
  // Inside the interior view the per-sample lightmap shows exactly which spots
  // are sunlit; the coarse whole-room overlay would paint the entire floor
  // one binary color on top of it, so skip it.
  if (project.view?.interiorRoomId) return null;
  const editing = project.view?.roomEditing;
  if (editing) {
    const building = project.buildings.find(b => b.id === editing.buildingId);
    if (!building) return null;
    const baseY = floorBaseY({ floor: editing.floor, ...building.params });
    return {
      room: {
        rects: editing.rects,
        baseY,
        lit: false,
        draft: true,
        wallHeight: building.params.floorHeight,
        group: { position: { x: building.position.x, z: building.position.z }, rotationDeg: building.rotation }
      }
    };
  }
  if (phase === 'edit') return null;
  if (simulationState.noRoom || !simulationState.activeRoomId) return null;
  let found = null;
  for (const building of project.buildings) {
    const room = (building.rooms ?? []).find(candidate => candidate.id === simulationState.activeRoomId);
    if (room) { found = { building, room }; break; }
  }
  if (!found) return null;
  const { building, room } = found;
  const baseY = floorBaseY({ floor: room.floor, ...building.params });
  return {
    room: {
      rects: room.rects ?? [],
      baseY,
      lit: (simulationState.litSampleIds ?? []).length > 0,
      draft: false,
      group: { position: { x: building.position.x, z: building.position.z }, rotationDeg: building.rotation }
    }
  };
}
