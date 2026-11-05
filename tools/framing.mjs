// 车在画面里的位置/占比（用模型 bbox 投影到屏幕，比看截图猜更准）
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
await new Promise(r => server.listen(8196, r));
const b = await chromium.launch({ channel: 'chrome', headless: true });
const page = await b.newPage({ viewport: { width: 1280, height: 720 } });
await page.goto('http://localhost:8196/index.html');
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
  const R = window.__race, p = R.player, THREE = R.THREE;
  const box = new THREE.Box3(), v = new THREE.Vector3();
  const samples = [];
  window.__camHook = (cam) => {
    cam.updateMatrixWorld();
    box.setFromObject(p.root);
    let x0 = 9, x1 = -9, y0 = 9, y1 = -9;
    for (const sx of [box.min.x, box.max.x]) for (const sy of [box.min.y, box.max.y]) for (const sz of [box.min.z, box.max.z]) {
      v.set(sx, sy, sz).project(cam);
      x0 = Math.min(x0, v.x); x1 = Math.max(x1, v.x); y0 = Math.min(y0, v.y); y1 = Math.max(y1, v.y);
    }
    samples.push({ x0, x1, y0, y1 });
  };
  R.step(40, 60);
  window.__camHook = null;
  const avg = (k) => +(samples.reduce((s, o) => s + o[k], 0) / samples.length).toFixed(2);
  const worst = (k, f) => +samples.map(o => o[k]).sort((a, c) => a - c)[Math.floor(f * (samples.length - 1))].toFixed(2);
  return {
    n: samples.length,
    avgBox: { l: avg('x0'), r: avg('x1'), b: avg('y0'), t: avg('y1') },
    p2Box: { l: worst('x0', 0.02), r: worst('x1', 0.98), b: worst('y0', 0.02), t: worst('y1', 0.98) },
    // 屏幕占比（像素，1280x720）
    pxWidth: Math.round((avg('x1') - avg('x0')) * 640),
    pxHeight: Math.round((avg('y1') - avg('y0')) * 360),
    cutSides: samples.filter(o => o.x0 < -1 || o.x1 > 1 || o.y0 < -1).length,
  };
});
console.log(JSON.stringify(out));
await b.close(); server.close();
