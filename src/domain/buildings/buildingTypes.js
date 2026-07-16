import { barType } from './types/bar.js';
import { courtyardType } from './types/courtyard.js';
import { lShapeType } from './types/lShape.js';

const definitions = Object.freeze([barType, lShapeType, courtyardType]);
const byId = new Map(definitions.map(definition => [definition.id, definition]));
const geometryFields = new Set(definitions.flatMap(definition => definition.geometryFields));

export function listBuildingTypeDefinitions() {
  return definitions;
}

export function getBuildingTypeDefinition(templateId) {
  const definition = byId.get(templateId);
  if (!definition) throw new Error(`Unknown building type: ${String(templateId)}`);
  return definition;
}

function definedEntries(values = {}) {
  return Object.entries(values).filter(([, value]) => value !== undefined);
}

export function normalizeBuildingParams(templateId, params) {
  return getBuildingTypeDefinition(templateId).normalizeParams({ ...params });
}

export function createBuildingParams({ currentParams = {}, templateId, overrides = {} }) {
  const definition = getBuildingTypeDefinition(templateId);
  const nonGeometryParams = Object.fromEntries(
    Object.entries(currentParams).filter(([field]) => !geometryFields.has(field))
  );
  return definition.normalizeParams({
    ...nonGeometryParams,
    ...definition.defaults,
    ...Object.fromEntries(definedEntries(overrides))
  });
}

export function completeMissingBuildingParams(templateId, params = {}) {
  const definition = getBuildingTypeDefinition(templateId);
  const complete = { ...params };
  for (const field of definition.geometryFields) {
    if (!Object.hasOwn(complete, field)) complete[field] = definition.defaults[field];
  }
  return complete;
}

export function validateBuildingParams(templateId, params) {
  return getBuildingTypeDefinition(templateId).validateParams(params);
}

export function applyDimensionControl({
  templateId,
  controlId,
  startParams,
  pointerLocal
}) {
  const definition = getBuildingTypeDefinition(templateId);
  const control = definition.getDimensionControls(startParams)
    .find(candidate => candidate.id === controlId);
  if (!control) throw new Error(`Unknown dimension control: ${String(controlId)}`);
  const patch = control.applyDrag({ startParams, pointerLocal });
  return definition.normalizeParams({ ...startParams, ...patch });
}
export const BUILDING_DEFAULTS = Object.freeze(Object.fromEntries(
  definitions.map(definition => [definition.id, definition.defaults])
));
