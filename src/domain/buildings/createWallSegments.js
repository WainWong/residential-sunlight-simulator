function ringWalls(ring, ringName) {
  return ring.map((start, index) => {
    const end = ring[(index + 1) % ring.length];
    const dx = end[0] - start[0];
    const dz = end[1] - start[1];
    const length = Math.hypot(dx, dz);
    return {
      id: `wall-${ringName}-${index}`,
      ring: ringName,
      index,
      start: [...start],
      end: [...end],
      length,
      normal: [dz / length, -dx / length]
    };
  });
}

export function createWallSegments(footprint) {
  if (Array.isArray(footprint)) {
    return ringWalls(footprint, 'outer');
  }

  return [
    ...ringWalls(footprint.outer, 'outer'),
    ...footprint.holes.flatMap((hole, index) => ringWalls(hole, `hole-${index}`))
  ];
}
