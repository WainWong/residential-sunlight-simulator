export function rectsToSamplePoints(rects, spacing = 1, sampleHeight = 0) {
  const byCell = new Map();
  for (const rect of rects ?? []) {
    const xMin = Math.min(rect.x0, rect.x1);
    const xMax = Math.max(rect.x0, rect.x1);
    const zMin = Math.min(rect.z0, rect.z1);
    const zMax = Math.max(rect.z0, rect.z1);
    for (let x = xMin + spacing / 2; x < xMax; x += spacing) {
      for (let z = zMin + spacing / 2; z < zMax; z += spacing) {
        const gx = Math.round(x / spacing);
        const gz = Math.round(z / spacing);
        const id = `${gx}:${gz}`;
        if (!byCell.has(id)) byCell.set(id, { id, position: [x, sampleHeight, z] });
      }
    }
  }
  return [...byCell.values()];
}
