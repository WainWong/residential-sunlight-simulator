import { rectsToSamplePoints } from './rectsToSamplePoints.js';

const SAMPLE_SPACING = 1;
const identity = position => position;

export function sampleArea(area, transform = identity) {
  return rectsToSamplePoints(area.rects ?? [], SAMPLE_SPACING, area.sampleHeight ?? 0)
    .map(sample => ({ id: sample.id, position: transform(sample.position) }));
}
