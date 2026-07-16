export function createAnalysisClient(
  workerFactory = () => new Worker(
    new URL('./dailyAnalysis.worker.js', import.meta.url),
    { type: 'module' }
  )
) {
  const worker = workerFactory();
  const pending = new Map();
  let nextRequestId = 0;
  let failure = null;

  function rejectPending(error) {
    for (const request of pending.values()) request.reject(error);
    pending.clear();
  }

  function removeListeners() {
    worker.removeEventListener('message', onMessage);
    worker.removeEventListener('error', onError);
    worker.removeEventListener('messageerror', onMessageError);
  }

  function failWorker(error) {
    if (failure) return;
    failure = error;
    rejectPending(error);
    removeListeners();
    worker.terminate();
  }

  function onMessage(event) {
    const { type, requestId, result, message } = event.data ?? {};
    const request = pending.get(requestId);
    if (!request) return;
    pending.delete(requestId);
    if (type === 'result') request.resolve(result);
    else request.reject(new Error(message || '全天分析返回了无效响应'));
  }

  function onError(event) {
    failWorker(new Error(event?.message || '全天分析 Worker 运行失败'));
  }

  function onMessageError() {
    failWorker(new Error('全天分析 Worker 无法解析消息'));
  }

  worker.addEventListener('message', onMessage);
  worker.addEventListener('error', onError);
  worker.addEventListener('messageerror', onMessageError);

  return {
    analyze(payload) {
      if (failure) return Promise.reject(failure);
      nextRequestId += 1;
      const requestId = nextRequestId;
      const promise = new Promise((resolve, reject) => {
        pending.set(requestId, { resolve, reject });
      });
      try {
        worker.postMessage({ type: 'analyze', requestId, ...structuredClone(payload) });
      } catch (error) {
        const request = pending.get(requestId);
        pending.delete(requestId);
        request.reject(error);
      }
      return promise;
    },

    dispose() {
      failWorker(new Error('全天分析已取消'));
    }
  };
}
