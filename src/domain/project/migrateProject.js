const CURRENT_SCHEMA_VERSION = 1;

export function migrateProject(rawProject) {
  const version = rawProject?.schemaVersion;
  if (!Number.isInteger(version) || version !== CURRENT_SCHEMA_VERSION) {
    throw new Error(`不支持的项目版本：${String(version)}`);
  }

  return structuredClone(rawProject);
}
