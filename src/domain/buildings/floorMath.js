export function floorBaseY({
  floor,
  floorHeight,
  firstFloorHeight = floorHeight
}) {
  if (floor <= 1) return 0;
  return firstFloorHeight + (floor - 2) * floorHeight;
}

export function totalBuildingHeight({
  floors,
  floorHeight,
  firstFloorHeight = floorHeight
}) {
  return firstFloorHeight + Math.max(0, floors - 1) * floorHeight;
}
