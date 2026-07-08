import { floorBaseY } from '../domain/buildings/floorMath.js';
import { deriveAperturesFromArea } from '../domain/simulation/deriveApertures.js';

export function buildAnalysisOverlays(project, simulationState) {
  if (simulationState.noArea || !simulationState.activeAreaId) return null;
  let found = null;
  for (const building of project.buildings) {
    const area = (building.observationAreas ?? []).find(a => a.id === simulationState.activeAreaId);
    if (area) { found = { building, area }; break; }
  }
  if (!found) return null;
  const { building, area } = found;
  const draft = project.view?.areaDraft;
  const usingDraft = Boolean(draft && draft.buildingId === building.id && draft.areaId === area.id);
  const rects = usingDraft ? draft.rects : (area.rects ?? []);
  const baseY = floorBaseY({ floor: area.floor, ...building.params }) + (area.sampleHeight ?? 0);
  const { portals } = deriveAperturesFromArea(building, area);
  return {
    area: {
      rects,
      baseY,
      lit: !usingDraft && (simulationState.litSampleIds ?? []).length > 0,
      draft: usingDraft,
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
