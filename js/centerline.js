// 赛道中心线生成：由直道 / 圆弧 ops 采样出等距(≈2m)采样点
// 采样点字段: x,y,z, th(朝向), curv(曲率, 正=右弯), s(里程)

export function buildCenterline(ops, step = 2.0) {
  let x = 0, z = 0, th = 0, y = 0;
  const pts = [];
  const push = (px, pz, py, pth, curv) =>
    pts.push({ x: px, y: py, z: pz, th: pth, curv });

  for (const op of ops) {
    if (op[0] === 's') {
      const [, len, yEnd] = op;
      const n = Math.max(1, Math.round(len / step));
      for (let i = 0; i < n; i++) {
        const t = i / n;
        push(x + Math.cos(th) * len * t, z + Math.sin(th) * len * t, y + (yEnd - y) * t, th, 0);
      }
      x += Math.cos(th) * len;
      z += Math.sin(th) * len;
      y = yEnd;
    } else {
      const [, deg, R, dir, yEnd] = op;
      const ang = (deg * Math.PI) / 180;
      const sgn = dir === 'R' ? 1 : -1;          // 右转为正
      const cx = x + R * sgn * -Math.sin(th);    // 右向量 = (-sinθ, cosθ)
      const cz = z + R * sgn * Math.cos(th);
      const phi0 = Math.atan2(z - cz, x - cx);
      const arcLen = ang * R;
      const n = Math.max(2, Math.round(arcLen / step));
      for (let i = 0; i < n; i++) {
        const t = i / n;
        const phi = phi0 + sgn * ang * t;
        push(
          cx + R * Math.cos(phi),
          cz + R * Math.sin(phi),
          y + (yEnd - y) * t,
          phi + sgn * Math.PI / 2,
          sgn / R,
        );
      }
      th += sgn * ang;
      // 用公式重新落点，避免累积误差
      x = cx + R * Math.cos(phi0 + sgn * ang);
      z = cz + R * Math.sin(phi0 + sgn * ang);
      y = yEnd;
    }
  }
  // 里程
  let s = 0;
  for (let i = 0; i < pts.length; i++) {
    pts[i].s = s;
    const a = pts[i], b = pts[(i + 1) % pts.length];
    s += Math.hypot(b.x - a.x, b.z - a.z);
  }
  const total = s;
  // 闭环处平滑朝向
  for (const p of pts) {
    p.th = ((p.th % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
  }
  return { pts, total };
}

// 弧长→采样点插值
export function sampleAt(cl, s) {
  const { pts, total } = cl;
  s = ((s % total) + total) % total;
  // 二分查找
  let lo = 0, hi = pts.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (pts[mid].s <= s) lo = mid; else hi = mid - 1;
  }
  const a = pts[lo], b = pts[(lo + 1) % pts.length];
  const segLen = (b.s > a.s ? b.s - a.s : total - a.s + b.s) || 1;
  const t = Math.min(1, Math.max(0, (s - a.s) / segLen));
  return {
    x: a.x + (b.x - a.x) * t,
    y: a.y + (b.y - a.y) * t,
    z: a.z + (b.z - a.z) * t,
    th: a.th + shortestAngle(a.th, b.th) * t,
    curv: a.curv + (b.curv - a.curv) * t,
    s,
  };
}

export function shortestAngle(from, to) {
  let d = (to - from) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
}