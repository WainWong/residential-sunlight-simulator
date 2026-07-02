export function dot(a, b) {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

export function addScaled(origin, direction, distance) {
  return [
    origin[0] + direction[0] * distance,
    origin[1] + direction[1] * distance,
    origin[2] + direction[2] * distance
  ];
}

export function subtract(a, b) {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}

export function normalize(vector) {
  const length = Math.hypot(...vector);
  if (length === 0) throw new Error('方向向量不能为零');
  return vector.map(value => value / length);
}
