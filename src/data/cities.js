export const CITY_PRESETS = Object.freeze([
  { id: 'shenzhen', name: '深圳', latitude: 22.5431, longitude: 114.0579, timeZone: 'Asia/Shanghai' },
  { id: 'guangzhou', name: '广州', latitude: 23.1291, longitude: 113.2644, timeZone: 'Asia/Shanghai' },
  { id: 'shanghai', name: '上海', latitude: 31.2304, longitude: 121.4737, timeZone: 'Asia/Shanghai' },
  { id: 'beijing', name: '北京', latitude: 39.9042, longitude: 116.4074, timeZone: 'Asia/Shanghai' },
  { id: 'hong-kong', name: '香港', latitude: 22.3193, longitude: 114.1694, timeZone: 'Asia/Hong_Kong' }
]);

export function findCities(query) {
  const normalized = query.trim().toLocaleLowerCase('zh-CN');
  if (!normalized) return CITY_PRESETS;
  return CITY_PRESETS.filter(city =>
    city.name.toLocaleLowerCase('zh-CN').includes(normalized) ||
    city.id.includes(normalized)
  );
}
