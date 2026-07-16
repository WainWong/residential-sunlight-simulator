import { parseProject } from './importProject.js';
import { serializeProject } from './exportProject.js';

const DRAFT_KEY = 'residential-sunlight-simulator:draft:v2';
const LEGACY_DRAFT_KEY = 'residential-sunlight-simulator:draft:v1';

export function saveDraft(project, storage = localStorage) {
  storage.setItem(DRAFT_KEY, serializeProject(project));
}

export function loadDraft(storage = localStorage) {
  const key = storage.getItem(DRAFT_KEY) ? DRAFT_KEY : LEGACY_DRAFT_KEY;
  const text = storage.getItem(key);
  if (!text) return null;
  try {
    const project = parseProject(text);
    if (key === LEGACY_DRAFT_KEY) {
      storage.setItem(DRAFT_KEY, serializeProject(project));
      storage.removeItem(LEGACY_DRAFT_KEY);
    }
    return project;
  } catch {
    storage.removeItem(key);
    return null;
  }
}

export function clearDraft(storage = localStorage) {
  storage.removeItem(DRAFT_KEY);
  storage.removeItem(LEGACY_DRAFT_KEY);
}
