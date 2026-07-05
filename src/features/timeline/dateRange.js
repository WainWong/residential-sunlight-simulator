import { DateTime } from 'luxon';

function parseIsoDate(date) {
  const parsed = DateTime.fromISO(date, { setZone: true });
  if (!parsed.isValid) {
    throw new Error(`无效的 ISO 日期：${date}`);
  }
  return parsed;
}

export function daysInDateYear(date) {
  return parseIsoDate(date).daysInYear;
}

export function dateToDayIndex(date) {
  return parseIsoDate(date).ordinal - 1;
}

export function dayIndexToDate(anchorDate, index) {
  const anchor = parseIsoDate(anchorDate);
  const daysInYear = anchor.daysInYear;
  const wrappedIndex = ((index % daysInYear) + daysInYear) % daysInYear;
  return anchor.startOf('year').plus({ days: wrappedIndex }).toISODate();
}
