import { createOpeningFromPreset } from '../../domain/openings/openingGeometry.js';
import { deriveWalls } from '../../domain/walls/deriveWalls.js';
import { formatWallDirection } from '../../domain/walls/wallDirection.js';
import { createElement } from '../../ui/createElement.js';
import {
  createAddOpeningCommand,
  createRemoveOpeningCommand,
  createSelectEntityCommand,
  createUpdateOpeningCommand
} from '../../store/roomCommands.js';

const PRESETS = [
  ['window', '窗'], ['floorWindow', '落地窗'], ['doorway', '门洞'], ['parapet', '半墙开口']
];

function numericField(label, value, onChange) {
  const input = createElement('input', {
    className: 'input', attributes: { type: 'number', step: '0.1', value: String(value), 'aria-label': label }
  });
  input.addEventListener('change', () => onChange(Number(input.value)));
  return createElement('label', { className: 'field' },
    createElement('span', { className: 'field__label', text: label }), input);
}

export function createOpeningEditor({ store, selection }) {
  const building = store.getState().buildings.find(item => item.id === selection.buildingId);
  const element = createElement('section', { className: 'opening-editor', testId: 'opening-editor' });
  if (!building) return element;

  if (selection.kind === 'wall') {
    const wall = deriveWalls(building, selection.floor).find(item => item.id === selection.id);
    if (!wall) return element;
    const buttons = PRESETS.map(([preset, label]) => {
      const button = createElement('button', {
        className: 'opening-preset', text: label, testId: `opening-preset-${preset}`, attributes: { type: 'button' }
      });
      button.addEventListener('click', () => {
        const opening = createOpeningFromPreset({
          wall, preset, centerU: selection.centerU ?? 0.5, floorHeight: building.params.floorHeight
        });
        if (store.execute(createAddOpeningCommand(building.id, opening))) {
          store.execute(createSelectEntityCommand({ kind: 'opening', id: opening.id, buildingId: building.id }));
        }
      });
      return button;
    });
    const faceWall = createElement('button', {
      className: 'button button--secondary', text: '正视墙面',
      attributes: { type: 'button', 'data-action': 'face-wall' }
    });
    faceWall.addEventListener('click', () => element.dispatchEvent(new CustomEvent('face-wall', {
      bubbles: true, detail: { buildingId: building.id, wallId: wall.id, floor: wall.floor }
    })));
    element.replaceChildren(
      createElement('div', { className: 'panel__label', text: '墙面' }),
      createElement('h2', { className: 'panel__title', text: `墙面朝向：${formatWallDirection(wall.normal)}` }),
      faceWall,
      createElement('div', { className: 'opening-presets' }, ...buttons)
    );
    return element;
  }

  const opening = building.openings?.find(item => item.id === selection.id);
  if (!opening) return element;
  const updateBounds = patch => store.execute(createUpdateOpeningCommand(building.id, opening.id, {
    bounds: { ...opening.bounds, ...patch }
  }));
  const fill = createElement('select', { className: 'input', attributes: { 'aria-label': '开口填充' } },
    createElement('option', { text: '玻璃', attributes: { value: 'glass' } }),
    createElement('option', { text: '完全开放', attributes: { value: 'open' } }));
  fill.value = opening.fill;
  fill.addEventListener('change', () => store.execute(createUpdateOpeningCommand(building.id, opening.id, { fill: fill.value })));
  const remove = createElement('button', { className: 'button button--danger', text: '删除开口', attributes: { type: 'button' } });
  remove.addEventListener('click', () => store.execute(createRemoveOpeningCommand(building.id, opening.id)));
  element.replaceChildren(
    createElement('div', { className: 'panel__label', text: '墙上开口' }),
    createElement('h2', { className: 'panel__title', text: PRESETS.find(([key]) => key === opening.preset)?.[1] ?? '自定义开口' }),
    ...(opening.status === 'invalid'
      ? [createElement('p', {
          className: 'field__error opening-invalid',
          text: opening.wallAnchor?.wallId
            ? '开口不再适合当前墙面，请调整尺寸或删除。'
            : '原墙面无法定位，请删除后在正确墙面重新添加。'
        })]
      : []),
    numericField('宽度（米）', opening.bounds.width, width => updateBounds({ width })),
    numericField('底部高度（米）', opening.bounds.bottom, bottom => updateBounds({ bottom })),
    numericField('顶部高度（米）', opening.bounds.top, top => updateBounds({ top })),
    createElement('label', { className: 'field' }, createElement('span', { className: 'field__label', text: '填充' }), fill),
    createElement('div', { className: 'inspector-actions' }, remove)
  );
  return element;
}
