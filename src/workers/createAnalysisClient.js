export function createAnalysisClient(
  workerFactory = () => new Worker(
    new URL('./dailyAnalysis.worker.js', import.meta.url),
    { type: 'module' }
  )
) {
  const worker = workerFactory();
  const pending = new Map();
  let nextRequestId = 0;

  const onMessage = event => {
    const { type, requestId, result, message } = event.data ?? {};
    const request = pending.get(requestId);
    if (!request) return;
    pending.delete(requestId);
    if (type === 'result') request.resolve(result);
    if (type === 'error') request.reject(new Error(message));
  };

  worker.addEventListener('message', onMessage);

  return {
    analyze(payload) {
      nextRequestId += 1;
      const requestId = nextRequestId;
      const promise = new Promise((resolve, reject) => {
        pending.set(requestId, { resolve, reject });
      });
      worker.postMessage({ type: 'analyze', requestId, ...structuredClone(payload) });
      return promise;
    },

    analyzeInterior(payload) {
      nextRequestId += 1;
      const requestId = nextRequestId;
      const promise = new Promise((resolve, reject) => {
        pending.set(requestId, { resolve, reject });
      });
      worker.postMessage({ type: 'analyzeInterior', requestId, ...structuredClone(payload) });
      return promise;
    },

    dispose() {
      worker.removeEventListener('message', onMessage);
      for (const request of pending.values()) {
        request.reject(new Error('全天分析已取消'));
      }
      pending.clear();
      worker.terminate();
    }
  };
}
