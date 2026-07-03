import { describe, expect, it } from 'vitest';
import { createDefaultProject } from '../../src/domain/project/defaultProject.js';
import { serializeProject } from '../../src/features/project/exportProject.js';
import { parseProject } from '../../src/features/project/importProject.js';
import { clearDraft, loadDraft, saveDraft } from '../../src/features/project/localDraft.js';

describe('project files', () => {
  it('round-trips a valid project', () => {
    const project = createDefaultProject();

    expect(parseProject(serializeProject(project))).toEqual(project);
  });

  it('rejects invalid JSON without returning partial state', () => {
    expect(() => parseProject('{broken')).toThrow('项目文件不是有效的 JSON');
  });

  it('rejects structurally invalid projects', () => {
    expect(() => parseProject(JSON.stringify({ schemaVersion: 1 })))
      .toThrow('项目文件校验失败');
  });
});

describe('local drafts', () => {
  it('saves, loads, and clears a draft through the supplied storage', () => {
    const values = new Map();
    const storage = {
      setItem: (key, value) => values.set(key, value),
      getItem: key => values.get(key) ?? null,
      removeItem: key => values.delete(key)
    };
    const project = createDefaultProject();

    saveDraft(project, storage);
    expect(loadDraft(storage)).toEqual(project);
    clearDraft(storage);
    expect(loadDraft(storage)).toBeNull();
  });
});
