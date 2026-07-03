import { CITY_PRESETS, findCities } from '../../data/cities.js';
import { createElement } from '../../ui/createElement.js';

function labeledInput(labelText, input) {
  const id = `field-${labelText}`;
  input.id = id;
  return createElement(
    'label',
    { className: 'field', attributes: { for: id } },
    createElement('span', { className: 'field__label', text: labelText }),
    input
  );
}

export function createLocationEditor(location, onChange) {
  let selected = { ...location };
  const cityInput = createElement('input', {
    className: 'input',
    attributes: {
      type: 'search',
      value: CITY_PRESETS.find(city => city.id === selected.cityId)?.name ?? '',
      autocomplete: 'off',
      'aria-label': '城市'
    }
  });
  const options = createElement('div', {
    className: 'city-options',
    attributes: { role: 'listbox', 'aria-label': '城市选项' }
  });

  function renderOptions(query = '') {
    options.replaceChildren();
    for (const city of findCities(query)) {
      const option = createElement('button', {
        className: 'city-option',
        text: city.name,
        attributes: { type: 'button', role: 'option' }
      });
      option.addEventListener('click', () => {
        selected = { ...city, cityId: city.id };
        cityInput.value = city.name;
        options.replaceChildren();
        onChange(selected);
      });
      options.append(option);
    }
  }

  cityInput.addEventListener('input', () => renderOptions(cityInput.value));
  cityInput.addEventListener('focus', () => renderOptions(cityInput.value));

  const manualFields = createElement('div', { className: 'manual-location', attributes: { hidden: '' } });
  const manualButton = createElement('button', {
    className: 'text-button',
    text: '手动填写经纬度',
    attributes: { type: 'button' }
  });
  manualButton.addEventListener('click', () => {
    manualFields.hidden = !manualFields.hidden;
    manualButton.textContent = manualFields.hidden ? '手动填写经纬度' : '收起手动设置';
  });

  for (const [label, key, type] of [
    ['纬度', 'latitude', 'number'],
    ['经度', 'longitude', 'number'],
    ['时区', 'timeZone', 'text']
  ]) {
    const input = createElement('input', {
      className: 'input',
      attributes: {
        type,
        value: String(selected[key]),
        step: type === 'number' ? '0.0001' : undefined,
        'aria-label': label
      }
    });
    input.addEventListener('change', () => {
      selected = {
        ...selected,
        [key]: type === 'number' ? Number(input.value) : input.value
      };
      onChange(selected);
    });
    manualFields.append(labeledInput(label, input));
  }

  return createElement(
    'section',
    { className: 'wizard-section' },
    createElement('p', { className: 'wizard-kicker', text: 'STEP 1 · LOCATION' }),
    createElement('h2', { className: 'wizard-heading', text: '这栋住宅在哪里？' }),
    createElement('p', {
      className: 'wizard-copy',
      text: '地点用于计算当地太阳轨迹。常用城市数据内置在网页中，不会上传你的位置信息。'
    }),
    createElement(
      'div',
      { className: 'city-search' },
      labeledInput('城市', cityInput),
      options
    ),
    manualButton,
    manualFields
  );
}
