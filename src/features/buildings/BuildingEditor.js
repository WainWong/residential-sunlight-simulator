import { BUILDING_TEMPLATES } from '../../domain/buildings/templates.js';
import { createElement } from '../../ui/createElement.js';

const DEFAULTS = {
  bar: { length: 60, depth: 18 },
  lShape: { length: 60, depth: 40, wingLength: 18, wingDepth: 16 },
  courtyard: { length: 60, depth: 40, courtyardLength: 30, courtyardDepth: 16 }
};

function numberField(label, value, onChange) {
  const input = createElement('input', {
    className: 'input',
    attributes: { type: 'number', value: String(value), min: '0.1', step: '0.1', 'aria-label': label }
  });
  input.addEventListener('change', () => onChange(Number(input.value)));
  return createElement(
    'label',
    { className: 'field' },
    createElement('span', { className: 'field__label', text: label }),
    input
  );
}

export function createBuildingEditor(onChange) {
  const buildings = [];
  let selectedTemplate = 'bar';
  let draft = {};
  const list = createElement('div', {
    className: 'wizard-building-list',
    testId: 'wizard-building-list'
  });
  const count = createElement('span', {
    className: 'building-count',
    text: '0 栋建筑',
    testId: 'wizard-building-count'
  });
  const nameInput = createElement('input', {
    className: 'input',
    attributes: { type: 'text', value: '住宅 1', 'aria-label': '建筑名称' }
  });
  const fields = createElement('div', { className: 'building-fields' });

  function renderFields() {
    draft = {
      ...DEFAULTS[selectedTemplate],
      floors: draft.floors ?? 33,
      floorHeight: draft.floorHeight ?? 3,
      x: draft.x ?? 0,
      z: draft.z ?? 0,
      rotation: draft.rotation ?? 0
    };
    fields.replaceChildren(
      numberField('建筑长度', draft.length, value => { draft.length = value; }),
      numberField('建筑进深', draft.depth, value => { draft.depth = value; }),
      numberField('楼层数', draft.floors, value => { draft.floors = value; }),
      numberField('标准层高', draft.floorHeight, value => { draft.floorHeight = value; }),
      numberField('X 位置', draft.x, value => { draft.x = value; }),
      numberField('Z 位置', draft.z, value => { draft.z = value; }),
      numberField('旋转角度', draft.rotation, value => { draft.rotation = value; })
    );
  }

  const templatePicker = createElement('div', {
    className: 'template-picker',
    attributes: { 'aria-label': '建筑模板' }
  });
  for (const [key, template] of Object.entries(BUILDING_TEMPLATES)) {
    const button = createElement('button', {
      className: key === selectedTemplate ? 'template-card is-active' : 'template-card',
      text: template.label,
      attributes: { type: 'button' }
    });
    button.addEventListener('click', () => {
      selectedTemplate = key;
      draft = {};
      templatePicker.querySelectorAll('button').forEach(item => item.classList.remove('is-active'));
      button.classList.add('is-active');
      renderFields();
    });
    templatePicker.append(button);
  }

  const addButton = createElement('button', {
    className: 'button button--primary',
    text: '添加建筑',
    attributes: { type: 'button', 'data-primary-control': '' }
  });
  addButton.addEventListener('click', () => {
    const index = buildings.length + 1;
    const building = {
      id: `building-${index}`,
      revision: 1,
      name: nameInput.value.trim() || `住宅 ${index}`,
      template: selectedTemplate,
      position: { x: draft.x, z: draft.z },
      rotation: draft.rotation,
      params: {
        ...DEFAULTS[selectedTemplate],
        length: draft.length,
        depth: draft.depth,
        floors: Math.round(draft.floors),
        floorHeight: draft.floorHeight
      },
      observationAreas: [],
      openings: []
    };
    buildings.push(building);
    list.append(
      createElement(
        'article',
        { className: 'building-chip' },
        createElement('strong', { text: building.name }),
        createElement('span', { text: BUILDING_TEMPLATES[building.template].label })
      )
    );
    count.textContent = `${buildings.length} 栋建筑`;
    nameInput.value = `住宅 ${index + 1}`;
    onChange(structuredClone(buildings));
  });

  renderFields();
  return createElement(
    'section',
    { className: 'wizard-section' },
    createElement(
      'div',
      { className: 'wizard-title-row' },
      createElement(
        'div',
        {},
        createElement('p', { className: 'wizard-kicker', text: 'STEP 2 · BUILDINGS' }),
        createElement('h2', { className: 'wizard-heading', text: '搭起住宅与周边遮挡' })
      ),
      count
    ),
    createElement('p', {
      className: 'wizard-copy',
      text: '每栋建筑都能设置观察区域，也会参与其他建筑的遮挡计算。'
    }),
    templatePicker,
    createElement(
      'div',
      { className: 'building-form' },
      createElement(
        'label',
        { className: 'field field--wide' },
        createElement('span', { className: 'field__label', text: '建筑名称' }),
        nameInput
      ),
      fields,
      addButton
    ),
    list
  );
}
