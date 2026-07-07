export function deriveScenePreview(view) {
  const { selectedBuildingId, editorMode } = view;
  return {
    previewBuildingId: editorMode === 'building' ? selectedBuildingId : null,
    highlightBuildingId:
      selectedBuildingId && editorMode !== 'building' ? selectedBuildingId : null
  };
}
