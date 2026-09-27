import './style.css';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { REGIONS, TOUR_ORDER, lonLatToUV } from './data/regions.js';
import { createChinaElevation, sampleProfile36 } from './terrain/heightmap.js';
import {
  createTerrainMaterial,
  elevationToDataTexture,
  maskToDataTexture,
} from './terrain/materials.js';
import { createPulseMarkers, updatePulses } from './terrain/markers.js';
import { SpeechGuide } from './ui/speech.js';
import { drawProfile } from './ui/profile.js';

const WORLD_W = 120;
const WORLD_D = 72;
const SEG_X = 256;
const SEG_Y = 160;

const canvas = document.getElementById('terrain-canvas');
const speech = new SpeechGuide();

let material;
let markers = [];
let controls;
let camera;
let renderer;
let scene;
let elevData;
let elevW;
let elevH;
let selectedId = null;
let touring = false;
let tourTimer = null;
let animatingCam = false;

const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();

init();

function init() {
  const elev = createChinaElevation(512, 320);
  elevData = elev.data;
  elevW = elev.width;
  elevH = elev.height;

  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x0c1218);
  scene.fog = new THREE.Fog(0x0c1218, 140, 320);

  camera = new THREE.PerspectiveCamera(48, window.innerWidth / window.innerHeight, 0.1, 800);
  camera.position.set(0, -85, 70);
  camera.up.set(0, 0, 1);

  renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);

  controls = new OrbitControls(camera, canvas);
  controls.enableDamping = true;
  controls.dampingFactor = 0.06;
  controls.minDistance = 18;
  controls.maxDistance = 200;
  controls.maxPolarAngle = Math.PI * 0.48;
  controls.target.set(0, 0, 8);
  // 旋转 + 缩放（含触控捏合）
  controls.enablePan = true;
  controls.zoomSpeed = 1.1;

  scene.add(new THREE.AmbientLight(0xb8c4d0, 0.75));
  const sun = new THREE.DirectionalLight(0xfff0dd, 1.05);
  sun.position.set(-40, -60, 80);
  scene.add(sun);
  const fill = new THREE.DirectionalLight(0x88aacc, 0.35);
  fill.position.set(50, 30, 40);
  scene.add(fill);

  const heightTex = elevationToDataTexture(elev.data, elev.width, elev.height);
  const maskTex = maskToDataTexture(elev.mask, elev.width, elev.height);
  material = createTerrainMaterial(heightTex, maskTex, 1.35);

  const geo = new THREE.PlaneGeometry(WORLD_W, WORLD_D, SEG_X, SEG_Y);
  const mesh = new THREE.Mesh(geo, material);
  scene.add(mesh);

  // 海面底板
  const ocean = new THREE.Mesh(
    new THREE.PlaneGeometry(WORLD_W * 1.25, WORLD_D * 1.35),
    new THREE.MeshStandardMaterial({
      color: 0x1a3348,
      transparent: true,
      opacity: 0.85,
      roughness: 0.85,
      metalness: 0.05,
    }),
  );
  ocean.position.z = -0.4;
  scene.add(ocean);

  const getHeightAtUV = (u, v) => {
    const x = Math.round(u * (elevW - 1));
    const y = Math.round((1 - v) * (elevH - 1));
    const h = elevData[y * elevW + x] || 0;
    return h * material.uniforms.elevScale.value * material.uniforms.exaggeration.value;
  };

  const pulse = createPulseMarkers(WORLD_W, WORLD_D, getHeightAtUV);
  markers = pulse.markers;
  scene.add(pulse.group);

  buildRegionList();
  bindUI();
  drawProfile(
    document.getElementById('profile-canvas'),
    sampleProfile36(elevData, elevW, elevH),
  );

  window.addEventListener('resize', onResize);
  canvas.addEventListener('pointerdown', onPointerDown);

  speech.onStateChange = (playing) => {
    const btn = document.getElementById('btn-voice');
    btn.textContent = playing ? '停止语音' : '语音播放';
    btn.classList.toggle('active', playing);
  };

  animate();
  toast('沙盘已就绪：拖拽旋转，滚轮缩放，点击脉冲点探索');
}

function getHeightWorld(lon, lat) {
  const { u, v } = lonLatToUV(lon, lat);
  const x = Math.round(u * (elevW - 1));
  const y = Math.round((1 - v) * (elevH - 1));
  const h = elevData[y * elevW + x] || 0;
  return h * material.uniforms.elevScale.value * material.uniforms.exaggeration.value;
}

function regionWorldPos(region) {
  const { u, v } = lonLatToUV(region.lon, region.lat);
  return new THREE.Vector3(
    (u - 0.5) * WORLD_W,
    (0.5 - v) * WORLD_D,
    getHeightWorld(region.lon, region.lat) + 1.2,
  );
}

function buildRegionList() {
  const list = document.getElementById('region-list');
  list.innerHTML = '';
  for (const r of REGIONS) {
    const li = document.createElement('li');
    li.innerHTML = `<button type="button" data-id="${r.id}"><span>${r.name}</span><small>${r.elevationHint}</small></button>`;
    list.appendChild(li);
  }
  list.addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-id]');
    if (!btn) return;
    focusRegion(btn.dataset.id, { speak: true });
  });
}

function bindUI() {
  document.getElementById('mode-step').addEventListener('click', () => setMode(0));
  document.getElementById('mode-contour').addEventListener('click', () => setMode(1));

  const slider = document.getElementById('exaggeration');
  const label = document.getElementById('exaggeration-value');
  slider.addEventListener('input', () => {
    const v = Number(slider.value);
    material.uniforms.exaggeration.value = v;
    label.textContent = `${v.toFixed(2)}×`;
    // 同步脉冲点高度
    for (const m of markers) {
      const p = regionWorldPos(m.region);
      m.pivot.position.copy(p);
    }
  });

  document.getElementById('btn-voice').addEventListener('click', () => {
    const text = document.getElementById('intro-text').textContent;
    const state = speech.toggle(text);
    if (state === 'unsupported') toast('当前浏览器不支持语音合成');
  });

  document.getElementById('intro-panel').addEventListener('click', () => {
    const text = document.getElementById('intro-text').textContent;
    const title = document.getElementById('intro-title').textContent;
    speech.speak(`${title}。${text}`);
  });

  document.getElementById('btn-tour').addEventListener('click', () => {
    if (touring) stopTour();
    else startTour();
  });

  document.getElementById('btn-profile').addEventListener('click', () => {
    const drawer = document.getElementById('profile-drawer');
    drawer.classList.remove('hidden');
    drawer.setAttribute('aria-hidden', 'false');
    // 每次打开重绘，避免偶发空白
    drawProfile(
      document.getElementById('profile-canvas'),
      sampleProfile36(elevData, elevW, elevH),
    );
    toast('已打开北纬 36° 三大阶梯剖面');
  });
  document.getElementById('btn-close-profile').addEventListener('click', () => {
    document.getElementById('profile-drawer').classList.add('hidden');
    document.getElementById('profile-drawer').setAttribute('aria-hidden', 'true');
  });
}

function setMode(mode) {
  material.uniforms.mapMode.value = mode;
  document.getElementById('mode-step').classList.toggle('active', mode === 0);
  document.getElementById('mode-contour').classList.toggle('active', mode === 1);
  toast(mode === 0 ? '已切换：阶梯着色' : '已切换：等高线');
}

function showIntro(region) {
  document.getElementById('intro-title').textContent = region.name;
  document.getElementById('intro-text').textContent = region.detail || region.summary;
  selectedId = region.id;
  document.querySelectorAll('#region-list button').forEach((b) => {
    b.classList.toggle('active', b.dataset.id === region.id);
  });
}

function focusRegion(id, { speak = false, fromTour = false } = {}) {
  const region = REGIONS.find((r) => r.id === id);
  if (!region) return;
  showIntro(region);
  flyTo(region);
  if (speak) {
    speech.speak(`${region.name}。${region.summary}`);
  }
  if (!fromTour) toast(`飞入：${region.name}`);
}

function flyTo(region) {
  const target = regionWorldPos(region);
  const offset = new THREE.Vector3(0, -22, 16);
  // 喜马拉雅等西部稍抬高观察
  if (region.id === 'himalaya' || region.id === 'qingzang') offset.set(8, -18, 22);
  if (region.id === 'dongbei') offset.set(-6, -24, 18);

  const endCam = target.clone().add(offset);
  const startCam = camera.position.clone();
  const startTarget = controls.target.clone();
  const endTarget = target.clone();
  animatingCam = true;
  controls.enabled = false;

  const duration = 1600;
  const t0 = performance.now();

  function step(now) {
    const t = Math.min(1, (now - t0) / duration);
    const e = easeInOut(t);
    camera.position.lerpVectors(startCam, endCam, e);
    controls.target.lerpVectors(startTarget, endTarget, e);
    controls.update();
    if (t < 1) requestAnimationFrame(step);
    else {
      animatingCam = false;
      controls.enabled = true;
    }
  }
  requestAnimationFrame(step);
}

function easeInOut(t) {
  return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
}

async function startTour() {
  touring = true;
  const btn = document.getElementById('btn-tour');
  btn.textContent = '停止巡礼';
  btn.classList.add('active');
  toast('自动巡礼开始：自喜马拉雅山脉向东依次演示');

  for (const id of TOUR_ORDER) {
    if (!touring) break;
    focusRegion(id, { speak: true, fromTour: true });
    // 等待镜头 + 语音大致时长
    await wait(4200);
  }

  if (touring) {
    touring = false;
    btn.textContent = '自动巡礼';
    btn.classList.remove('active');
    toast('巡礼结束');
  }
}

function stopTour() {
  touring = false;
  if (tourTimer) clearTimeout(tourTimer);
  speech.stop();
  const btn = document.getElementById('btn-tour');
  btn.textContent = '自动巡礼';
  btn.classList.remove('active');
  toast('已停止巡礼');
}

function wait(ms) {
  return new Promise((resolve) => {
    tourTimer = setTimeout(resolve, ms);
  });
}

function onPointerDown(event) {
  if (animatingCam) return;
  const rect = canvas.getBoundingClientRect();
  pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
  pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
  raycaster.setFromCamera(pointer, camera);

  const objects = markers.map((m) => m.core);
  const hits = raycaster.intersectObjects(objects, false);
  if (hits.length) {
    const region = hits[0].object.parent.userData.region;
    focusRegion(region.id, { speak: true });
  }
}

function onResize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
}

function toast(msg) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.classList.remove('hidden');
  clearTimeout(toast._t);
  toast._t = setTimeout(() => el.classList.add('hidden'), 2800);
}

function animate() {
  requestAnimationFrame(animate);
  const t = performance.now() * 0.001;
  updatePulses(markers, t);
  if (!animatingCam) controls.update();
  renderer.render(scene, camera);
}
