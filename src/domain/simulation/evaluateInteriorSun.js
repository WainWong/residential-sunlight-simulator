import { intersectOpening } from './intersectOpening.js';
import { firstObstacleDistance } from './intersectObstacles.js';
import { normalize } from './vector.js';

export function evaluateInteriorSun({ surfaces, openings, obstacles, sunDirection }) {
  const direction = normalize(sunDirection);
  const masks = {};
  const belowHorizon = direction[1] <= 0;
  for (const surface of surfaces) {
    const lit = [];
    if (!belowHorizon) {
      for (const sample of surface.samples) {
        for (const opening of openings) {
          const portal = intersectOpening(sample.position, direction, opening);
          if (!portal) continue;
          const blocker = firstObstacleDistance(sample.position, direction, obstacles, portal.distance);
          if (blocker == null) { lit.push(sample.id); break; }
        }
      }
    }
    masks[surface.surfaceId] = lit;
  }
  return { masks };
}
