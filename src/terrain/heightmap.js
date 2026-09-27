import { GEO } from '../data/regions.js';

/**
 * 程序化中国高程模型（教学示意）
 * 仓库无现成 DEM，故用地理约束的合成高程近似三大阶梯与主要地貌。
 * 返回 Float32Array，单位：米。
 */
export function createChinaElevation(width = 512, height = 384) {
  const data = new Float32Array(width * height);
  const mask = new Uint8Array(width * height);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const lon = GEO.lonMin + (x / (width - 1)) * (GEO.lonMax - GEO.lonMin);
      const lat = GEO.latMax - (y / (height - 1)) * (GEO.latMax - GEO.latMin);
      const inside = chinaLandMask(lon, lat);
      mask[y * width + x] = inside ? 1 : 0;
      data[y * width + x] = inside ? sampleElevation(lon, lat) : 0;
    }
  }

  // 轻微平滑，弱化锯齿
  const smoothed = boxBlur(data, width, height, 1);
  for (let i = 0; i < data.length; i++) {
    if (!mask[i]) smoothed[i] = -200;
  }

  return { data: smoothed, mask, width, height, min: 0, max: 8848 };
}

function sampleElevation(lon, lat) {
  let h = 120;

  // —— 第一阶梯：青藏高原主体 ——
  const plateau = softEllipse(lon, lat, 90, 33.5, 16, 8.5);
  h += plateau * 4300;

  // 喜马拉雅高脊（南缘）
  const himalaya = ridge(lon, lat, 78, 28.2, 96, 27.6, 1.6) * gauss(lat, 28.0, 1.4);
  h += himalaya * 4200;

  // 昆仑 / 天山抬升
  h += ridge(lon, lat, 76, 36.2, 98, 35.5, 1.8) * 1800;
  h += ridge(lon, lat, 74, 42.0, 94, 42.5, 1.5) * 1600;

  // 塔里木盆地凹陷
  const tarim = softEllipse(lon, lat, 83.5, 39.0, 7.5, 3.8);
  h -= tarim * 2800;
  h = Math.max(h, tarim > 0.35 ? 850 + (1 - tarim) * 400 : h);

  // 柴达木相对低洼
  const qaidam = softEllipse(lon, lat, 95.0, 37.0, 3.5, 1.8);
  h -= qaidam * 900;

  // —— 第二阶梯 ——
  // 内蒙古高原
  const neimeng = softEllipse(lon, lat, 112, 42.8, 10, 4.2);
  h = mix(h, 1200 + noise(lon, lat) * 180, neimeng * 0.85);

  // 黄土高原
  const loess = softEllipse(lon, lat, 109, 36.5, 6.5, 4.0);
  h = mix(h, 1400 + noise(lon, lat) * 220, loess * 0.75);

  // 云贵高原
  const yungui = softEllipse(lon, lat, 105, 26.5, 5.5, 4.0);
  h = mix(h, 1700 + Math.abs(noise(lon * 1.4, lat * 1.4)) * 500, yungui * 0.9);

  // 四川盆地低陷
  const sichuan = softEllipse(lon, lat, 105.5, 30.4, 3.8, 2.6);
  h = mix(h, 450 + noise(lon, lat) * 120, sichuan * 0.95);

  // 横断山区高差（盆地西侧）
  h += ridge(lon, lat, 98, 25, 102, 33, 2.2) * 2200 * (1 - sichuan);

  // 大兴安岭 / 太行 / 巫山等东缘山地（二、三阶梯分界）
  h += ridge(lon, lat, 118, 51, 124, 42, 1.8) * 900;
  h += ridge(lon, lat, 112.5, 41, 113.5, 34, 1.2) * 1100;
  h += ridge(lon, lat, 109.5, 32, 111, 28, 1.4) * 900;

  // —— 第三阶梯：东部平原 ——
  const huabei = softEllipse(lon, lat, 116.2, 36.0, 5.5, 4.2);
  h = mix(h, 40 + noise(lon, lat) * 25, huabei * 0.92);

  const dongbei = softEllipse(lon, lat, 124.0, 45.0, 6.5, 5.0);
  h = mix(h, 150 + noise(lon, lat) * 40, dongbei * 0.9);

  const changjiang = softEllipse(lon, lat, 118.5, 31.5, 7.0, 2.8);
  h = mix(h, 30 + noise(lon, lat) * 20, changjiang * 0.8);

  // 东南丘陵
  const hills = softEllipse(lon, lat, 116, 26.5, 7, 4);
  h = mix(h, 450 + Math.abs(noise(lon * 2, lat * 2)) * 350, hills * 0.55);

  // 海南 / 台湾粗略抬升
  if (lon > 109 && lon < 111.5 && lat > 18 && lat < 20.2) h = Math.max(h, 200 + noise(lon, lat) * 400);
  if (lon > 120.5 && lon < 122.2 && lat > 22 && lat < 25.5) h = Math.max(h, 800 + noise(lon, lat) * 1200);

  // 微起伏
  h += noise(lon * 0.7, lat * 0.7) * 80;

  return clamp(h, 0, 8848);
}

/** 粗略中国陆地掩膜（示意用多边形包络 + 岛屿） */
function chinaLandMask(lon, lat) {
  // 主体大陆近似多边形（顺时针）
  const poly = [
    [73.5, 39.5],
    [80, 42],
    [90, 49],
    [98, 43],
    [110, 45],
    [120, 53],
    [135, 48],
    [131, 42],
    [122, 39],
    [122, 31],
    [120, 23],
    [110, 18],
    [108, 21],
    [104, 22],
    [97, 24],
    [91, 27],
    [85, 27.5],
    [78, 31],
    [74, 35],
    [73.5, 39.5],
  ];
  if (pointInPoly(lon, lat, poly)) return true;
  // 海南近似
  if (lon > 108.5 && lon < 111.2 && lat > 18.0 && lat < 20.2) return true;
  // 台湾近似
  if (lon > 120.0 && lon < 122.1 && lat > 21.8 && lat < 25.4) return true;
  return false;
}

function pointInPoly(x, y, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i][0];
    const yi = poly[i][1];
    const xj = poly[j][0];
    const yj = poly[j][1];
    const intersect =
      yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi + 1e-12) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

function softEllipse(lon, lat, cx, cy, rx, ry) {
  const dx = (lon - cx) / rx;
  const dy = (lat - cy) / ry;
  const d = Math.sqrt(dx * dx + dy * dy);
  return Math.max(0, 1 - d * d);
}

function ridge(lon, lat, x1, y1, x2, y2, widthDeg) {
  const vx = x2 - x1;
  const vy = y2 - y1;
  const len2 = vx * vx + vy * vy || 1;
  const t = clamp(((lon - x1) * vx + (lat - y1) * vy) / len2, 0, 1);
  const px = x1 + t * vx;
  const py = y1 + t * vy;
  const dist = Math.hypot(lon - px, lat - py);
  return Math.exp(-(dist * dist) / (2 * widthDeg * widthDeg));
}

function gauss(v, center, sigma) {
  const d = v - center;
  return Math.exp(-(d * d) / (2 * sigma * sigma));
}

function noise(x, y) {
  const n = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453;
  return (n - Math.floor(n)) * 2 - 1;
}

function mix(a, b, t) {
  const k = clamp(t, 0, 1);
  return a * (1 - k) + b * k;
}

function clamp(v, a, b) {
  return Math.max(a, Math.min(b, v));
}

function boxBlur(src, w, h, r) {
  const out = new Float32Array(src.length);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let sum = 0;
      let count = 0;
      for (let dy = -r; dy <= r; dy++) {
        for (let dx = -r; dx <= r; dx++) {
          const xx = x + dx;
          const yy = y + dy;
          if (xx < 0 || yy < 0 || xx >= w || yy >= h) continue;
          sum += src[yy * w + xx];
          count++;
        }
      }
      out[y * w + x] = sum / count;
    }
  }
  return out;
}

/** 导出北纬 36° 剖面采样 */
export function sampleProfile36(elev, width, height, samples = 180) {
  const lat = 36;
  const v = (GEO.latMax - lat) / (GEO.latMax - GEO.latMin);
  const y = clamp(Math.round(v * (height - 1)), 0, height - 1);
  const points = [];
  for (let i = 0; i < samples; i++) {
    const u = i / (samples - 1);
    const x = Math.round(u * (width - 1));
    const lon = GEO.lonMin + u * (GEO.lonMax - GEO.lonMin);
    points.push({ lon, elevation: elev[y * width + x] });
  }
  return points;
}
