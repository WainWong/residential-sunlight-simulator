import { migrateProject } from '../../domain/project/migrateProject.js';
import { validateProject } from '../../domain/project/validateProject.js';

export function parseProject(text) {
  let raw;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new Error('项目文件不是有效的 JSON');
  }
  const project = migrateProject(raw);
  const validation = validateProject(project);
  if (!validation.ok) {
    throw new Error(`项目文件校验失败：${validation.errors.join('；')}`);
  }
  return project;
}

export async function readProjectFile(file) {
  return parseProject(await file.text());
}
