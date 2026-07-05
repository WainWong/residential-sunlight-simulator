import { createElement } from '../../ui/createElement.js';
import { createAreaPainter } from './AreaPainter.js';
import { createFloorSelector } from '../floors/FloorSelector.js';
import {
  createAddObservationAreaCommand,
  createUpdateObservationAreaCommand,
  createAddOpeningCommand
} from '../../store/buildingCommands.js';

const OPENING_TYPES = [
  ['window', '普通窗'],
  ['floorWindow', '落地窗'],
  ['balcony', '阳台']
];
const WALLS = [
  ['south-0', '南侧外墙'],
  ['east-0', '东侧外墙'],
  ['north-0', '北侧外墙'],
  ['west-0', '西侧外墙']
];

function renderOpenings(area, allOpenings, container) {
  const areaOpenings = (area.openingIds ?? [])
    .map(id => allOpenings.find(o => o.id === id))
    .filter(Boolean);
  if (areaOpenings.length === 0) {
    container.replaceChildren(
      createElement('p', { className: 'opening-list-empty', text: '尚未添加采光口' })
    );
    return;
  }
  container.replaceChildren(
    ...areaOpenings.map(o => createElement('div', {
      className: 'opening-list-item',
      text: `${o.wallLabel} · ${OPENING_TYPES.find(([t]) => t === o.type)?.[1] ?? o.type} · 第 ${o.floor} 层`
    }))
  );
}

function buildOpeningPicker(buildingId, areaId, getAreaFloor, store) {
  let selectedType = 'window';
  const typePicker = createElement('div', { className: 'template-picker opening-types' });
  for (const [type, label] of OPENING_TYPES) {
    const btn = createElement('button', {
      className: type === 'window' ? 'template-card is-active' : 'template-card',
      text: `添加${label}`,
      attributes: { type: 'button' }
    });
    btn.addEventListener('click', () => {
      selectedType = type;
      typePicker.querySelectorAll('.template-card').forEach(b => b.classList.remove('is-active'));
      btn.classList.add('is-active');
    });
    typePicker.append(btn);
  }

  const wallPicker = createElement('div', { className: 'wall-picker' });
  for (const [wallId, wallLabel] of WALLS) {
    const wall = createElement('button', {
      className: 'wall-option',
      text: wallLabel,
      testId: `wall-${wallId}`,
      attributes: { type: 'button' }
    });
    wall.addEventListener('click', () => {
      const floor = getAreaFloor();
      const opening = {
        id: globalThis.crypto?.randomUUID?.() ?? `opening-${Date.now()}`,
        type: selectedType,
        wallId,
        wallLabel,
        floor,
        width: selectedType === 'balcony' ? 3.6 : 1.8,
        height: selectedType === 'floorWindow' ? 2.4 : 1.5,
        sillHeight: selectedType === 'floorWindow' ? 0 : 0.9,
        ...(selectedType === 'balcony' ? { balconyDepth: 1.5, hasTopSlab: true } : {})
      };
      store.execute(createAddOpeningCommand(buildingId, areaId, opening));
    });
    wallPicker.append(wall);
  }

  return createElement(
    'div',
    { className: 'opening-layout' },
    typePicker,
    createElement(
      'div',
      { className: 'wall-diagram' },
      createElement('div', { className: 'wall-diagram__core', text: '当前楼层' }),
      wallPicker
    )
  );
}

function buildAreaCard(area, building, buildingId, store) {
  let currentFloor = area.floor;

  const nameInput = createElement('input', {
    className: 'input',
    attributes: { type: 'text', value: area.name, 'aria-label': '区域名称' }
  });
  nameInput.addEventListener('change', () => {
    store.execute(createUpdateObservationAreaCommand(
      buildingId, area.id, { name: nameInput.value.trim() || '观察区域' }
    ));
  });

  const floorSelector = createFloorSelector(
    { floor: area.floor, maxFloor: building.params.floors },
    floor => {
      currentFloor = floor;
      store.execute(createUpdateObservationAreaCommand(buildingId, area.id, { floor }));
    }
  );

  const painter = createAreaPainter(area.cells, cells => {
    store.execute(createUpdateObservationAreaCommand(buildingId, area.id, { cells }));
  });

  const openingListEl = createElement('div', { className: 'opening-list' });
  renderOpenings(area, building.openings ?? [], openingListEl);

  const openingPicker = buildOpeningPicker(
    buildingId, area.id, () => currentFloor, store
  );

  const root = createElement(
    'div',
    { className: 'area-card' },
    createElement(
      'div',
      { className: 'area-card__header' },
      createElement(
        'label',
        { className: 'field' },
        createElement('span', { className: 'field__label', text: '区域名称' }),
        nameInput
      )
    ),
    floorSelector,
    painter,
    createElement('div', { className: 'panel__label', text: '采光口' }),
    openingListEl,
    openingPicker
  );

  return { root, openingListEl };
}

export function createObservationAreaSection({ buildingId, building, store }) {
  const painterMap = new Map();
  const container = createElement('div', { className: 'area-cards-container' });

  function syncAreas(areas, currentBuilding) {
    const areaIds = new Set(areas.map(a => a.id));
    for (const [id, entry] of painterMap) {
      if (!areaIds.has(id)) {
        entry.root.remove();
        painterMap.delete(id);
      }
    }
    for (const area of areas) {
      if (!painterMap.has(area.id)) {
        const card = buildAreaCard(area, currentBuilding, buildingId, store);
        painterMap.set(area.id, card);
      } else {
        renderOpenings(area, currentBuilding.openings ?? [], painterMap.get(area.id).openingListEl);
      }
    }
    container.replaceChildren(...areas.map(a => painterMap.get(a.id).root));
  }

  const addBtn = createElement('button', {
    className: 'button button--secondary',
    text: '＋ 添加观察区',
    attributes: { type: 'button' }
  });
  addBtn.addEventListener('click', () => {
    const b = store.getState().buildings.find(b => b.id === buildingId);
    const count = b?.observationAreas?.length ?? 0;
    store.execute(createAddObservationAreaCommand(buildingId, {
      id: globalThis.crypto?.randomUUID?.() ?? `area-${Date.now()}`,
      name: `观察区 ${count + 1}`,
      floor: 1,
      cells: [],
      openingIds: [],
      sampleHeight: 0
    }));
  });

  const element = createElement(
    'div',
    { className: 'observation-areas-section' },
    createElement(
      'div',
      { className: 'observation-areas-section__header' },
      createElement('span', { className: 'panel__label', text: '观察区域' }),
      addBtn
    ),
    container
  );

  syncAreas(building.observationAreas ?? [], building);

  return {
    element,
    update(updatedBuilding) {
      syncAreas(updatedBuilding.observationAreas ?? [], updatedBuilding);
    }
  };
}
