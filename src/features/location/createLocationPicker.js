import { createElement } from '../../ui/createElement.js';
import { createSetLocationCommand } from '../../store/buildingCommands.js';

const PRESET_CITIES = [
  { cityId: 'beijing', label: '北京', latitude: 39.9042, longitude: 116.4074, timeZone: 'Asia/Shanghai' },
  { cityId: 'shanghai', label: '上海', latitude: 31.2304, longitude: 121.4737, timeZone: 'Asia/Shanghai' },
  { cityId: 'guangzhou', label: '广州', latitude: 23.1291, longitude: 113.2644, timeZone: 'Asia/Shanghai' },
  { cityId: 'shenzhen', label: '深圳', latitude: 22.5431, longitude: 114.0579, timeZone: 'Asia/Shanghai' },
  { cityId: 'chengdu', label: '成都', latitude: 30.5728, longitude: 104.0668, timeZone: 'Asia/Shanghai' },
  { cityId: 'hangzhou', label: '杭州', latitude: 30.2741, longitude: 120.1551, timeZone: 'Asia/Shanghai' },
  { cityId: 'chongqing', label: '重庆', latitude: 29.4316, longitude: 106.9123, timeZone: 'Asia/Shanghai' },
  { cityId: 'wuhan', label: '武汉', latitude: 30.5928, longitude: 114.3055, timeZone: 'Asia/Shanghai' },
  { cityId: 'xian', label: '西安', latitude: 34.3416, longitude: 108.9398, timeZone: 'Asia/Shanghai' },
  { cityId: 'nanjing', label: '南京', latitude: 32.0603, longitude: 118.7969, timeZone: 'Asia/Shanghai' },
  { cityId: 'harbin', label: '哈尔滨', latitude: 45.8038, longitude: 126.5349, timeZone: 'Asia/Shanghai' },
  { cityId: 'custom', label: '自定义坐标', latitude: 0, longitude: 0, timeZone: 'Asia/Shanghai' }
];

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
      latInput.hidden = false;
      lonInput.hidden = false;
      return;
    }
    latInput.hidden = true;
    lonInput.hidden = true;
    commit(citySelect.value, preset.latitude, preset.longitude);
  });

  function onCustomChange() {
    if (citySelect.value !== 'custom') return;
    commit('custom', latInput.value || 0, lonInput.value || 0);
  }
  latInput.addEventListener('change', onCustomChange);
  lonInput.addEventListener('change', onCustomChange);

  const element = createElement('div', { className: 'location-picker field', testId: 'location-picker' },
    createElement('span', { className: 'field__label', text: '地点' }),
    citySelect,
    latInput,
    lonInput
  );

  function update(project) {
    const loc = project.location ?? {};
    const known = PRESET_CITIES.some(c => c.cityId === loc.cityId);
    citySelect.value = known ? loc.cityId : 'custom';
    const custom = citySelect.value === 'custom';
    latInput.hidden = !custom;
    lonInput.hidden = !custom;
    if (document.activeElement !== latInput) latInput.value = String(loc.latitude ?? 0);
    if (document.activeElement !== lonInput) lonInput.value = String(loc.longitude ?? 0);
  }

  return { element, update };
}
