const OFFSETS = [
  [0.25, 0.25],
  [0.75, 0.25],
  [0.25, 0.75],
  [0.75, 0.75]
];

export function sampleArea(area) {
  return area.cells.flatMap(([cellX, cellZ]) =>
    OFFSETS.map(([offsetX, offsetZ], index) => ({
      id: `${cellX}:${cellZ}:${index}`,
      position: [
        cellX + offsetX,
        area.sampleHeight ?? 0,
        cellZ + offsetZ
      ]
    }))
  );
}
