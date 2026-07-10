import { describe, it, expect, vi } from 'vitest';
import { createInteriorLightController } from '../../src/features/interior/createInteriorLightController.js';

describe('createInteriorLightController', () => {
  it('drops stale responses, keeping only the latest request', async () => {
    const resolvers = [];
    const analyze = vi.fn(() => new Promise(res => resolvers.push(res)));
    const onMasks = vi.fn();
    const ctrl = createInteriorLightController({ analyze, onMasks, throttleMs: 0 });

    ctrl.request({ tag: 1 });
    ctrl.request({ tag: 2 });
    expect(analyze).toHaveBeenCalledTimes(2);

    resolvers[1]({ masks: { floor: ['b'] } });
    await Promise.resolve();
    resolvers[0]({ masks: { floor: ['a'] } });
    await Promise.resolve();

    expect(onMasks).toHaveBeenCalledTimes(1);
    expect(onMasks).toHaveBeenCalledWith({ floor: ['b'] });
  });
});
