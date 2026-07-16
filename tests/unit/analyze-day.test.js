import { describe, expect, it, vi } from 'vitest';
import { analyzeDay } from '../../src/domain/simulation/analyzeDay.js';
import { createAnalysisClient } from '../../src/workers/createAnalysisClient.js';

describe('daily interval analysis', () => {
  it('refines state changes to one-minute boundaries', () => {
    const result = analyzeDay({
      startMinute: 360,
      endMinute: 1080,
      coarseStep: 5,
      evaluate: minute => minute >= 552 && minute < 878
    });

    expect(result.intervals).toEqual([{ startMinute: 552, endMinute: 878 }]);
    expect(result.totalMinutes).toBe(326);
  });

  it('keeps separate direct-sun periods', () => {
    const result = analyzeDay({
      startMinute: 360,
      endMinute: 720,
      coarseStep: 5,
      evaluate: minute => (minute >= 400 && minute < 460) || (minute >= 600 && minute < 630)
    });

    expect(result.intervals).toEqual([
      { startMinute: 400, endMinute: 460 },
      { startMinute: 600, endMinute: 630 }
    ]);
    expect(result.totalMinutes).toBe(90);
  });
});

describe('analysis worker client', () => {
  it('rejects pending and future requests when the worker fails', async () => {
    const listeners = new Map();
    const worker = {
      postMessage: vi.fn(),
      addEventListener: vi.fn((type, listener) => listeners.set(type, listener)),
      removeEventListener: vi.fn(),
      terminate: vi.fn()
    };
    const client = createAnalysisClient(() => worker);
    const first = client.analyze({ localDate: '2026-12-21' });
    const second = client.analyze({ localDate: '2026-06-21' });

    listeners.get('error')({ message: 'worker crashed' });

    await expect(first).rejects.toThrow('worker crashed');
    await expect(second).rejects.toThrow('worker crashed');
    await expect(client.analyze({ localDate: '2027-01-01' })).rejects.toThrow('worker crashed');
    expect(worker.terminate).toHaveBeenCalledOnce();
  });
  it('resolves the request with the matching id and disposes the worker', async () => {
    const listeners = new Map();
    const worker = {
      postMessage: vi.fn(),
      addEventListener: vi.fn((type, listener) => listeners.set(type, listener)),
      removeEventListener: vi.fn(),
      terminate: vi.fn()
    };
    const client = createAnalysisClient(() => worker);
    const pending = client.analyze({ localDate: '2026-12-21' });
    const requestId = worker.postMessage.mock.calls[0][0].requestId;

    listeners.get('message')({
      data: { type: 'result', requestId: requestId + 1, result: { totalMinutes: 0 } }
    });
    listeners.get('message')({
      data: { type: 'result', requestId, result: { totalMinutes: 42 } }
    });

    await expect(pending).resolves.toEqual({ totalMinutes: 42 });
    client.dispose();
    expect(worker.terminate).toHaveBeenCalledOnce();
  });
});
