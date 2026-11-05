// AI 驾驶跑一圈：车会不会被甩出画面 + 镜头角速度分布
import { chromium } from 'playwright-core';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
const ROOT = '/Users/jinlong/dev/github/qq-speed-3d';
const MIME = { '.html': 'text/html;charset=utf-8', '.js': 'text/javascript;charset=utf-8', '.css': 'text/css;charset=utf-8' };
const server = createServer(async (req, res) => {
  try { let p = req.url.split('?')[0]; if (p === '/') p = '/index.html';
    const f = join(ROOT, normalize(p)); const d = await readFile(f);
    res.writeHead(200, { 'content-type': MIME[extname(f)] || 'application/octet-stream' }); res.end(d);
  } catch { res.writeHead(404); res.end('x'); } });
await new Promise(r => server.listen(8194, r));
const b = await chromium.launch({ channel: 'chrome', headless: true });
const page = await b.newPage({ viewport: { width: 1280, height: 720 } });
await page.goto('http://localhost:8194/index.html');
await page.waitForTimeout(1200);
await page.keyboard.press('Enter');
await page.evaluate(() => {
  const r = window.__race;
  r.startRace();
  const AI = r.drivers[0].constructor;
  const pd = new AI(r.player, r.track, { skill: 1, lineBias: 0 });
  r.input.state = () => pd.inputs(1 / 60, r.game.raceTime, r.karts[1]) || { throttle: false, brake: true, steer: 0, drift: false };
  Object.defineProperty(r.input, 'nitro', { get: () => r.player.nitro >= 0.999, configurable: true });
  Object.defineProperty(r.input, 'throttle', { get: () => !!r.input.state().throttle, configurable: true });
});
const out = await page.evaluate(() => {
  const R = window.__race, p = R.player;
  const xs = [], ys = [], rates = [];
  let prevYaw = null;
  const v = new R.THREE.Vector3();
  window.__camHook = (cam) => {
    cam.updateMatrixWorld();
    v.set(p.pos.x, p.pos.y + 0.9, p.pos.z).project(cam);
    xs.push(v.x); ys.push(v.y);
    const y = Math.atan2(Math.sin(cam.rotation.y), Math.cos(cam.rotation.y));
    if (prevYaw !== null) { let d = y - prevYaw; d = Math.atan2(Math.sin(d), Math.cos(d)); rates.push(Math.abs(d) * 60 * 180 / Math.PI); }
    prevYaw = y;
  };
  R.step(70, 60);   // AI 驾驶跑完一圈多
  window.__camHook = null;
  const q = (a, f) => { const s = [...a].sort((m, n) => m - n); return +s[Math.floor(f * (s.length - 1))].toFixed(3); };
  return {
    frames: xs.length,
    ndcX: { min: +Math.min(...xs).toFixed(2), max: +Math.max(...xs).toFixed(2), p05: q(xs, 0.05), p95: q(xs, 0.95) },
    ndcY: { min: +Math.min(...ys).toFixed(2), max: +Math.max(...ys).toFixed(2) },
    camRate: { p50: q(rates, 0.5), p95: q(rates, 0.95), max: +Math.max(...rates).toFixed(1) },
    lap: p.lap, kmh: Math.round(p.speedKmh),
  };
});
console.log(JSON.stringify(out));
await b.close(); server.close();
