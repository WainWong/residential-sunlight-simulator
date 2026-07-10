import { floorBaseY } from '../domain/buildings/floorMath.js';

export function buildAnalysisOverlays(project, simulationState, phase = 'present') {
  // Inside the interior view the per-sample lightmap shows exactly which spots
  // are sunlit — the coarse whole-area overlay would paint the entire floor
  // one binary color on top of it, so skip it.
  if (project.view?.interior) return null;
  const editing = project.view?.areaEditing;
  if (editing) {
    const building = project.buildings.find(b => b.id === editing.buildingId);
    if (!building) return null;
    const baseY = floorBaseY({ floor: editing.floor, ...building.params });
    return {
      area: {
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
  if (simulationState.noArea || !simulationState.activeAreaId) return null;
  let found = null;
  for (const building of project.buildings) {
    const area = (building.observationAreas ?? []).find(a => a.id === simulationState.activeAreaId);
    if (area) { found = { building, area }; break; }
  }
  if (!found) return null;
  const { building, area } = found;
  const baseY = floorBaseY({ floor: area.floor, ...building.params }) + (area.sampleHeight ?? 0);
  return {
    area: {
      rects: area.rects ?? [],
      baseY,
      lit: (simulationState.litSampleIds ?? []).length > 0,
      draft: false,
      group: { position: { x: building.position.x, z: building.position.z }, rotationDeg: building.rotation }
    }
  };
}
