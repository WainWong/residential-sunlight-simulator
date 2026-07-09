// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { createLocationPicker } from '../../src/features/location/createLocationPicker.js';
import { createDefaultProject } from '../../src/domain/project/defaultProject.js';

const q = (el, id) => el.querySelector(`[data-testid="${id}"]`);

describe('createLocationPicker', () => {
  it('dispatches a preset city location on select', () => {
    const store = { execute: vi.fn(), getState: () => createDefaultProject() };
    const { element, update } = createLocationPicker({ store });
    update(createDefaultProject());
    const select = q(element, 'location-city');
    select.value = 'beijing';
    select.dispatchEvent(new Event('change'));
    const cmd = store.execute.mock.calls.at(-1)[0];
    expect(cmd.label).toBe('修改项目位置');
    const loc = cmd.apply(createDefaultProject()).location;
    expect(loc.cityId).toBe('beijing');
    expect(loc.label).toBe('北京');
    expect(loc.latitude).toBeCloseTo(39.9042);
    expect(loc.timeZone).toBe('Asia/Shanghai');
  });

  it('reflects the current cityId', () => {
    const project = createDefaultProject();
    project.location = { cityId: 'shanghai', label: '上海', latitude: 31.2304, longitude: 121.4737, timeZone: 'Asia/Shanghai' };
    const store = { execute: vi.fn(), getState: () => project };
    const { element, update } = createLocationPicker({ store });
    update(project);
    expect(q(element, 'location-city').value).toBe('shanghai');
  });

  it('commits a custom-coordinate location on lat change', () => {
    const store = { execute: vi.fn(), getState: () => createDefaultProject() };
    const { element, update } = createLocationPicker({ store });
    update(createDefaultProject());
    const select = q(element, 'location-city');
    select.value = 'custom';
    select.dispatchEvent(new Event('change'));
    const lat = q(element, 'location-lat');
    const lon = q(element, 'location-lon');
    lat.value = '29.5';
    lon.value = '106.5';
    lat.dispatchEvent(new Event('change'));
    const cmd = store.execute.mock.calls.at(-1)[0];
    expect(cmd.label).toBe('修改项目位置');
    const loc = cmd.apply(createDefaultProject()).location;
    expect(loc).toEqual({
      cityId: 'custom',
      label: '自定义坐标',
      latitude: 29.5,
      longitude: 106.5,
      timeZone: 'Asia/Shanghai'
    });
  });
});
