import { getDaylightWindow } from '../../domain/solar/getDaylightWindow.js';
import { createElement } from '../../ui/createElement.js';
import { minuteToTime } from '../results/createSimulationController.js';
import {
  dateToDayIndex,
  dayIndexToDate,
  daysInDateYear
} from './dateRange.js';
import { createPlayback } from './usePlayback.js';

function playButton(label, playback) {
  const button = createElement('button', {
    className: 'timeline__play',
    text: '▶',
    attributes: { type: 'button', 'aria-label': label, 'data-primary-control': '' }
  });
  button.addEventListener('click', () => {
    const playing = playback.toggle();
    button.textContent = playing ? 'Ⅱ' : '▶';
    button.setAttribute('aria-label', playing ? `暂停${label}` : label);
  });
  return button;
}

function timelineRow({ kind, button, range, labels, input }) {
  return createElement(
    'section',
    { className: `timeline timeline--${kind}` },
    button,
    createElement(
      'div',
      { className: 'timeline__track-wrap' },
      createElement(
        'div',
        { className: 'timeline__labels' },
        ...labels.map(text => createElement('span', { text }))
      ),
      range
    ),
    input
  );
}

export function createTimeline(controller) {
  let state = controller.getState();

  const dateRange = createElement('input', {
    className: 'timeline__range timeline__range--date',
    attributes: { type: 'range', min: '0', step: '1', 'aria-label': '全年日期轴' }
  });
  const dateInput = createElement('input', {
    className: 'timeline__date-input',
    attributes: { type: 'date', 'aria-label': '日期' }
  });
  const timeRange = createElement('input', {
    className: 'timeline__range timeline__range--time',
    attributes: { type: 'range', step: '1', 'aria-label': '一天时间轴' }
  });
  const timeInput = createElement('input', {
    className: 'timeline__time-input',
    attributes: { type: 'time', 'aria-label': '时间' }
  });

  const datePlayback = createPlayback({
    read: () => dateToDayIndex(controller.getState().date),
    write: index => controller.setDate(dayIndexToDate(controller.getState().date, index)),
    min: 0,
    max: daysInDateYear(state.date) - 1,
    step: 1,
    intervalMs: 120
  });
  const timePlayback = createPlayback({
    read: () => controller.getState().minute,
    write: minute => controller.setTime(minuteToTime(minute)),
    min: 0,
    max: 1439,
    step: 5,
    intervalMs: 180
  });

  dateRange.addEventListener('input', () => {
    datePlayback.stop();
    controller.setDate(dayIndexToDate(controller.getState().date, Number(dateRange.value)));
  });
  dateInput.addEventListener('input', () => {
    if (dateInput.value) {
      datePlayback.stop();
      controller.setDate(dateInput.value);
    }
  });
  timeRange.addEventListener('input', () => {
    timePlayback.stop();
    controller.setTime(minuteToTime(Number(timeRange.value)));
  });
  timeInput.addEventListener('input', () => {
    timePlayback.stop();
    controller.setTime(timeInput.value);
  });

  function render(next) {
    state = next;
    const daylight = getDaylightWindow({
      ...next.location,
      localDate: next.date
    });
    dateRange.max = String(daysInDateYear(next.date) - 1);
    dateRange.value = String(dateToDayIndex(next.date));
    dateInput.value = next.date;
    timeRange.min = String(daylight.sunriseMinute);
    timeRange.max = String(daylight.sunsetMinute);
    timeRange.value = String(next.minute);
    timeInput.value = next.time;
  }

  controller.subscribe(render);
  render(controller.getState());

  return createElement(
    'div',
    { className: 'timeline-stack', testId: 'timeline' },
    timelineRow({
      kind: 'date',
      button: playButton('播放全年日期', datePlayback),
      range: dateRange,
      labels: ['1 月', '春分', '夏至', '秋分', '12 月'],
      input: dateInput
    }),
    timelineRow({
      kind: 'time',
      button: playButton('播放一天时间', timePlayback),
      range: timeRange,
      labels: ['日出', state.time, '日落'],
      input: timeInput
    })
  );
}
