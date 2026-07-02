function directState(value) {
  return typeof value === 'boolean' ? value : Boolean(value?.hasDirectSun);
}

function refineBoundary(previousMinute, currentMinute, nextState, evaluate) {
  for (let minute = previousMinute + 1; minute <= currentMinute; minute += 1) {
    if (directState(evaluate(minute)) === nextState) return minute;
  }
  return currentMinute;
}

export function analyzeDay({
  startMinute,
  endMinute,
  coarseStep = 5,
  evaluate
}) {
  if (endMinute <= startMinute) {
    return { intervals: [], totalMinutes: 0, samples: [] };
  }

  const sampleMinutes = [];
  for (let minute = startMinute; minute <= endMinute; minute += coarseStep) {
    sampleMinutes.push(minute);
  }
  if (sampleMinutes.at(-1) !== endMinute) sampleMinutes.push(endMinute);

  const samples = sampleMinutes.map(minute => ({
    minute,
    direct: directState(evaluate(minute))
  }));
  const intervals = [];
  let intervalStart = samples[0].direct ? startMinute : null;

  for (let index = 1; index < samples.length; index += 1) {
    const previous = samples[index - 1];
    const current = samples[index];
    if (previous.direct === current.direct) continue;

    const boundary = refineBoundary(
      previous.minute,
      current.minute,
      current.direct,
      evaluate
    );
    if (current.direct) {
      intervalStart = boundary;
    } else if (intervalStart != null) {
      intervals.push({ startMinute: intervalStart, endMinute: boundary });
      intervalStart = null;
    }
  }

  if (intervalStart != null) {
    intervals.push({ startMinute: intervalStart, endMinute });
  }

  return {
    intervals,
    totalMinutes: intervals.reduce(
      (total, interval) => total + interval.endMinute - interval.startMinute,
      0
    ),
    samples
  };
}
