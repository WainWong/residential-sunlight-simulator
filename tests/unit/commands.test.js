import { expect, it } from 'vitest';
import { createDefaultProject } from '../../src/domain/project/defaultProject.js';
import { createPatchCommand } from '../../src/store/commands.js';

it('creates reusable top-level patch commands', () => {
  const command = createPatchCommand('重命名项目', { name: '冬至测试' });
  const next = command.apply(createDefaultProject());

  expect(command.label).toBe('重命名项目');
  expect(next.name).toBe('冬至测试');
});
