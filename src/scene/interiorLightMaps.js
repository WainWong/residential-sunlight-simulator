import * as THREE from 'three';

const LIT = [255, 214, 140, 255];   // warm direct-sun patch
const DARK = [176, 184, 194, 255];  // neutral "in shadow" tone (not black)

export function createLightMaps(interiorGroup, surfaces, { texSize = 512 } = {}) {
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
    if (samples.length === 0) return;
    // Each sample owns a grid cell of `spacing` meters. Paint the cell's EXACT
    // UV extent, rounded at the boundaries — adjacent cells share identical
    // rounded edges, so lit regions tile with zero gaps and zero overlap
    // (fixed-width painting caused periodic 1-texel moiré seams).
    const spacing = surface.spacing ?? 1;
    const halfU = spacing / (surface.width || 1) / 2;
    const halfV = spacing / (surface.height || 1) / 2;
    for (const s of samples) {
      if (!litSet.has(s.id)) continue;
      const x0 = Math.max(0, Math.round((s.u - halfU) * texSize));
      const x1 = Math.min(texSize, Math.round((s.u + halfU) * texSize));
      const y0 = Math.max(0, Math.round((s.v - halfV) * texSize));
      const y1 = Math.min(texSize, Math.round((s.v + halfV) * texSize));
      for (let py = y0; py < y1; py += 1) {
        for (let px = x0; px < x1; px += 1) {
          data.set(LIT, (py * texSize + px) * 4);
        }
      }
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
