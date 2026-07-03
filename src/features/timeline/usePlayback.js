import { minuteToTime } from '../results/createSimulationController.js';

export function createPlayback(controller) {
  let timer = null;
  let speed = 5;

  function stop() {
    if (timer != null) clearInterval(timer);
    timer = null;
  }

  return {
    get playing() {
      return timer != null;
    },
    toggle() {
      if (timer != null) {
        stop();
        return false;
      }
      timer = setInterval(() => {
        const next = controller.getState().minute + speed;
        controller.setTime(minuteToTime(next > 1064 ? 418 : next));
      }, 250);
      return true;
    },
    setSpeed(nextSpeed) {
      speed = nextSpeed;
    },
    dispose: stop
  };
}
