import { parseProject } from './importProject.js';
import { serializeProject } from './exportProject.js';

const DRAFT_KEY = 'residential-sunlight-simulator:draft:v1';

export function saveDraft(project, storage = localStorage) {
  storage.setItem(DRAFT_KEY, serializeProject(project));
}

export function loadDraft(storage = localStorage) {
  const text = storage.getItem(DRAFT_KEY);
  if (!text) return null;
  try {
    return parseProject(text);
  } catch {
    storage.removeItem(DRAFT_KEY);
    return null;
  }
}

export function clearDraft(storage = localStorage) {
  storage.removeItem(DRAFT_KEY);
}
