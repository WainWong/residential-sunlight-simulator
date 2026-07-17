// 当前选中归属哪栋楼 (Selected Building)。视图选中可能是建筑本身,也可能是它
// 名下的房间/墙/洞口(带 buildingId)—— 两种都归到那栋楼。纯视图派生逻辑,scene
// 高亮与 BuildingInspector 面板共用同一定义,不再各自内联手抄。
export function selectedBuildingId(view) {
  const selection = view?.selection;
  return selection?.buildingId
    ?? (selection?.kind === 'building' ? selection.id : null);
}
