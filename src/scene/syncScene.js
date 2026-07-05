export function createSceneSynchronizer({ rebuild, attach, detach }) {
  const objects = new Map();

  function remove(id) {
    const entry = objects.get(id);
    if (!entry) return;
    detach(entry.object);
    entry.object.userData?.dispose?.();
    entry.object.dispose?.();
    objects.delete(id);
  }

  return {
    update(buildings, { previewBuildingId = null } = {}) {
      const incomingIds = new Set(buildings.map(building => building.id));
      for (const id of objects.keys()) {
        if (!incomingIds.has(id)) remove(id);
      }

      for (const building of buildings) {
        const preview = building.id === previewBuildingId;
        const signature = `${building.revision ?? 0}:${preview}`;
        const current = objects.get(building.id);
        if (current?.signature === signature) continue;
        if (current) remove(building.id);
        const object = rebuild(building, { preview });
        objects.set(building.id, { signature, object });
        attach(object);
      }
    },

    dispose() {
      for (const id of [...objects.keys()]) remove(id);
    }
  };
}
