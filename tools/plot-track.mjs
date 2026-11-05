// 赛道自检：ASCII 俯视图 + 长度/曲率半径统计（用于手工调形）
import * as THREE from '../node_modules/three/build/three.module.js';
import { TRACK } from '../js/trackData.js';

const pts = TRACK.points.map(([x, z, y]) => new THREE.Vector3(x, y, z));
const curve = new THREE.CatmullRomCurve3(pts, true, 'centripetal', 0.5);
const N = 3000;
const samples = [];
for (let i = 0; i < N; i++) samples.push(curve.getPointAt(i / N));

let len = 0;
for (let i = 0; i < N; i++) len += samples[i].distanceTo(samples[(i + 1) % N]);

// 曲率半径
let minR = Infinity, minAt = 0;
for (let i = 0; i < N; i++) {
  const a = samples[(i - 6 + N) % N], b = samples[i], c = samples[(i + 6) % N];
  const ab = b.clone().sub(a), bc = c.clone().sub(b);
  const ang = ab.angleTo(bc) + 1e-9;
  const r = (ab.length() + bc.length()) / 2 / ang;
  if (r < minR) { minR = r; minAt = i / N; }
}

// 自交检测
let minGap = Infinity;
for (let i = 0; i < N; i += 4) {
  for (let j = i + 40; j < N; j += 4) {
    if (Math.min(j - i, N - (j - i)) < 40) continue;
    const d = samples[i].distanceTo(samples[j]);
    if (d < minGap) minGap = d;
  }
}

// 高程
const ys = samples.map(p => p.y);
const maxY = Math.max(...ys), minY = Math.min(...ys);

const W = 100, H = 46;
const xs = samples.map(p => p.x), zs = samples.map(p => p.z);
const minX = Math.min(...xs), maxX = Math.max(...xs);
const minZ = Math.min(...zs), maxZ = Math.max(...zs);
const grid = Array.from({ length: H }, () => Array(W).fill(' '));
for (let i = 0; i < N; i++) {
  const p = samples[i];
  const cx = Math.round((p.x - minX) / (maxX - minX) * (W - 1));
  const cy = Math.round((p.z - minZ) / (maxZ - minZ) * (H - 1));
  grid[H - 1 - cy][cx] = '#';
}
// 起点
const s0 = samples[0];
const sx = Math.round((s0.x - minX) / (maxX - minX) * (W - 1));
const sy = Math.round((s0.z - minZ) / (maxZ - minZ) * (H - 1));
grid[H - 1 - sy][sx] = 'S';

console.log(`赛道长度: ${len.toFixed(0)} m`);
console.log(`最小曲率半径: ${minR.toFixed(1)} m @ s=${minAt.toFixed(3)}`);
console.log(`非邻接最小间距: ${minGap.toFixed(1)} m  (需 > 25)`);
console.log(`高程: ${minY.toFixed(1)} ~ ${maxY.toFixed(1)} m`);
console.log(`包围盒: x ${minX.toFixed(0)}..${maxX.toFixed(0)}  z ${minZ.toFixed(0)}..${maxZ.toFixed(0)}`);
const step = len / N;
console.log('每采样点间距:', step.toFixed(2), 'm');
console.log('+  ' + '-'.repeat(W) + ' +');
for (const row of grid) console.log('|  ' + row.join('') + '  |');
console.log('+  ' + '-'.repeat(W) + ' +');

// 逐段曲率半径打印（用于放置弯道提示/加速带）
const buckets = [];
const seg = Math.floor(N / 24);
for (let k = 0; k < 24; k++) {
  let mr = Infinity;
  for (let i = k * seg; i < (k + 1) * seg; i++) {
    const a = samples[(i - 6 + N) % N], b = samples[i % N], c = samples[(i + 6) % N];
    const ang = b.clone().sub(a).angleTo(c.clone().sub(b)) + 1e-9;
    const r = (a.distanceTo(b) + b.distanceTo(c)) / 2 / ang;
    mr = Math.min(mr, r);
  }
  buckets.push(`${(k / 24).toFixed(2)}:${mr.toFixed(0)}`);
}
console.log('分段最小半径:', buckets.join(' '));