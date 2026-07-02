import { DateTime } from 'luxon';
import SunCalc from 'suncalc';

const RAD_TO_DEG = 180 / Math.PI;

function localDateTime({ localDate, localTime, timeZone }) {
  const dateTime = DateTime.fromISO(`${localDate}T${localTime}`, { zone: timeZone });
  if (!dateTime.isValid) {
    throw new Error(`无效的当地日期时间：${dateTime.invalidExplanation ?? '未知原因'}`);
  }
  return dateTime;
}

export function getSolarPosition({
  latitude,
  longitude,
  timeZone,
  localDate,
  localTime
}) {
  const dateTime = localDateTime({ localDate, localTime, timeZone });
  const position = SunCalc.getPosition(dateTime.toJSDate(), latitude, longitude);
  const altitudeDeg = position.altitude * RAD_TO_DEG;
  const azimuthDeg = (position.azimuth * RAD_TO_DEG + 180 + 360) % 360;
  const azimuthRad = azimuthDeg / RAD_TO_DEG;
  const horizontal = Math.cos(position.altitude);

  return {
    altitudeDeg,
    azimuthDeg,
    aboveHorizon: position.altitude > 0,
    direction: {
      x: Math.sin(azimuthRad) * horizontal,
      y: Math.sin(position.altitude),
      z: Math.cos(azimuthRad) * horizontal
    }
  };
}
