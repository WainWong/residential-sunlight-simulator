import { isBuildingShell, isLidOrAbove } from './sceneTags.js';

// 天花(观察层顶面及以上的外壳,即"盖子")的三档显隐,两处视图共用:
//  - 'hide'  掀开,完全隐藏(方便画/看室内)
//  - 'ghost' 半透明,既看得进去又保留有盖的空间感
//  - 'show'  完整盖着(外观如常)
// 纯视觉,不影响采光计算。编辑房间与查看采光都调本原语,不再各写一套。
const GHOST_OPACITY = 0.22;

function applyCeilingMode(object, mode) {
  if (mode === 'hide') {
    object.visible = false;
    return;
  }
  object.visible = true;
  // 半透明只对有材质的网格生效;描边等子对象跟随可见性即可。
  const material = object.material;
  if (!material) return;
  if (mode === 'ghost') {
    if (!object.userData._ceilingGhosted) {
      object.userData._ceilingSharedMaterial = material;
      object.material = material.clone();
      object.material.transparent = true;
      object.userData._ceilingGhosted = true;
    }
    object.material.opacity = GHOST_OPACITY;
    object.material.depthWrite = false;
  } else if (object.userData._ceilingGhosted) {
    // 'show':还原共享实心材质
    object.material.dispose();
    object.material = object.userData._ceilingSharedMaterial;
    object.userData._ceilingGhosted = false;
  }
}

// 对一栋楼的 group 应用天花档:观察层顶面(bandToY)及以上的外壳按 mode 显隐,
// 其余外壳保持可见。仅处理外壳(building-shell),不碰房间几何/描边等——那些
// 由各视图各自决定。
export function applyCeiling(buildingGroup, bandToY, mode) {
  buildingGroup.traverse(object => {
    if (!isBuildingShell(object)) return;
    if (isLidOrAbove(object, bandToY)) applyCeilingMode(object, mode);
    else object.visible = true;
  });
}
