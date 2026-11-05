// 镜头自检：拐弯时到底看不看得见前面。
// 指标：镜头朝向 vs「车→前方 20m 赛道中心」的夹角（越小越好），
//       以及该点投影到屏幕后是否在可视范围内（拐弯时必须在）。
// 退出码非 0 = 不达标，可直接进 make check。
import { chromium } from 'playwright-core';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
const ROOT = new URL('..', import.meta.url).pathname;
const MIME = { '.html': 'text/html;charset=utf-8', '.js': 'text/javascript;charset=utf-8', '.css': 'text/css;charset=utf-8' };
const server = createServer(async (req, res) => {
  try { let p = req.url.split('?')[0]; if (p === '/') p = '/index.html';
    const f = join(ROOT, normalize(p)); const d = await readFile(f);
    res.writeHead(200, { 'content-type': MIME[extname(f)] || 'application/octet-stream' }); res.end(d);
  } catch { res.writeHead(404); res.end('x'); } });
await new Promise(r => server.listen(8197, r));
const b = await chromium.launch({ channel: 'chrome', headless: true });
const page = await b.newPage({ viewport: { width: 1280, height: 720 } });
const errs = [];
page.on('pageerror', e => errs.push(e.message));
await page.goto('http://localhost:8197/index.html');
await page.waitForTimeout(1200);
await page.keyboard.press('Enter');
await page.evaluate(() => {
  const r = window.__race; r.startRace();
  const AI = r.drivers[0].constructor;
  const pd = new AI(r.player, r.track, { skill: 1, lineBias: 0 });
  r.input.state = () => pd.inputs(1 / 60, r.game.raceTime, r.karts[1]) || { throttle: false, brake: true, steer: 0, drift: false };
  Object.defineProperty(r.input, 'nitro', { get: () => r.player.nitro >= 0.999, configurable: true });
  Object.defineProperty(r.input, 'throttle', { get: () => !!r.input.state().throttle, configurable: true });
});

const out = await page.evaluate(() => {
  const R = window.__race, p = R.player, T = R.track, THREE = R.THREE;
  const fwd = new THREE.Vector3(), v = new THREE.Vector3(), dir = new THREE.Vector3();
  const ang = (a, b) => Math.abs(Math.atan2(Math.sin(b - a), Math.cos(b - a))) * 180 / Math.PI;
  const rec = {};
  for (const mode of [0, 1, 2]) {
    R.cam.mode = mode; R.cam.init = false;
    R.step(6, 60);            // 让镜头收敛
    const rows = [];
    window.__camHook = (cam) => {
      cam.updateMatrixWorld();
      const q = T.query(p.pos.x, p.pos.z, p.hint);
      cam.getWorldDirection(fwd);
      const camYaw = Math.atan2(fwd.z, fwd.x);
      const row = { curv: Math.abs(q.curv), kmh: p.speedKmh };
      for (const ahead of [20, 40]) {
        const t = T.at(q.s + ahead);
        row['err' + ahead] = ang(camYaw, Math.atan2(t.z - p.pos.z, t.x - p.pos.x));
        v.set(t.x, t.y + 0.3, t.z).project(cam);
        dir.set(t.x - cam.position.x, t.y - cam.position.y, t.z - cam.position.z);
        row['vis' + ahead] = cam.getWorldDirection(fwd).dot(dir) > 0 && Math.abs(v.x) <= 1 && Math.abs(v.y) <= 1;
      }
      rows.push(row);
    };
    R.step(60, 60);           // ≈ 一圈多
    window.__camHook = null;
    const stat = (f, key, pct = false) => {
      const a = rows.filter(f);
      if (!a.length) return null;
      if (pct) return +(100 * a.filter(r => r[key]).length / a.length).toFixed(1);
      const e = a.map(r => r[key]).sort((x, y) => x - y);
      return { avg: +(e.reduce((s, x) => s + x, 0) / e.length).toFixed(1), p95: +e[Math.floor(e.length * 0.95)].toFixed(1) };
    };
    const corner = r => r.curv > 1 / 120;      // 半径 < 120m 算弯道
    rec['mode' + mode] = {
      frames: rows.length,
      cornerPct: +(100 * rows.filter(corner).length / rows.length).toFixed(0),
      cornerErr20: stat(corner, 'err20'),
      cornerErr40: stat(corner, 'err40'),
      allErr20: stat(() => true, 'err20'),
      cornerVis20: stat(corner, 'vis20', true),
      cornerVis40: stat(corner, 'vis40', true),
    };
  }
  return rec;
});
console.log(JSON.stringify(out, null, 1));

// 追尾/远景视角：弯里 20m 前方的路面必须瞄得准、且在画面里
let fail = errs.slice();
if (!out || !out.mode0.cornerErr20) fail.push('no samples');
for (const m of ['mode0', 'mode1']) {
  const r = out[m];
  if (r.cornerErr20.avg > 8) fail.push(`${m} 弯道视线偏 ${r.cornerErr20.avg}°（>8°）`);
  if (r.cornerVis20 < 97) fail.push(`${m} 弯道前方 20m 可见率 ${r.cornerVis20}%（<97%）`);
}
if (fail.length) { console.error('❌ ' + fail.join('\n❌ ')); process.exit(1); }
console.log('✅ 弯道视线正常');
await b.close(); server.close();