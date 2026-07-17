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

// 观察层顶面高度 (band top):顶层是屋顶板底(整栋高),其余层是上一层楼板底
// (即上方段的 fromY)。造楼层几何、揭盖/遮挡、楼层聚焦显隐都据此定"这层到哪
// 为止"。原先此式在 segmentBuilding、室内视图、控制器多处各写一遍。
export function bandTopY({
  floor,
  floors,
  floorHeight,
  firstFloorHeight = floorHeight
}) {
  return floor >= floors
    ? totalBuildingHeight({ floors, floorHeight, firstFloorHeight })
    : floorBaseY({ floor: floor + 1, floorHeight, firstFloorHeight });
}
