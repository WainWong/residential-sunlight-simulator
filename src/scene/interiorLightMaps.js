import * as THREE from 'three';

const LIT = [255, 214, 140, 255];
const DARK = [40, 52, 64, 255];

export function createLightMaps(interiorGroup, surfaces, { texSize = 128 } = {}) {
  const bySurface = new Map();
  const surfaceMap = new Map(surfaces.map(s => [s.surfaceId, s]));

  interiorGroup.traverse(child => {
    const sid = child.userData?.surfaceId;
    if (!sid || !child.material) return;
    const data = new Uint8Array(texSize * texSize * 4);
    const tex = new THREE.DataTexture(data, texSize, texSize, THREE.RGBAFormat);
    tex.minFilter = THREE.LinearFilter;
    tex.magFilter = THREE.LinearFilter;
    tex.needsUpdate = true;
    child.material.map = tex;
    child.material.needsUpdate = true;
    bySurface.set(sid, { tex, data });
  });

  function paint(data, litSet, surface) {
    for (let i = 0; i < data.length; i += 4) data.set(DARK, i);
    const samples = surface?.samples ?? [];
    for (const s of samples) {
      if (!litSet.has(s.id)) continue;
      const px = Math.min(texSize - 1, Math.max(0, Math.floor(s.u * texSize)));
      const py = Math.min(texSize - 1, Math.max(0, Math.floor(s.v * texSize)));
      data.set(LIT, (py * texSize + px) * 4);
    }
  }

  return {
    apply(masks = {}) {
      for (const [sid, entry] of bySurface) {
        const litSet = new Set(masks[sid] ?? []);
        paint(entry.data, litSet, surfaceMap.get(sid));
        entry.tex.needsUpdate = true;
      }
    },
    dispose() {
      for (const { tex } of bySurface.values()) tex.dispose();
      bySurface.clear();
    }
  };
}
