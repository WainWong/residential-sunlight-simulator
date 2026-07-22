export function createSceneSynchronizer({ rebuild, attach, detach }) {
  const objects = new Map();
  let transient = null;

  function disposeObject(object) {
    object.userData?.dispose?.();
    object.dispose?.();
  }

  function remove(id) {
    const entry = objects.get(id);
    if (!entry) return;
    detach(entry.object);
    disposeObject(entry.object);
    objects.delete(id);
  }

  function clearTransient() {
    if (!transient) return;
    detach(transient.object);
    disposeObject(transient.object);
    const canonical = objects.get(transient.buildingId)?.object;
    if (canonical) canonical.visible = true;
    transient = null;
  }

  // 草稿指纹:草稿的 roomId + 每块 rect 量化坐标,拼成短串。草稿变了签名就变,
  // 楼体随之重挖(与 revision 变化同一条路)。
  function draftFingerprint(draft) {
    if (!draft?.rects?.length) return '';
    const parts = draft.rects.map(r => `${r.x0}|${r.z0}|${r.x1}|${r.z1}`);
    return `d${draft.roomId}#${parts.join(',')}`;
  }

  // 把草稿并进目标楼的 rooms(草稿=未提交的房间),让它和已完成房间一起 CSG 挖空。
  function augment(building, draft) {
    if (!draft || draft.buildingId !== building.id || !draft.rects?.length) return building;
    const draftRoom = { id: draft.roomId, floor: draft.floor, rects: draft.rects, objects: [] };
    return { ...building, rooms: [...(building.rooms ?? []), draftRoom] };
  }

  return {
    update(buildings, { highlightBuildingId = null, draft = null } = {}) {
      clearTransient();
      const incomingIds = new Set(buildings.map(building => building.id));
      for (const id of objects.keys()) {
        if (!incomingIds.has(id)) remove(id);
      }

      for (const building of buildings) {
        const highlighted = building.id === highlightBuildingId;
        const draftSig = draft?.buildingId === building.id ? draftFingerprint(draft) : '';
        const signature = `${building.revision ?? 0}:${highlighted}:${draftSig}`;
        const current = objects.get(building.id);
        if (current?.signature === signature) continue;
        if (current) remove(building.id);
        const object = rebuild(augment(building, draft), { preview: false, highlighted });
        objects.set(building.id, { signature, object });
        attach(object);
      }
    },

    showTransient(building) {
      clearTransient();
      const canonical = objects.get(building.id)?.object;
      if (canonical) canonical.visible = false;
      const object = rebuild(building, { preview: true, highlighted: false });
      transient = { buildingId: building.id, object };
      attach(object);
    },

    clearTransient,

    dispose() {
      clearTransient();
      for (const id of [...objects.keys()]) remove(id);
    }
  };
}
