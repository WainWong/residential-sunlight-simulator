import { createQualitySettings } from '../features/settings/QualitySettings.js';
import { createBuildingMesh } from './buildingMesh.js';
import { createCameraRig } from './createCameraRig.js';
import { createRenderer } from './createRenderer.js';
import { createScene } from './createScene.js';
import { createSceneSynchronizer } from './syncScene.js';

export function createSceneController(canvas) {
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
  const empty = viewport.querySelector('.viewport__empty');

  function resize() {
    const rect = viewport.getBoundingClientRect();
    const width = Math.max(1, Math.round(rect.width));
    const height = Math.max(1, Math.round(rect.height));
    rendererParts.resize(width, height, quality.value.pixelRatio);
    rendererParts.renderer.shadowMap.enabled = quality.value.shadows;
    cameraParts.resize(width, height);
  }

  const observer = new ResizeObserver(resize);
  observer.observe(viewport);
  resize();
  rendererParts.renderer.setAnimationLoop(() => {
    cameraParts.controls.update();
    rendererParts.renderer.render(sceneParts.scene, cameraParts.camera);
  });

  return {
    updateProject(project) {
      synchronizer.update(project.buildings);
      canvas.dataset.buildingCount = String(project.buildings.length);
      if (empty) empty.hidden = project.buildings.length > 0;
    },
    setPreviewing(value) {
      quality.setPreviewing(value);
      resize();
    },
    dispose() {
      observer.disconnect();
      rendererParts.renderer.setAnimationLoop(null);
      synchronizer.dispose();
      cameraParts.dispose();
      rendererParts.dispose();
    }
  };
}
