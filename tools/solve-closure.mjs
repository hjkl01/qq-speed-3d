// 数值求解：微调若干直道长度，使赛道闭合
import OPS_BASE from '../js/trackOps.js';
import { buildCenterline } from '../js/centerline.js';

const clone = () => OPS_BASE.map(op => op.slice());

// 允许调整的直道下标
const FREE = OPS_BASE.map((op, i) => (op[0] === 's' ? i : -1)).filter(i => i >= 0);

function cost(ops) {
  const cl = buildCenterline(ops, 2);
  const N = cl.pts.length;
  const a = cl.pts[0], b = cl.pts[N - 1];
  const gap = Math.hypot(a.x - b.x, a.z - b.z);
  let dth = a.th - b.th;
  while (dth > Math.PI) dth -= Math.PI * 2;
  while (dth < -Math.PI) dth += Math.PI * 2;
  return gap + Math.abs(dth) * 200;
}

let ops = clone();
let best = cost(ops);
console.log('初始 cost:', best.toFixed(2));
for (let pass = 0; pass < 60; pass++) {
  let improved = false;
  for (const i of FREE) {
    for (const delta of [8, -8, 4, -4, 2, -2, 1, -1]) {
      const old = ops[i][1];
      ops[i][1] = +(old + delta).toFixed(1);
      if (ops[i][1] < 20) { ops[i][1] = old; continue; }
      const c = cost(ops);
      if (c < best - 1e-6) { best = c; improved = true; }
      else ops[i][1] = old;
    }
  }
  if (!improved) break;
}

const cl = buildCenterline(ops, 2);
const N = cl.pts.length;
const gap = Math.hypot(cl.pts[0].x - cl.pts[N - 1].x, cl.pts[0].z - cl.pts[N - 1].z);
console.log('闭合缺口:', gap.toFixed(3), 'm  长度:', cl.total.toFixed(0), 'm');
console.log(JSON.stringify(ops.map(o => o[0] === 's' ? ['s', Math.round(o[1]), o[2]] : o)));