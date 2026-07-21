// 当前选中归属哪栋楼 (Selected Building)。视图选中可能是建筑本身,也可能是它
// 名下的房间/墙/洞口(带 buildingId)—— 两种都归到那栋楼。纯视图派生逻辑,scene
// 高亮与 BuildingInspector 面板共用同一定义,不再各自内联手抄。
export function selectedBuildingId(view) {
  const selection = view?.selection;
  return selection?.buildingId
    ?? (selection?.kind === 'building' ? selection.id : null);
}

// 左键是否正握着"画/擦"工具 (Drawing Tool Active)。握着时左键用于绘制,松开
// (选择)时左键回到拾取/环绕。scene 的拾取门控与绘制手势据此判断。
export function isDrawingToolActive(view) {
  return view?.roomTool === 'draw' || view?.roomTool === 'erase';
}

