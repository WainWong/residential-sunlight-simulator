import { floorBaseY } from '../domain/buildings/floorMath.js';
import { buildOpeningPortals } from '../domain/simulation/buildOpeningPortals.js';

export function buildAnalysisOverlays(project, simulationState) {
  if (simulationState.noArea || !simulationState.activeAreaId) return null;
  let found = null;
  for (const building of project.buildings) {
    const area = (building.observationAreas ?? []).find(a => a.id === simulationState.activeAreaId);
    if (area) { found = { building, area }; break; }
  }
  if (!found) return null;
  const { building, area } = found;
  const baseY = floorBaseY({ floor: area.floor, ...building.params }) + (area.sampleHeight ?? 0);
  const openings = (building.openings ?? []).filter(o => (area.openingIds ?? []).includes(o.id));
  const portals = buildOpeningPortals(building, openings);
  return {
    area: {
      cells: area.cells,
      baseY,
      litSampleIds: simulationState.litSampleIds ?? [],
      group: { position: { x: building.position.x, z: building.position.z }, rotationDeg: building.rotation }
    },
    openings: openings.map(o => {
      const portal = portals.find(p => p.id === o.id);
      return {
        id: o.id, width: o.width, height: o.height,
        center: portal ? [portal.plane.point[0], portal.bounds.minV + o.height / 2, portal.plane.point[2]] : null,
        normal: portal ? portal.plane.normal : null
      };
    }).filter(o => o.center)
  };
}
