import { DateTime } from 'luxon';
import {
  listBuildingTypeDefinitions,
  validateBuildingParams
} from '../buildings/buildingTypes.js';
import { openingFitsWall, openingsOverlap } from '../openings/openingGeometry.js';
import { validateBuildingRooms } from '../rooms/roomGeometry.js';
import { deriveWalls } from '../walls/deriveWalls.js';
const BUILDING_TEMPLATES = new Set(listBuildingTypeDefinitions().map(type => type.id));
const ROOM_TYPES = new Set([null, 'living', 'bedroom', 'study', 'kitchen', 'balcony', 'other']);
const OPENING_PRESETS = new Set(['window', 'floorWindow', 'doorway', 'parapet', 'custom']);
const OPENING_FILLS = new Set(['glass', 'open']);
const OPENING_STATUSES = new Set(['valid', 'invalid']);

function isFiniteInRange(value, minimum, maximum) {
  return Number.isFinite(value) && value >= minimum && value <= maximum;
}

function sameIds(first = [], second = []) {
  if (first.length !== second.length) return false;
  const expected = new Set(first);
  return second.every(id => expected.has(id));
}

function validateBuilding(building, errors, ids) {
  const label = building?.name?.trim() || '未命名建筑';
  if (!building?.id) errors.push(`${label} 缺少建筑 ID`);
  else if (ids.has(building.id)) errors.push(`建筑 ID 不能重复：${building.id}`);
  else ids.add(building.id);

  const templateSupported = BUILDING_TEMPLATES.has(building?.template);
  if (!templateSupported) errors.push(`${label} 的建筑模板不受支持`);
  const { position = {}, params = {} } = building ?? {};
  if (!Number.isFinite(position.x) || !Number.isFinite(position.z)) errors.push(`${label} 的位置必须是有限数值`);
  if (!Number.isFinite(building?.rotation)) errors.push(`${label} 的旋转角度必须是有限数值`);
  const lengthValid = isFiniteInRange(params.length, 0.1, 1000);
  const depthValid = isFiniteInRange(params.depth, 0.1, 1000);
  const floorsValid = Number.isInteger(params.floors) && isFiniteInRange(params.floors, 1, 200);
  const floorHeightValid = isFiniteInRange(params.floorHeight, 2, 10);
  if (!lengthValid) errors.push(`${label} 的建筑长度必须在 0.1–1000 米之间`);
  if (!depthValid) errors.push(`${label} 的建筑宽度必须在 0.1–1000 米之间`);
  if (!floorsValid) errors.push(`${label} 的楼层数必须是 1–200 的整数`);
  if (!floorHeightValid) errors.push(`${label} 的标准层高必须在 2–10 米之间`);
  if (params.firstFloorHeight != null && !isFiniteInRange(params.firstFloorHeight, 2, 15)) errors.push(`${label} 的首层层高必须在 2–15 米之间`);

  const paramIssues = templateSupported ? validateBuildingParams(building.template, params) : [];
  for (const issue of paramIssues) errors.push(`${label} ${issue}`);
  const geometryReady = templateSupported && lengthValid && depthValid
    && floorsValid && floorHeightValid && paramIssues.length === 0;

  if (!Array.isArray(building?.rooms)) errors.push(`${label} 的房间列表必须是数组`);
  if (!Array.isArray(building?.openings)) errors.push(`${label} 的开口列表必须是数组`);
  const rooms = Array.isArray(building?.rooms) ? building.rooms : [];
  const openings = Array.isArray(building?.openings) ? building.openings : [];
  const entityIds = new Set();
  let roomStructureValid = true;
  for (const room of rooms) {
    if (!room?.id || entityIds.has(room.id)) {
      errors.push(`${label} 的房间 ID 缺失或重复`);
      roomStructureValid = false;
    } else {
      entityIds.add(room.id);
    }
    if (!ROOM_TYPES.has(room?.type ?? null)) errors.push(`${label} 的房间类型不受支持`);
    if (!Number.isInteger(room?.floor) || room.floor < 1 || room.floor > (params.floors ?? 0)) {
      errors.push(`${label} 的房间楼层无效`);
      roomStructureValid = false;
    }
    if (!Array.isArray(room?.rects) || room.rects.length === 0
      || room.rects.some(rect => !Number.isFinite(rect?.x0)
        || !Number.isFinite(rect?.z0) || !Number.isFinite(rect?.x1)
        || !Number.isFinite(rect?.z1) || rect.x1 <= rect.x0 || rect.z1 <= rect.z0)) {
      errors.push(`${label} 的房间轮廓必须是非空、规范化的有限数值矩形数组`);
      roomStructureValid = false;
    }
    if (!Array.isArray(room?.objects)) errors.push(`${label} 的房间对象必须是数组`);
  }

  let roomGeometryValid = roomStructureValid && geometryReady;
  if (roomGeometryValid) {
    const validation = validateBuildingRooms(building);
    if (!validation.ok) {
      errors.push(`${label} 的房间几何无效：${validation.reason}`);
      roomGeometryValid = false;
    }
  }

  const roomById = new Map(rooms.filter(room => room?.id).map(room => [room.id, room]));
  const wallsByFloor = new Map();
  const wallsFor = floor => {
    if (!wallsByFloor.has(floor)) wallsByFloor.set(floor, deriveWalls(building, floor));
    return wallsByFloor.get(floor);
  };
  const validOpenings = [];
  for (const opening of openings) {
    if (!opening?.id || entityIds.has(opening.id)) {
      errors.push(`${label} 的开口 ID 缺失或重复`);
    } else {
      entityIds.add(opening.id);
    }
    if (!OPENING_PRESETS.has(opening?.preset)) errors.push(`${label} 的开口预设不受支持`);
    if (!OPENING_FILLS.has(opening?.fill)) errors.push(`${label} 的开口填充不受支持`);
    if (!OPENING_STATUSES.has(opening?.status)) errors.push(`${label} 的开口状态无效`);
    const isValidOpening = opening?.status === 'valid';
    const allowsUnresolvedGeometry = opening?.status === 'invalid';
    const floorValid = Number.isInteger(opening?.floor)
      && opening.floor >= 1 && opening.floor <= (params.floors ?? 0);
    if (!floorValid) errors.push(`${label} 的开口楼层无效`);
    const connectedRoomIds = opening?.connectedRoomIds;
    const referencesValid = Array.isArray(connectedRoomIds) && connectedRoomIds.length > 0
      && connectedRoomIds.every(id => roomById.get(id)?.floor === opening.floor);
    if (!Array.isArray(connectedRoomIds)
      || (!allowsUnresolvedGeometry && !referencesValid)) {
      errors.push(`${label} 的开口关联房间无效`);
    }
    const anchor = opening?.wallAnchor;
    const anchorIdValid = typeof anchor?.wallId === 'string' && anchor.wallId.length > 0;
    if (!anchor || (!allowsUnresolvedGeometry && !anchorIdValid)) {
      errors.push(`${label} 的开口墙锚点无效`);
    }
    if (!isFiniteInRange(anchor?.centerU, 0, 1)) errors.push(`${label} 的开口墙锚点中心位置无效`);
    const bounds = opening?.bounds ?? {};
    if (!isFiniteInRange(bounds.centerU, 0, 1)) errors.push(`${label} 的开口中心位置无效`);
    if (!(Number.isFinite(bounds.width) && bounds.width > 0
      && Number.isFinite(bounds.bottom) && Number.isFinite(bounds.top)
      && bounds.bottom >= 0 && bounds.top > bounds.bottom
      && bounds.top <= params.floorHeight)) {
      errors.push(`${label} 的开口尺寸无效`);
    }
    if (Number.isFinite(anchor?.centerU) && Number.isFinite(bounds.centerU)
      && Math.abs(anchor.centerU - bounds.centerU) > 1e-6) {
      errors.push(`${label} 的开口中心位置与墙锚点不一致`);
    }

    if (isValidOpening && floorValid && anchorIdValid && roomGeometryValid) {
      const wall = wallsFor(opening.floor).find(candidate => candidate.id === anchor.wallId);
      if (!wall) {
        errors.push(`${label} 的开口墙锚点无法解析`);
      } else if (!openingFitsWall(opening, wall, params.floorHeight)) {
        errors.push(`${label} 的有效开口不适合对应墙面`);
      } else {
        if (!referencesValid || !sameIds(connectedRoomIds, wall.roomIds)) {
          errors.push(`${label} 的开口关联房间与墙面不一致`);
        }
        validOpenings.push({ opening, wall });
      }
    }
  }
  for (let index = 0; index < validOpenings.length; index += 1) {
    const { opening, wall } = validOpenings[index];
    if (validOpenings.slice(index + 1)
      .some(candidate => openingsOverlap(opening, candidate.opening, wall))) {
      errors.push(`${label} 的有效开口不能重叠`);
    }
  }
}

export function validateProject(project) {
  const errors = [];
  if (!project || typeof project !== 'object') return { ok: false, errors: ['项目内容必须是对象'] };
  if (project.schemaVersion !== 2) errors.push('项目版本必须为 2');
  if (!Array.isArray(project.buildings)) errors.push('建筑列表必须是数组');
  if (!isFiniteInRange(project.location?.latitude, -90, 90)) errors.push('纬度必须在 -90–90 度之间');
  if (!isFiniteInRange(project.location?.longitude, -180, 180)) errors.push('经度必须在 -180–180 度之间');
  const timeZone = project.location?.timeZone;
  const zoneValid = typeof timeZone === 'string' && DateTime.local().setZone(timeZone).isValid;
  if (!zoneValid) errors.push('时区必须使用有效的 IANA 时区名称');
  const localDateTime = zoneValid
    ? DateTime.fromISO(String(project.simulation?.date) + 'T' + String(project.simulation?.time), { zone: timeZone })
    : null;
  if (!localDateTime?.isValid) errors.push('模拟日期和时间必须组成有效的当地时间');
  const buildingIds = new Set();
  for (const building of Array.isArray(project.buildings) ? project.buildings : []) validateBuilding(building, errors, buildingIds);
  return { ok: errors.length === 0, errors };
}
