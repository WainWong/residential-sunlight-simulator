import { expect, it, vi } from 'vitest';
import { createSimulationController } from '../../src/features/results/createSimulationController.js';

it('publishes solar results when time changes', () => {
  const controller = createSimulationController();
  const listener = vi.fn();
  controller.subscribe(listener);

  controller.setTime('12:00');

  expect(controller.getState().time).toBe('12:00');
  expect(controller.getState().hasDirectSun).toBe(true);
  expect(controller.getState().solar.altitudeDeg).toBeGreaterThan(0);
  expect(listener).toHaveBeenCalledOnce();
});
