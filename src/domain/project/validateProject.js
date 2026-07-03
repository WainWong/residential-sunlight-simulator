const BUILDING_TEMPLATES = new Set(['bar', 'lShape', 'courtyard']);
const OPENING_TYPES = new Set(['window', 'floorWindow', 'balcony']);

function isFiniteInRange(value, minimum, maximum) {
  return Number.isFinite(value) && value >= minimum && value <= maximum;
}

function validateBuilding(building, errors, ids) {
  const label = building?.name?.trim() || '未命名建筑';
  if (!building?.id) {
    errors.push(`${label} 缺少建筑 ID`);
  } else if (ids.has(building.id)) {
    errors.push(`建筑 ID 不能重复：${building.id}`);
  } else {
    ids.add(building.id);
  }

  if (!BUILDING_TEMPLATES.has(building?.template)) {
    errors.push(`${label} 的建筑模板不受支持`);
  }

  const { position = {}, params = {} } = building ?? {};
  if (!Number.isFinite(position.x) || !Number.isFinite(position.z)) {
    errors.push(`${label} 的位置必须是有限数值`);
  }
  if (!Number.isFinite(building?.rotation)) {
    errors.push(`${label} 的旋转角度必须是有限数值`);
  }
  if (!isFiniteInRange(params.length, 0.1, 1000)) {
    errors.push(`${label} 的建筑长度必须在 0.1–1000 米之间`);
  }
  if (!isFiniteInRange(params.depth, 0.1, 1000)) {
    errors.push(`${label} 的建筑进深必须在 0.1–1000 米之间`);
  }
  if (!Number.isInteger(params.floors) || !isFiniteInRange(params.floors, 1, 200)) {
    errors.push(`${label} 的楼层数必须是 1–200 的整数`);
  }
  if (!isFiniteInRange(params.floorHeight, 2, 10)) {
    errors.push(`${label} 的标准层高必须在 2–10 米之间`);
  }
  if (params.firstFloorHeight != null && !isFiniteInRange(params.firstFloorHeight, 2, 15)) {
    errors.push(`${label} 的首层层高必须在 2–15 米之间`);
  }

  const openingIds = new Set();
  for (const opening of building?.openings ?? []) {
    if (!opening?.id || openingIds.has(opening.id)) {
      errors.push(`${label} 的采光界面 ID 缺失或重复`);
    } else {
      openingIds.add(opening.id);
    }
    if (!OPENING_TYPES.has(opening?.type)) {
      errors.push(`${label} 的采光界面类型不受支持`);
    }
  }
}

export function validateProject(project) {
  const errors = [];
  if (!project || typeof project !== 'object') {
    return { ok: false, errors: ['项目内容必须是对象'] };
  }
  if (project.schemaVersion !== 1) {
    errors.push('项目版本必须为 1');
  }
  if (!Array.isArray(project.buildings)) {
    errors.push('建筑列表必须是数组');
  }
  if (!isFiniteInRange(project.location?.latitude, -90, 90)) {
    errors.push('纬度必须在 -90–90 度之间');
  }
  if (!isFiniteInRange(project.location?.longitude, -180, 180)) {
    errors.push('经度必须在 -180–180 度之间');
  }
  if (typeof project.location?.timeZone !== 'string' || !project.location.timeZone.includes('/')) {
    errors.push('时区必须使用 IANA 时区名称');
  }

  const buildingIds = new Set();
  for (const building of Array.isArray(project.buildings) ? project.buildings : []) {
    validateBuilding(building, errors, buildingIds);
  }

  return { ok: errors.length === 0, errors };
}
