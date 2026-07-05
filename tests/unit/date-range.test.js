import { describe, expect, it } from 'vitest';
import {
  dateToDayIndex,
  daysInDateYear,
  dayIndexToDate
} from '../../src/features/timeline/dateRange.js';

describe('annual date range', () => {
  it('reports the number of days in normal and leap years', () => {
    expect(daysInDateYear('2025-06-01')).toBe(365);
    expect(daysInDateYear('2024-06-01')).toBe(366);
  });

  it('maps January 1 to day index zero', () => {
    expect(dateToDayIndex('2026-01-01')).toBe(0);
    expect(dateToDayIndex('2024-02-29')).toBe(59);
  });

  it('wraps positive and negative day indexes within the anchor year', () => {
    expect(dayIndexToDate('2026-06-15', 365)).toBe('2026-01-01');
    expect(dayIndexToDate('2026-06-15', -1)).toBe('2026-12-31');
    expect(dayIndexToDate('2024-06-15', 366)).toBe('2024-01-01');
    expect(dayIndexToDate('2024-06-15', -1)).toBe('2024-12-31');
  });

  it('rejects invalid ISO dates with a clear Chinese error', () => {
    expect(() => daysInDateYear('2026-02-30')).toThrow('无效的 ISO 日期');
    expect(() => dateToDayIndex('not-a-date')).toThrow('无效的 ISO 日期');
    expect(() => dayIndexToDate('2026-13-01', 0)).toThrow('无效的 ISO 日期');
  });
});

import { vi } from 'vitest';
import { createPlayback } from '../../src/features/timeline/usePlayback.js';

it('stops an active playback when requested', () => {
  vi.useFakeTimers();
  let value = 0;
  const playback = createPlayback({
    read: () => value,
    write: next => { value = next; },
    min: 0,
    max: 4,
    intervalMs: 100
  });
  playback.toggle();
  playback.stop();
  vi.advanceTimersByTime(300);
  expect(value).toBe(0);
  vi.useRealTimers();
});
