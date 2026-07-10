export function createInteriorLightController({ analyze, onMasks, throttleMs = 100, schedule = setTimeout }) {
  let seq = 0;
  let latest = 0;
  let timer = null;
  let queued = null;

  function fire(payload) {
    seq += 1;
    const mine = seq;
    latest = mine;
    Promise.resolve(analyze(payload)).then(result => {
      if (mine !== latest) return; // stale response, drop it
      onMasks(result?.masks ?? {});
    }).catch(() => {});
  }

  function request(payload) {
    if (throttleMs <= 0) { fire(payload); return; }
    queued = payload;
    if (timer) return;
    timer = schedule(() => {
      timer = null;
      const p = queued; queued = null;
      if (p) fire(p);
    }, throttleMs);
  }

  return {
    request,
    dispose() {
      if (timer) clearTimeout(timer);
      latest = -1;
    }
  };
}
