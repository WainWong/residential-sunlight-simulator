
export function worldPointToBuildingLocal(building, point) {
  const radians = building.rotation * Math.PI / 180;
  const cosine = Math.cos(radians);
  const sine = Math.sin(radians);
  const dx = point.x - building.position.x;
  const dz = point.z - building.position.z;
  return {
    x: dx * cosine - dz * sine,
    z: dx * sine + dz * cosine
  };
}
