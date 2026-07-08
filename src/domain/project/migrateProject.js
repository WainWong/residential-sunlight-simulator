const CURRENT_SCHEMA_VERSION = 1;

export function migrateProject(rawProject) {
  const version = rawProject?.schemaVersion;
  if (!Number.isInteger(version) || version !== CURRENT_SCHEMA_VERSION) {
    throw new Error(`不支持的项目版本：${String(version)}`);
  }

  const project = structuredClone(rawProject);
  for (const building of project.buildings ?? []) {
    for (const area of building.observationAreas ?? []) {
      delete area.cells;
      delete area.openingIds;
      if (!Array.isArray(area.rects)) area.rects = [];
    }
  }
  const view = project.view ?? (project.view = {});
  if (view.areaTool !== 'draw' && view.areaTool !== 'erase') view.areaTool = 'draw';
  if (view.areaDraft === undefined) view.areaDraft = null;
  return project;
}
