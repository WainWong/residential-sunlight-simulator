import * as THREE from 'three';
import { createSandboxAids } from './sandboxAids.js';

export function createScene() {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0xe8edf0);
  scene.fog = new THREE.Fog(0xe8edf0, 180, 520);

  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(800, 800),
    new THREE.MeshStandardMaterial({
      color: 0xd8d1bf,
      roughness: 0.96,
      metalness: 0
    })
  );
  ground.name = 'ground';
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);

  const hemisphere = new THREE.HemisphereLight(0xeaf4ff, 0x756a56, 1.5);
  hemisphere.name = 'ambient-sky';
  scene.add(hemisphere);

  const sunlight = new THREE.DirectionalLight(0xfff1c8, 3.2);
  sunlight.name = 'sunlight';
  sunlight.position.set(80, 120, -60);
  sunlight.castShadow = true;
  sunlight.shadow.mapSize.set(2048, 2048);
  sunlight.shadow.camera.near = 1;
  sunlight.shadow.camera.far = 400;
  sunlight.shadow.camera.left = -120;
  sunlight.shadow.camera.right = 120;
  sunlight.shadow.camera.top = 120;
  sunlight.shadow.camera.bottom = -120;
  scene.add(sunlight);
  scene.add(sunlight.target);

  const aids = createSandboxAids();
  scene.add(aids);

  const buildings = new THREE.Group();
  buildings.name = 'buildings';
  scene.add(buildings);

  const overlays = new THREE.Group();
  overlays.name = 'overlays';
  scene.add(overlays);

  return { scene, ground, sunlight, aids, buildings, overlays };
}
