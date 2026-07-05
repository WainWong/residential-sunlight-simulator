export function createPlayback({
  read,
  write,
  min,
  max,
  step = 1,
  intervalMs = 250
}) {
  let timer = null;

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
        const next = read() + step;
        write(next > max ? min : next);
      }, intervalMs);
      return true;
    },
    stop,
    dispose: stop
  };
}
