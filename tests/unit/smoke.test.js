import { describe, expect, it } from 'vitest';
import { APP_NAME } from '../../src/main.js';
import { createDefaultProject } from '../../src/domain/project/defaultProject.js';

describe('application defaults', () => {
  it('starts as an empty persistent sandbox', () => {
    const project = createDefaultProject();
    expect(APP_NAME).toBe('日照 · 住宅采光模拟器');
    expect(project.buildings).toEqual([]);
    expect(project.view.selectedBuildingId).toBeNull();
    expect(project.view.editorMode).toBe('none');
  });
});
