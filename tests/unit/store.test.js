import { describe, expect, it, vi } from 'vitest';
import { createDefaultProject } from '../../src/domain/project/defaultProject.js';
import { createStore } from '../../src/store/createStore.js';

describe('project command store', () => {
  it('notifies once and can undo and redo a named command', () => {
    const store = createStore(createDefaultProject());
    const listener = vi.fn();
    store.subscribe(listener);

    store.execute({
      label: '重命名项目',
      apply: state => ({ ...state, name: '阳光项目' })
    });
    expect(store.getState().name).toBe('阳光项目');

    store.undo();
    expect(store.getState().name).toBe('未命名项目');

    store.redo();
    expect(store.getState().name).toBe('阳光项目');
    expect(listener).toHaveBeenCalledTimes(3);
  });

  it('does not add camera-only view updates to undo history', () => {
    const store = createStore(createDefaultProject());
    store.setView({ camera: { x: 3, y: 8, z: 12 } });

    expect(store.getState().view.camera).toEqual({ x: 3, y: 8, z: 12 });
    expect(store.undo()).toBe(false);
  });

  it('ignores results from an older analysis request', () => {
    const store = createStore(createDefaultProject());
    const first = store.beginAnalysis();
    const second = store.beginAnalysis();

    expect(store.completeAnalysis(first, { intervals: [] })).toBe(false);
    expect(store.completeAnalysis(second, { intervals: [{ startMinute: 540, endMinute: 600 }] })).toBe(true);
    expect(store.getAnalysis().intervals).toHaveLength(1);
  });

  it('unsubscribes listeners cleanly', () => {
    const store = createStore(createDefaultProject());
    const listener = vi.fn();
    const unsubscribe = store.subscribe(listener);

    unsubscribe();
    store.setView({ activePanel: 'results' });

    expect(listener).not.toHaveBeenCalled();
  });
});
