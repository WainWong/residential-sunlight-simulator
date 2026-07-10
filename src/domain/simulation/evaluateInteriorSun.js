import { intersectOpening } from './intersectOpening.js';
import { firstBlockingDistance } from './intersectObstacles.js';
import { normalize } from './vector.js';

// A sample is lit when its ray to the sun exits through an opening AND no
// obstacle blocks the ray anywhere along it — walls remain obstacles; only
// hits landing inside an opening are pass-throughs.
export function evaluateInteriorSun({ surfaces, openings, obstacles, sunDirection }) {
  const direction = normalize(sunDirection);
  const masks = {};
  const belowHorizon = direction[1] <= 0;
  for (const surface of surfaces) {
    const lit = [];
    if (!belowHorizon) {
      for (const sample of surface.samples) {
        const throughOpening = openings.some(
          opening => intersectOpening(sample.position, direction, opening) != null
        );
        if (!throughOpening) continue;
        const blocker = firstBlockingDistance(sample.position, direction, obstacles, openings);
        if (blocker == null) lit.push(sample.id);
      }
    }
    masks[surface.surfaceId] = lit;
  }
  return { masks };
}
