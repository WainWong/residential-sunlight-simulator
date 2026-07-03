import { describe, expect, it } from 'vitest';
import { getDaylightWindow } from '../../src/domain/solar/getDaylightWindow.js';
import { getSolarPosition } from '../../src/domain/solar/getSolarPosition.js';

const SHENZHEN = {
  latitude: 22.5431,
  longitude: 114.0579,
  timeZone: 'Asia/Shanghai'
};

describe('solar calculations', () => {
  it('places Shenzhen winter-solstice noon sun in the southern sky', () => {
    const result = getSolarPosition({
      ...SHENZHEN,
      localDate: '2026-12-21',
      localTime: '12:00'
    });

    expect(result.altitudeDeg).toBeGreaterThan(40);
    expect(result.azimuthDeg).toBeGreaterThan(160);
    expect(result.azimuthDeg).toBeLessThan(200);
    expect(result.direction.y).toBeGreaterThan(0);
  });

  it('returns a normalized east-up-north direction', () => {
    const { direction } = getSolarPosition({
      ...SHENZHEN,
      localDate: '2026-06-21',
      localTime: '09:00'
    });
    const length = Math.hypot(direction.x, direction.y, direction.z);

    expect(length).toBeCloseTo(1, 8);
    expect(direction.x).toBeGreaterThan(0);
  });

  it('reports a local daylight window on the requested date', () => {
    const result = getDaylightWindow({
      ...SHENZHEN,
      localDate: '2026-12-21'
    });

    expect(result.sunriseMinute).toBeGreaterThan(360);
    expect(result.sunriseMinute).toBeLessThan(480);
    expect(result.sunsetMinute).toBeGreaterThan(1020);
    expect(result.sunsetMinute).toBeLessThan(1140);
  });
});
