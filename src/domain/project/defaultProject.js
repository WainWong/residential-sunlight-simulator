const fallbackId = () => `project-${Date.now().toString(36)}`;

export function createDefaultProject() {
  return {
    schemaVersion: 1,
    id: globalThis.crypto?.randomUUID?.() ?? fallbackId(),
    name: '未命名项目',
    location: {
      cityId: 'shenzhen',
      latitude: 22.5431,
      longitude: 114.0579,
      timeZone: 'Asia/Shanghai'
    },
    buildings: [],
    simulation: {
      date: '2026-12-21',
      time: '09:30',
      activeAreaId: null,
      sampleHeight: 0
    },
    view: {
      camera: null,
      activePanel: 'buildings',
      wizardComplete: false,
      selectedBuildingId: null,
      editorMode: 'none',
      addingBuildingId: null,
      areaTool: 'draw',
      areaDraft: null
    }
  };
}
