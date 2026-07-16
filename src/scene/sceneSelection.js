export function selectedBuildingId(view) {
  const selection = view.selection;
  return selection?.buildingId
    ?? (selection?.kind === 'building' ? selection.id : null);
}
