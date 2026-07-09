import { floorBaseY } from '../domain/buildings/floorMath.js';
import { deriveAperturesFromArea } from '../domain/simulation/deriveApertures.js';

export function buildAnalysisOverlays(project, simulationState, phase = 'present') {
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
        group: { position: { x: building.position.x, z: building.position.z }, rotationDeg: building.rotation }
      },
      openings: []
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
  const { portals } = deriveAperturesFromArea(building, area);
  return {
    area: {
      rects: area.rects ?? [],
      baseY,
      lit: (simulationState.litSampleIds ?? []).length > 0,
      draft: false,
      group: { position: { x: building.position.x, z: building.position.z }, rotationDeg: building.rotation }
    },
    openings: portals.map(p => ({
      id: p.id,
      width: p.bounds.maxU - p.bounds.minU,
      height: p.bounds.maxV - p.bounds.minV,
      center: [p.plane.point[0], (p.bounds.minV + p.bounds.maxV) / 2, p.plane.point[2]],
      normal: p.plane.normal
    }))
  };
}
