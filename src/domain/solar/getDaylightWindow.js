import { DateTime } from 'luxon';
import SunCalc from 'suncalc';

function minuteOfDay(date, timeZone) {
  const local = DateTime.fromJSDate(date).setZone(timeZone);
  return local.hour * 60 + local.minute;
}

export function getDaylightWindow({
  latitude,
  longitude,
  timeZone,
  localDate
}) {
  const noon = DateTime.fromISO(`${localDate}T12:00`, { zone: timeZone });
  if (!noon.isValid) {
    throw new Error(`无效的日期：${localDate}`);
  }
  const times = SunCalc.getTimes(noon.toJSDate(), latitude, longitude);

  return {
    sunriseMinute: minuteOfDay(times.sunrise, timeZone),
    sunsetMinute: minuteOfDay(times.sunset, timeZone),
    sunrise: DateTime.fromJSDate(times.sunrise).setZone(timeZone).toFormat('HH:mm'),
    sunset: DateTime.fromJSDate(times.sunset).setZone(timeZone).toFormat('HH:mm')
  };
}
