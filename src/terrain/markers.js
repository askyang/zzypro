import * as THREE from 'three';
import { REGIONS, lonLatToUV } from '../data/regions.js';

export function createPulseMarkers(worldWidth, worldDepth, getHeightAtUV) {
  const group = new THREE.Group();
  const markers = [];

  for (const region of REGIONS) {
    const { u, v } = lonLatToUV(region.lon, region.lat);
    const x = (u - 0.5) * worldWidth;
    const y = (0.5 - v) * worldDepth;
    const z = getHeightAtUV(u, v);

    const pivot = new THREE.Group();
    pivot.position.set(x, y, z + 0.8);
    pivot.userData = { region };

    const core = new THREE.Mesh(
      new THREE.SphereGeometry(0.55, 16, 16),
      new THREE.MeshBasicMaterial({ color: 0xff6b3d }),
    );
    pivot.add(core);

    const ringMat = new THREE.MeshBasicMaterial({
      color: 0xff8a5c,
      transparent: true,
      opacity: 0.65,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    // 地面为 XY、高度为 Z：RingGeometry 默认在 XY，无需再旋转
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.7, 1.1, 32), ringMat);
    pivot.add(ring);

    const ring2 = ring.clone();
    ring2.scale.setScalar(1.4);
    ring2.material = ringMat.clone();
    ring2.material.opacity = 0.35;
    pivot.add(ring2);

    const label = makeLabel(region.name);
    label.position.set(0, 0, 2.2);
    pivot.add(label);

    group.add(pivot);
    markers.push({ pivot, ring, ring2, region, core });
  }

  return { group, markers };
}

function makeLabel(text) {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 64;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, 256, 64);
  ctx.font = 'bold 28px "Noto Sans SC", sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = 'rgba(12, 18, 24, 0.72)';
  roundRect(ctx, 16, 10, 224, 44, 10);
  ctx.fill();
  ctx.fillStyle = '#f4efe6';
  ctx.fillText(text, 128, 34);

  const tex = new THREE.CanvasTexture(canvas);
  tex.needsUpdate = true;
  const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false });
  const sprite = new THREE.Sprite(mat);
  sprite.scale.set(8, 2, 1);
  return sprite;
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

export function updatePulses(markers, time) {
  for (const m of markers) {
    const s = 1 + 0.35 * Math.sin(time * 2.4 + m.region.lon * 0.1);
    m.ring.scale.setScalar(s);
    m.ring.material.opacity = 0.55 * (1.15 - (s - 1));
    m.ring2.scale.setScalar(s * 1.35);
    m.ring2.material.opacity = 0.28 * (1.2 - (s - 1));
    m.core.scale.setScalar(1 + 0.08 * Math.sin(time * 3.0 + m.region.lat));
  }
}
