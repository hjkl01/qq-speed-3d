// 三种相机模式下：车是否在画面内、镜头角速度是否合理
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
await new Promise(r => server.listen(8195, r));
const b = await chromium.launch({ channel: 'chrome', headless: true });
const page = await b.newPage({ viewport: { width: 1280, height: 720 } });
await page.goto('http://localhost:8195/index.html');
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
const out = {};
for (const mode of [0, 1, 2]) {
  out['mode' + mode] = await page.evaluate((m) => {
    const R = window.__race, p = R.player;
    R.cam.mode = m; R.step(6, 60);   // 让镜头稳定
    const xs = [], rates = [];
    let prev = null;
    const v = new R.THREE.Vector3();
    window.__camHook = (cam) => {
      cam.updateMatrixWorld();
      v.set(p.pos.x, p.pos.y + 0.9, p.pos.z).project(cam);
      xs.push(v.x);
      const y = Math.atan2(Math.sin(cam.rotation.y), Math.cos(cam.rotation.y));
      if (prev !== null) { let d = y - prev; d = Math.atan2(Math.sin(d), Math.cos(d)); rates.push(Math.abs(d) * 60 * 180 / Math.PI); }
      prev = y;
    };
    R.step(12, 60);
    window.__camHook = null;
    const q = (a, f) => { const s = [...a].sort((m, n) => m - n); return +s[Math.floor(f * (s.length - 1))].toFixed(2); };
    return { ndcX: [+Math.min(...xs).toFixed(2), +Math.max(...xs).toFixed(2)], camRateP95: q(rates, 0.95), camRateMax: +Math.max(...rates).toFixed(1), kmh: Math.round(p.speedKmh) };
  }, mode);
}
console.log(JSON.stringify(out));
await b.close(); server.close();
