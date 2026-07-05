import * as THREE from 'three';
import { createQualitySettings } from '../features/settings/QualitySettings.js';
import { createBuildingMesh } from './buildingMesh.js';
import { createCameraRig } from './createCameraRig.js';
import { createRenderer } from './createRenderer.js';
import { createScene } from './createScene.js';
import { pointerToNdc, resolvePickedEntity } from './picking.js';
import { applySunLighting } from './sunLighting.js';
import { createSceneSynchronizer } from './syncScene.js';

export function createSceneController(canvas, { onSelect = () => {} } = {}) {
  const quality = createQualitySettings('medium');
  const sceneParts = createScene();
  const rendererParts = createRenderer(canvas);
  const cameraParts = createCameraRig(canvas);
  const synchronizer = createSceneSynchronizer({
    rebuild: createBuildingMesh,
    attach: object => sceneParts.buildings.add(object),
    detach: object => sceneParts.buildings.remove(object)
  });
  const viewport = canvas.parentElement;

  function resize() {
    const rect = viewport.getBoundingClientRect();
    const width = Math.max(1, Math.round(rect.width));
    const height = Math.max(1, Math.round(rect.height));
    rendererParts.resize(width, height, quality.value.pixelRatio);
    rendererParts.renderer.shadowMap.enabled = quality.value.shadows;
    cameraParts.resize(width, height);
  }

  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();

  function selectAtPointer(event) {
    const rect = canvas.getBoundingClientRect();
    const ndc = pointerToNdc(event, rect);
    pointer.set(ndc.x, ndc.y);
    raycaster.setFromCamera(pointer, cameraParts.camera);
    const intersections = raycaster.intersectObjects(sceneParts.buildings.children, true);
    const entityId = resolvePickedEntity(intersections);
    if (entityId) onSelect(entityId);
  }

  canvas.addEventListener('click', selectAtPointer);

  const observer = new ResizeObserver(resize);
  observer.observe(viewport);
  resize();
  rendererParts.renderer.setAnimationLoop(() => {
    cameraParts.controls.update();
    rendererParts.renderer.render(sceneParts.scene, cameraParts.camera);
  });

  return {
    updateProject(project) {
      synchronizer.update(project.buildings, {
        previewBuildingId: project.view.editingBuildingId
      });
      canvas.dataset.buildingCount = String(project.buildings.length);
      canvas.dataset.editingBuildingId = project.view.editingBuildingId ?? '';
    },
    updateSolar(simulationState) {
      applySunLighting(sceneParts.sunlight, simulationState.solar);
      const direction = simulationState.solar.direction;
      canvas.dataset.sunDirection = [direction.x, direction.y, direction.z]
        .map(value => value.toFixed(4))
        .join(',');
      canvas.dataset.sunAboveHorizon = String(simulationState.solar.aboveHorizon);
    },
    setPreviewing(value) {
      quality.setPreviewing(value);
      resize();
    },
    dispose() {
      canvas.removeEventListener('click', selectAtPointer);
      observer.disconnect();
      rendererParts.renderer.setAnimationLoop(null);
      synchronizer.dispose();
      cameraParts.dispose();
      rendererParts.dispose();
    }
  };
}
