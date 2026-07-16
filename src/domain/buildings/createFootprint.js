import { getBuildingTypeDefinition } from './buildingTypes.js';

export function createFootprint(template, params) {
  return getBuildingTypeDefinition(template).createFootprint(params);
}
