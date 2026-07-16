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

  return {
    update(buildings, { highlightBuildingId = null } = {}) {
      clearTransient();
      const incomingIds = new Set(buildings.map(building => building.id));
      for (const id of objects.keys()) {
        if (!incomingIds.has(id)) remove(id);
      }

      for (const building of buildings) {
        const highlighted = building.id === highlightBuildingId;
        const signature = `${building.revision ?? 0}:${highlighted}`;
        const current = objects.get(building.id);
        if (current?.signature === signature) continue;
        if (current) remove(building.id);
        const object = rebuild(building, { preview: false, highlighted });
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
