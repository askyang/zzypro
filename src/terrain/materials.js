import * as THREE from 'three';

const stepVertex = /* glsl */ `
varying vec2 vUv;
varying float vElev;
uniform sampler2D heightMap;
uniform float exaggeration;
uniform float elevScale;
uniform float maxElev;

void main() {
  vUv = uv;
  float hNorm = texture2D(heightMap, uv).r;
  float h = hNorm * maxElev;
  vElev = h;
  vec3 pos = position;
  pos.z += h * elevScale * exaggeration;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
}
`;

const stepFragment = /* glsl */ `
varying float vElev;
varying vec2 vUv;
uniform sampler2D landMask;
uniform float maxElev;
uniform int mapMode; // 0 step, 1 contour

vec3 hypsometric(float h) {
  // 三大阶梯示意色带
  if (h < 50.0) return vec3(0.45, 0.72, 0.42);
  if (h < 200.0) return vec3(0.62, 0.78, 0.45);
  if (h < 500.0) return vec3(0.82, 0.82, 0.48);
  if (h < 1000.0) return vec3(0.86, 0.70, 0.42);
  if (h < 2000.0) return vec3(0.78, 0.55, 0.38);
  if (h < 3000.0) return vec3(0.70, 0.48, 0.40);
  if (h < 4000.0) return vec3(0.72, 0.62, 0.58);
  if (h < 5000.0) return vec3(0.82, 0.78, 0.74);
  if (h < 6000.0) return vec3(0.90, 0.90, 0.92);
  return vec3(0.96, 0.97, 1.0);
}

void main() {
  float land = texture2D(landMask, vUv).r;
  if (land < 0.5) {
    gl_FragColor = vec4(0.12, 0.22, 0.32, 0.55);
    return;
  }

  vec3 base = hypsometric(vElev);

  if (mapMode == 1) {
    // 等高线模式：浅底 + 深色等高线，视觉对比更强
    base = mix(vec3(0.88, 0.84, 0.76), vec3(0.62, 0.70, 0.58), clamp(vElev / 4500.0, 0.0, 1.0));
    float interval = mix(200.0, 400.0, smoothstep(0.0, 5000.0, vElev));
    float band = fract(vElev / interval);
    float line = 1.0 - smoothstep(0.0, 0.045, min(band, 1.0 - band));
    // 每 5 条加粗一条主等高线
    float major = step(0.92, fract(vElev / (interval * 5.0)));
    base = mix(base, vec3(0.18, 0.14, 0.10), line * (0.75 + 0.25 * major));
  }

  // 简单坡向明暗
  float shade = 0.85 + 0.15 * clamp(vElev / maxElev, 0.0, 1.0);
  gl_FragColor = vec4(base * shade, 1.0);
}
`;

export function createTerrainMaterial(heightTex, maskTex, exaggeration = 1.35) {
  return new THREE.ShaderMaterial({
    uniforms: {
      heightMap: { value: heightTex },
      landMask: { value: maskTex },
      exaggeration: { value: exaggeration },
      elevScale: { value: 0.0045 },
      maxElev: { value: 8848 },
      mapMode: { value: 0 },
    },
    vertexShader: stepVertex,
    fragmentShader: stepFragment,
    transparent: true,
    side: THREE.DoubleSide,
  });
}

export function elevationToDataTexture(data, width, height, maxElev = 8848) {
  // 使用 Uint8 提升兼容性（避免部分环境 Float Red 纹理问题）
  const arr = new Uint8Array(width * height);
  for (let i = 0; i < data.length; i++) {
    const h = Math.max(0, data[i]);
    arr[i] = Math.min(255, Math.round((h / maxElev) * 255));
  }
  const tex = new THREE.DataTexture(arr, width, height, THREE.RedFormat, THREE.UnsignedByteType);
  tex.needsUpdate = true;
  tex.minFilter = THREE.LinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.wrapS = THREE.ClampToEdgeWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  return tex;
}

export function maskToDataTexture(mask, width, height) {
  const arr = new Uint8Array(width * height);
  for (let i = 0; i < mask.length; i++) arr[i] = mask[i] ? 255 : 0;
  const tex = new THREE.DataTexture(arr, width, height, THREE.RedFormat, THREE.UnsignedByteType);
  tex.needsUpdate = true;
  tex.minFilter = THREE.NearestFilter;
  tex.magFilter = THREE.NearestFilter;
  return tex;
}
