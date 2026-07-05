export function editorPositionToScene(position) {
  return { x: Number(position.x), z: Number(position.y) };
}

export function scenePositionToEditor(position) {
  return { x: Number(position.x), y: Number(position.z) };
}

export function normalizeRotation(value) {
  const numeric = Number(value);
  return ((numeric % 360) + 360) % 360;
}
