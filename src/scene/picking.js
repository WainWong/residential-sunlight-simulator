function wallSelectionAtPoint(intersection, object, selection) {
  const wall = object.userData?.wallPick;
  if (selection.kind !== 'wall' || !wall || !intersection.point) return selection;
  let building = object;
  while (building && !building.userData?.entityId) building = building.parent;
  if (!building?.worldToLocal || !intersection.point.clone) return selection;
  const point = building.worldToLocal(intersection.point.clone());
  const dx = wall.end[0] - wall.start[0];
  const dz = wall.end[1] - wall.start[1];
  const lengthSquared = dx * dx + dz * dz;
  if (lengthSquared <= 0) return selection;
  const centerU = ((point.x - wall.start[0]) * dx + (point.z - wall.start[1]) * dz) / lengthSquared;
  return { ...selection, centerU: Math.max(0, Math.min(1, centerU)) };
}

export function resolvePickedEntity(intersections) {
  for (const intersection of intersections) {
    let object = intersection.object;
    while (object) {
      if (object.userData?.selection) {
        const selection = structuredClone(object.userData.selection);
        return wallSelectionAtPoint(intersection, object, selection);
      }
      if (object.userData?.entityId) return object.userData.entityId;
      object = object.parent;
    }
  }
  return null;
}

export function pointerToNdc(pointer, rect) {
  return {
    x: ((pointer.clientX - rect.left) / rect.width) * 2 - 1,
    y: -((pointer.clientY - rect.top) / rect.height) * 2 + 1
  };
}
