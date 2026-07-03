import { createElement } from '../../ui/createElement.js';

const TYPES = [
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

export function createOpeningEditor(project, onChange) {
  const building = project.buildings[0];
  const area = building.observationAreas[0];
  let selectedType = 'window';
  const summary = createElement('div', {
    className: 'opening-summary',
    text: '先选择采光界面类型，再点击一面外墙。',
    testId: 'opening-summary'
  });
  const typePicker = createElement('div', { className: 'template-picker opening-types' });

  for (const [type, label] of TYPES) {
    const button = createElement('button', {
      className: type === selectedType ? 'template-card is-active' : 'template-card',
      text: `添加${label}`,
      attributes: { type: 'button' }
    });
    button.addEventListener('click', () => {
      selectedType = type;
      typePicker.querySelectorAll('button').forEach(item => item.classList.remove('is-active'));
      button.classList.add('is-active');
    });
    typePicker.append(button);
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
      const label = TYPES.find(([type]) => type === selectedType)[1];
      const opening = {
        id: `opening-${building.openings.length + 1}`,
        type: selectedType,
        wallId,
        wallLabel,
        floor: area.floor,
        width: selectedType === 'balcony' ? 3.6 : 1.8,
        height: selectedType === 'floorWindow' ? 2.4 : 1.5,
        sillHeight: selectedType === 'floorWindow' ? 0 : 0.9,
        balconyDepth: selectedType === 'balcony' ? 1.5 : undefined,
        hasTopSlab: selectedType === 'balcony'
      };
      building.openings.push(opening);
      area.openingIds = [...(area.openingIds ?? []), opening.id];
      building.revision = (building.revision ?? 0) + 1;
      summary.innerHTML = `<strong>${label}</strong><span>${wallLabel} · 第 ${area.floor} 层 · ${opening.width}m × ${opening.height}m</span>`;
      onChange(project);
    });
    wallPicker.append(wall);
  }

  return createElement(
    'section',
    { className: 'wizard-section' },
    createElement('p', { className: 'wizard-kicker', text: 'STEP 4 · OPENINGS' }),
    createElement('h2', { className: 'wizard-heading', text: '阳光从哪里进入？' }),
    createElement('p', {
      className: 'wizard-copy',
      text: '选择采光界面类型，再点选所在外墙。稍后可以继续微调宽度、高度和位置。'
    }),
    typePicker,
    createElement(
      'div',
      { className: 'opening-layout' },
      createElement(
        'div',
        { className: 'wall-diagram' },
        createElement('div', { className: 'wall-diagram__core', text: '当前楼层' }),
        wallPicker
      ),
      summary
    )
  );
}
