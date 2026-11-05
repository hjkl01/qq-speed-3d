// 赛道自检：闭环 / 自交 / 最小半径 / 高程 / ASCII 俯视图
import OPS from '../js/trackOps.js';
import { buildCenterline } from '../js/centerline.js';

const cl = buildCenterline(OPS, 2);
const S = cl.pts;
const N = S.length;
const total = cl.total;

const gap = Math.hypot(S[0].x - S[N - 1].x, S[0].z - S[N - 1].z);
let dth = S[0].th - S[N - 1].th;
while (dth > Math.PI) dth -= Math.PI * 2;
while (dth < -Math.PI) dth += Math.PI * 2;

let minGap = Infinity, at = null;
for (let i = 0; i < N; i += 2) {
  for (let j = i + 24; j < N; j += 2) {
    if (Math.min(j - i, N - (j - i)) < 24) continue;
    const d = Math.hypot(S[i].x - S[j].x, S[i].z - S[j].z);
    if (d < minGap) { minGap = d; at = [i, j]; }
  }
}
const xs = S.map(p => p.x), zs = S.map(p => p.z), ys = S.map(p => p.y);
const minR = 1 / Math.max(...S.map(p => Math.abs(p.curv)));
console.log(`长度 ${total.toFixed(0)}m  采样 ${N}  最小半径 ${minR.toFixed(1)}m`);
console.log(`闭合缺口 ${gap.toFixed(1)}m  朝向差 ${(dth * 180 / Math.PI).toFixed(1)}°  非邻接最近 ${minGap.toFixed(1)}m @${at}`);
console.log(`高程 ${Math.min(...ys).toFixed(1)}..${Math.max(...ys).toFixed(1)}  x ${Math.min(...xs).toFixed(0)}..${Math.max(...xs).toFixed(0)}  z ${Math.min(...zs).toFixed(0)}..${Math.max(...zs).toFixed(0)}`);

const W = 96, H = 42;
const minX = Math.min(...xs), maxX = Math.max(...xs);
const minZ = Math.min(...zs), maxZ = Math.max(...zs);
const grid = Array.from({ length: H }, () => Array(W).fill(' '));
const toCell = (p) => [
  Math.round((p.x - minX) / (maxX - minX) * (W - 1)),
  Math.round((p.z - minZ) / (maxZ - minZ) * (H - 1)),
];
for (let i = 0; i < N; i++) {
  const [cx, cy] = toCell(S[i]);
  grid[cy][cx] = S[i].y > 6 ? '^' : '#';
}
const [sx, sy] = toCell(S[0]);
grid[sy][sx] = 'S';
console.log('+  ' + '-'.repeat(W) + ' +');
for (const row of grid) console.log('|  ' + row.join('') + '  |');
console.log('+  ' + '-'.repeat(W) + ' +');