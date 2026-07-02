import { getDaylightWindow } from '../domain/solar/getDaylightWindow.js';
import { getSolarPosition } from '../domain/solar/getSolarPosition.js';
import { analyzeDay } from '../domain/simulation/analyzeDay.js';
import { evaluateDirectSun } from '../domain/simulation/evaluateDirectSun.js';

function minuteToTime(minute) {
  const hours = Math.floor(minute / 60).toString().padStart(2, '0');
  const minutes = (minute % 60).toString().padStart(2, '0');
  return `${hours}:${minutes}`;
}

self.addEventListener('message', event => {
  const {
    type,
    requestId,
    location,
    localDate,
    area,
    openings,
    obstacles
  } = event.data ?? {};
  if (type !== 'analyze') return;

  try {
    const daylight = getDaylightWindow({ ...location, localDate });
    const result = analyzeDay({
      startMinute: daylight.sunriseMinute,
      endMinute: daylight.sunsetMinute,
      coarseStep: 5,
      evaluate(minute) {
        const solar = getSolarPosition({
          ...location,
          localDate,
          localTime: minuteToTime(minute)
        });
        return evaluateDirectSun({
          area,
          openings,
          obstacles,
          sunDirection: [solar.direction.x, solar.direction.y, solar.direction.z]
        });
      }
    });
    self.postMessage({ type: 'result', requestId, result });
  } catch (error) {
    self.postMessage({
      type: 'error',
      requestId,
      message: error instanceof Error ? error.message : String(error)
    });
  }
});
