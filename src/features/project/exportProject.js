function safeFileName(name) {
  const cleaned = name.trim().replace(/[<>:"/\\|?*\u0000-\u001f]/g, '-');
  return cleaned || 'sunlight-project';
}

export function serializeProject(project) {
  return JSON.stringify(project, null, 2);
}

export function downloadProject(project) {
  const blob = new Blob([serializeProject(project)], {
    type: 'application/json;charset=utf-8'
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `${safeFileName(project.name)}.sunlight.json`;
  anchor.click();
  URL.revokeObjectURL(url);
}
