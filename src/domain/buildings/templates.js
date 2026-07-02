export const BUILDING_TEMPLATES = Object.freeze({
  bar: {
    label: '一字型',
    fields: ['length', 'depth']
  },
  lShape: {
    label: 'L 型',
    fields: ['length', 'depth', 'wingLength', 'wingDepth']
  },
  courtyard: {
    label: '回字形',
    fields: ['length', 'depth', 'courtyardLength', 'courtyardDepth']
  }
});
