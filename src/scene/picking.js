export function resolvePickedEntity(intersections) {
  for (const intersection of intersections) {
    let object = intersection.object;
    while (object) {
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
