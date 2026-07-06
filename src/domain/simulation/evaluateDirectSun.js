import { intersectOpening } from './intersectOpening.js';
import { firstObstacleDistance } from './intersectObstacles.js';
import { sampleArea } from './sampleArea.js';
import { normalize } from './vector.js';

export function evaluateDirectSun({
  area,
  openings,
  obstacles,
  sunDirection,
  transform
}) {
  const direction = normalize(sunDirection);
  const samples = sampleArea(area, transform);
  const openingHits = Object.fromEntries(openings.map(opening => [opening.id, 0]));

  if (direction[1] <= 0 || samples.length === 0) {
    return {
      hasDirectSun: false,
      litRatio: 0,
      litSampleIds: [],
      openingHits
    };
  }

  const litSampleIds = [];
  for (const sample of samples) {
    for (const opening of openings) {
      const portal = intersectOpening(sample.position, direction, opening);
      if (!portal) continue;
      const blocker = firstObstacleDistance(
        sample.position,
        direction,
        obstacles,
        portal.distance
      );
      if (blocker == null) {
        litSampleIds.push(sample.id);
        openingHits[opening.id] += 1;
        break;
      }
    }
  }

  return {
    hasDirectSun: litSampleIds.length > 0,
    litRatio: litSampleIds.length / samples.length,
    litSampleIds,
    openingHits
  };
}
