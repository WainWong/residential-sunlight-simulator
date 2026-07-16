export function wallDirectionDegrees([x, z]) {
  return ((Math.atan2(x, z) * 180 / Math.PI) + 360) % 360;
}

export function directionName(degrees) {
  const d = ((degrees % 360) + 360) % 360;
  if (d < 22.5 || d >= 337.5) return '正北';
  if (d < 67.5) return '东北';
  if (d < 112.5) return '正东';
  if (d < 157.5) return '东南';
  if (d < 202.5) return '正南';
  if (d < 247.5) return '西南';
  if (d < 292.5) return '正西';
  return '西北';
}

export function formatWallDirection(normal) {
  const degrees = Math.round(wallDirectionDegrees(normal)) % 360;
  return `${directionName(degrees)} ${degrees}°`;
}
