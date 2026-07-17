import { describe, expect, it } from 'vitest';
import { APP_NAME } from '../../src/main.js';
import { createDefaultProject } from '../../src/domain/project/defaultProject.js';

describe('application defaults', () => {
  it('starts as an empty room-first sandbox', () => {
    const project = createDefaultProject();
    expect(APP_NAME).toBe('日照 · 住宅采光模拟器');
    expect(project.schemaVersion).toBe(2);
    expect(project.buildings).toEqual([]);
    expect(project.view).toMatchObject({ phase: 'building', selection: null, roomEditing: null, interiorRoomId: null });
  });
});
