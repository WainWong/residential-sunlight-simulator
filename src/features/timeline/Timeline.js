import { createElement } from '../../ui/createElement.js';
import { minuteToTime } from '../results/createSimulationController.js';
import { createPlayback } from './usePlayback.js';

export function createTimeline(controller) {
  const playback = createPlayback(controller);
  const play = createElement('button', {
    className: 'timeline__play',
    text: '▶',
    attributes: { type: 'button', 'aria-label': '播放一天', 'data-primary-control': '' }
  });
  const timeInput = createElement('input', {
    className: 'timeline__time-input',
    attributes: {
      type: 'time',
      value: controller.getState().time,
      'aria-label': '时间'
    }
  });
  const range = createElement('input', {
    className: 'timeline__range',
    attributes: {
      type: 'range',
      min: '418',
      max: '1064',
      step: '1',
      value: String(controller.getState().minute),
      'aria-label': '一天时间轴'
    }
  });
  const current = createElement('strong', {
    text: controller.getState().time,
    testId: 'current-time'
  });

  function setTime(time) {
    controller.setTime(time);
  }
  timeInput.addEventListener('input', () => setTime(timeInput.value));
  range.addEventListener('input', () => setTime(minuteToTime(Number(range.value))));
  play.addEventListener('click', () => {
    const playing = playback.toggle();
    play.textContent = playing ? 'Ⅱ' : '▶';
    play.setAttribute('aria-label', playing ? '暂停播放' : '播放一天');
  });
  controller.subscribe(state => {
    current.textContent = state.time;
    timeInput.value = state.time;
    range.value = String(state.minute);
  });

  return createElement(
    'section',
    { className: 'timeline' },
    play,
    createElement(
      'div',
      { className: 'timeline__track-wrap' },
      createElement(
        'div',
        { className: 'timeline__labels' },
        createElement('span', { text: '06:58' }),
        current,
        createElement('span', { text: '17:44' })
      ),
      range
    ),
    timeInput
  );
}
