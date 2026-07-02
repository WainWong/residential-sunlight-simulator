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
    update(buildings) {
      const incomingIds = new Set(buildings.map(building => building.id));
      for (const id of objects.keys()) {
        if (!incomingIds.has(id)) remove(id);
      }

      for (const building of buildings) {
        const current = objects.get(building.id);
        if (current?.revision === (building.revision ?? 0)) continue;
        if (current) remove(building.id);
        const object = rebuild(building);
        objects.set(building.id, {
          revision: building.revision ?? 0,
          object
        });
        attach(object);
      }
    },

    dispose() {
      for (const id of [...objects.keys()]) remove(id);
    }
  };
}
