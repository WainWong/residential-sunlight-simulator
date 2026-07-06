const OFFSETS = [[0.25, 0.25], [0.75, 0.25], [0.25, 0.75], [0.75, 0.75]];
const identity = position => position;

export function sampleArea(area, transform = identity) {
  return area.cells.flatMap(([cellX, cellZ]) =>
    OFFSETS.map(([offsetX, offsetZ], index) => ({
      id: `${cellX}:${cellZ}:${index}`,
      position: transform([cellX + offsetX, area.sampleHeight ?? 0, cellZ + offsetZ])
    }))
  );
}
