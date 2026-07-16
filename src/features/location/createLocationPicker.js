import { CITY_PRESETS as PRESET_CITIES } from '../../data/cities.js';
import { createElement } from '../../ui/createElement.js';
import { createSetLocationCommand } from '../../store/projectCommands.js';


export function createLocationPicker({ store }) {
  const citySelect = createElement('select', {
    className: 'input', testId: 'location-city',
    attributes: { 'aria-label': '城市' }
  });
  for (const city of PRESET_CITIES) {
    const opt = createElement('option', { text: city.label, attributes: { value: city.cityId } });
    citySelect.append(opt);
  }

  const latInput = createElement('input', {
    className: 'input', testId: 'location-lat',
    attributes: { type: 'number', step: '0.0001', 'aria-label': '纬度' }
  });
  const lonInput = createElement('input', {
    className: 'input', testId: 'location-lon',
    attributes: { type: 'number', step: '0.0001', 'aria-label': '经度' }
  });

  const customWrapper = createElement('div', { testId: 'location-custom', className: 'location-picker__custom' }, latInput, lonInput);

  function commit(cityId, lat, lon) {
    const preset = PRESET_CITIES.find(c => c.cityId === cityId) ?? PRESET_CITIES.find(c => c.cityId === 'custom');
    store.execute(createSetLocationCommand({
      cityId,
      label: preset.label,
      latitude: Number(lat),
      longitude: Number(lon),
      timeZone: preset.timeZone
    }));
  }

  citySelect.addEventListener('change', () => {
    const preset = PRESET_CITIES.find(c => c.cityId === citySelect.value);
    if (citySelect.value === 'custom') {
      customWrapper.hidden = false;
      return;
    }
    customWrapper.hidden = true;
    commit(citySelect.value, preset.latitude, preset.longitude);
  });

  function onCustomChange() {
    if (citySelect.value !== 'custom') return;
    commit('custom', latInput.value || 0, lonInput.value || 0);
  }
  latInput.addEventListener('change', onCustomChange);
  lonInput.addEventListener('change', onCustomChange);

  const confirmBtn = createElement('button', {
    className: 'button button--primary location-picker__confirm',
    text: '确认', testId: 'location-custom-confirm',
    attributes: { type: 'button' }
  });
  confirmBtn.addEventListener('click', onCustomChange);
  customWrapper.append(confirmBtn);

  const element = createElement('div', { className: 'location-picker field', testId: 'location-picker' },
    createElement('span', { className: 'field__label', text: '地点' }),
    citySelect,
    customWrapper
  );

  function update(project) {
    const loc = project.location ?? {};
    const known = PRESET_CITIES.some(c => c.cityId === loc.cityId);
    citySelect.value = known ? loc.cityId : 'custom';
    customWrapper.hidden = citySelect.value !== 'custom';
    if (document.activeElement !== latInput) latInput.value = String(loc.latitude ?? 0);
    if (document.activeElement !== lonInput) lonInput.value = String(loc.longitude ?? 0);
  }

  return { element, update };
}
