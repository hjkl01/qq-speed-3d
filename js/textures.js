// 程序化贴图（无外部资源，保证纯静态可部署）
import * as THREE from '../vendor/three.module.js';

function cv(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return [c, c.getContext('2d')];
}

function rnd(seed) {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}

function tex(canvas, { repeat = [1, 1], srgb = true, aniso = 8 } = {}) {
  const t = new THREE.CanvasTexture(canvas);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeat[0], repeat[1]);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = aniso;
  return t;
}

// 沥青路面：横向 u 覆盖整条路宽，纵向 v 每 12m 重复
export function asphaltTexture() {
  const [c, g] = cv(512, 512);
  g.fillStyle = '#3a3d42';
  g.fillRect(0, 0, 512, 512);
  const r = rnd(7);
  for (let i = 0; i < 26000; i++) {
    const x = r() * 512, y = r() * 512, s = 0.6 + r() * 1.6;
    const v = 40 + r() * 46;
    g.fillStyle = `rgba(${v},${v + 2},${v + 6},${0.25 + r() * 0.5})`;
    g.fillRect(x, y, s, s);
  }
  // 沥青拼缝
  g.strokeStyle = 'rgba(20,20,22,0.5)';
  g.lineWidth = 2;
  for (let i = 0; i < 3; i++) {
    g.beginPath();
    g.moveTo(0, 40 + i * 170);
    g.lineTo(512, 40 + i * 170 + 6);
    g.stroke();
  }
  // 轮胎磨痕（两条主行车线）
  for (const u of [0.26, 0.74]) {
    const grd = g.createLinearGradient((u - 0.06) * 512, 0, (u + 0.06) * 512, 0);
    grd.addColorStop(0, 'rgba(20,20,22,0)');
    grd.addColorStop(0.5, 'rgba(20,20,22,0.35)');
    grd.addColorStop(1, 'rgba(20,20,22,0)');
    g.fillStyle = grd;
    g.fillRect((u - 0.07) * 512, 0, 0.14 * 512, 512);
  }
  // 边线
  g.fillStyle = 'rgba(238,240,245,0.92)';
  g.fillRect(10, 0, 7, 512);
  g.fillRect(495, 0, 7, 512);
  // 中央虚线
  g.fillStyle = 'rgba(240,242,248,0.85)';
  for (let y = 0; y < 512; y += 150) g.fillRect(252, y, 8, 78);
  return tex(c, { repeat: [1, 1] });
}

// 路肩红白条
export function kerbTexture() {
  const [c, g] = cv(64, 64);
  g.fillStyle = '#e8eaee'; g.fillRect(0, 0, 64, 64);
  g.fillStyle = '#d8253c'; g.fillRect(0, 0, 64, 32);
  return tex(c, { repeat: [1, 1] });
}

// 护栏
export function railTexture() {
  const [c, g] = cv(256, 64);
  const grd = g.createLinearGradient(0, 0, 0, 64);
  grd.addColorStop(0, '#e9eef5');
  grd.addColorStop(0.45, '#9fb0c4');
  grd.addColorStop(0.55, '#dbe4ee');
  grd.addColorStop(1, '#71818f');
  g.fillStyle = grd; g.fillRect(0, 0, 256, 64);
  g.fillStyle = 'rgba(30,120,220,0.85)';
  g.fillRect(0, 26, 256, 8);
  g.fillStyle = 'rgba(255,255,255,0.55)';
  for (let x = 0; x < 256; x += 32) g.fillRect(x, 0, 3, 64);
  return tex(c);
}

// 草地 / 泥土护坡
export function grassTexture() {
  const [c, g] = cv(512, 512);
  g.fillStyle = '#4e7a36'; g.fillRect(0, 0, 512, 512);
  const r = rnd(21);
  for (let i = 0; i < 9000; i++) {
    const x = r() * 512, y = r() * 512;
    const v = r();
    g.fillStyle = v < 0.5 ? `rgba(${60 + r() * 30},${110 + r() * 50},${44 + r() * 20},0.5)`
      : `rgba(${40 + r() * 20},${80 + r() * 30},${30 + r() * 15},0.5)`;
    g.fillRect(x, y, 1 + r() * 3, 1 + r() * 4);
  }
  return tex(c, { repeat: [1, 1] });
}

// 建筑玻璃幕墙
export function buildingTexture(seed = 1, hue = 205) {
  const [c, g] = cv(256, 512);
  const grad = g.createLinearGradient(0, 0, 0, 512);
  grad.addColorStop(0, `hsl(${hue},15%,58%)`);
  grad.addColorStop(1, `hsl(${hue},12%,40%)`);
  g.fillStyle = grad; g.fillRect(0, 0, 256, 512);
  const r = rnd(seed * 91 + 3);
  for (let y = 6; y < 512; y += 16) {
    for (let x = 6; x < 256; x += 16) {
      const on = r();
      const lit = on > 0.72;
      g.fillStyle = lit
        ? `hsla(${hue + 20},${45 + r() * 30}%,${64 + r() * 22}%,0.95)`
        : `hsla(${hue},${12 + r() * 12}%,${46 + r() * 14}%,0.95)`;
      g.fillRect(x, y, 11, 10);
    }
  }
  g.fillStyle = 'rgba(0,0,0,0.16)';
  for (let y = 0; y < 512; y += 16) g.fillRect(0, y + 12, 256, 2);
  return tex(c);
}

// 加速带箭头（透明）
export function padTexture() {
  const [c, g] = cv(128, 256);
  g.clearRect(0, 0, 128, 256);
  for (let i = 0; i < 3; i++) {
    const y = 20 + i * 78;
    g.beginPath();
    g.moveTo(10, y); g.lineTo(64, y + 54); g.lineTo(118, y);
    g.lineTo(118, y + 26); g.lineTo(64, y + 80); g.lineTo(10, y + 26);
    g.closePath();
    g.fillStyle = i === 2 ? 'rgba(120,240,255,0.92)' : 'rgba(255,196,60,0.9)';
    g.fill();
  }
  const t = tex(c, { repeat: [1, 1] });
  return t;
}

// 起点横幅
export function bannerTexture() {
  const [c, g] = cv(1024, 128);
  const grd = g.createLinearGradient(0, 0, 1024, 0);
  grd.addColorStop(0, '#08121f');
  grd.addColorStop(0.5, '#0d2a44');
  grd.addColorStop(1, '#08121f');
  g.fillStyle = grd; g.fillRect(0, 0, 1024, 128);
  g.strokeStyle = '#28d3ff'; g.lineWidth = 6; g.strokeRect(6, 6, 1012, 116);
  // 方格旗
  for (let i = 0; i < 8; i++) for (let j = 0; j < 3; j++) {
    if ((i + j) % 2 === 0) { g.fillStyle = '#e8f6ff'; g.fillRect(30 + i * 22, 20 + j * 22, 20, 20); }
  }
  g.fillStyle = '#eaf7ff';
  g.font = 'bold 62px "PingFang SC", "Microsoft YaHei", sans-serif';
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText('城镇高速公路  ·  TOWN HIGHWAY', 560, 62);
  return tex(c);
}

export function adTexture(title, sub, c1 = '#1b2c4a', c2 = '#0a1526') {
  const [c, g] = cv(512, 256);
  const grd = g.createLinearGradient(0, 0, 512, 256);
  grd.addColorStop(0, c1); grd.addColorStop(1, c2);
  g.fillStyle = grd; g.fillRect(0, 0, 512, 256);
  g.strokeStyle = 'rgba(80,220,255,0.9)'; g.lineWidth = 6; g.strokeRect(8, 8, 496, 240);
  g.fillStyle = '#ffffff';
  g.font = 'bold 70px "PingFang SC", sans-serif';
  g.textAlign = 'center';
  g.fillText(title, 256, 120);
  g.fillStyle = 'rgba(120,230,255,0.9)';
  g.font = 'bold 34px "PingFang SC", sans-serif';
  g.fillText(sub, 256, 186);
  return tex(c);
}

// 点粒子（烟/火花）
export function smokeTexture() {
  const [c, g] = cv(64, 64);
  const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grd.addColorStop(0, 'rgba(255,255,255,1)');
  grd.addColorStop(0.35, 'rgba(255,255,255,0.55)');
  grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd; g.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// 天空渐变
export function skyTexture() {
  const [c, g] = cv(16, 256);
  const grd = g.createLinearGradient(0, 0, 0, 256);
  grd.addColorStop(0, '#0d3f8f');
  grd.addColorStop(0.42, '#3f8fd0');
  grd.addColorStop(0.62, '#9fd0e8');
  grd.addColorStop(0.8, '#e6ecdf');
  grd.addColorStop(1, '#f6e9c8');
  g.fillStyle = grd; g.fillRect(0, 0, 16, 256);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
// 环境反射贴图（等距柱状渐变），给金属材质一点反射，避免死黑
export function skyEnvTexture() {
  const c = document.createElement('canvas');
  c.width = 128; c.height = 64;
  const g = c.getContext('2d');
  const grad = g.createLinearGradient(0, 0, 0, 64);
  grad.addColorStop(0, '#6ea8e0');
  grad.addColorStop(0.42, '#bcd8f2');
  grad.addColorStop(0.52, '#eef4f8');
  grad.addColorStop(0.62, '#7f8f68');
  grad.addColorStop(1, '#3d4a2c');
  g.fillStyle = grad; g.fillRect(0, 0, 128, 64);
  const t = new THREE.CanvasTexture(c);
  t.mapping = THREE.EquirectangularReflectionMapping;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
