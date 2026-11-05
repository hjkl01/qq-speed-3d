// 量化镜头跟随灵敏度：人为让车头高频摆动，看相机 yaw 跟随多少
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
await new Promise(r => server.listen(8193, r));
const b = await chromium.launch({ channel: 'chrome', headless: true });
const page = await b.newPage({ viewport: { width: 1280, height: 720 } });
await page.goto('http://localhost:8193/index.html');
await page.waitForTimeout(1200);
await page.keyboard.press('Enter');
await page.evaluate(() => window.__race.step(4.2, 60));
const r = await page.evaluate(() => {
  const R = window.__race, p = R.player;
  R.input.down.add('up');
  const log = [];
  window.__camHook = (cam) => log.push([p.th, cam.rotation.y]);
  for (let i = 0; i < 240; i++) {
    p.th += Math.sin(i * 0.30) * 0.020;   // 车头高频小幅摆动（约 ±1.1°）
    R.update(1 / 60);
  }
  window.__camHook = null;
  const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));
  const unwrap = (idx) => { const o = [log[0][idx]]; for (let i = 1; i < log.length; i++) o.push(o[i - 1] + wrap(log[i][idx] - log[i - 1][idx])); return o; };
  const th = unwrap(0), cam = unwrap(1);
  const pp = (a) => Math.max(...a) - Math.min(...a);
  const rate = (a) => { let m = 0; for (let i = 1; i < a.length; i++) m = Math.max(m, Math.abs(a[i] - a[i - 1]) * 60); return m; };
  return {
    kartP2P: +(pp(th) * 180 / Math.PI).toFixed(1),
    camP2P: +(pp(cam) * 180 / Math.PI).toFixed(1),
    kartMaxRate: +(rate(th) * 180 / Math.PI).toFixed(1),
    camMaxRate: +(rate(cam) * 180 / Math.PI).toFixed(1),
    followRatio: +(pp(cam) / pp(th)).toFixed(2),
    kmh: Math.round(p.speedKmh),
  };
});

// 场景 2：真实驾驶 —— 加速后漂移，记录车头摆动 vs 镜头摆动
const d = await page.evaluate(() => {
  const R = window.__race, p = R.player;
  R.input.down.clear();
  R.startRace(); R.game.phase = 'racing'; R.game.countdown = 0;
  R.input.down.add('up');
  R.step(2.5, 60);
  const log = [];
  window.__camHook = (cam) => log.push([p.th, cam.rotation.y]);
  R.input.down.add('drift'); R.input.down.add('left');
  R.step(1.6, 60);
  R.input.down.delete('drift'); R.input.down.delete('left');
  R.step(0.6, 60);
  window.__camHook = null;
  const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));
  const unwrap = (idx) => { const o = [log[0][idx]]; for (let i = 1; i < log.length; i++) o.push(o[i - 1] + wrap(log[i][idx] - log[i - 1][idx])); return o; };
  const th = unwrap(0), cam = unwrap(1);
  const pp = (a) => Math.max(...a) - Math.min(...a);
  const rate = (a) => { let m = 0; for (let i = 1; i < a.length; i++) m = Math.max(m, Math.abs(a[i] - a[i - 1]) * 60); return m; };
  // 高频抖动（去掉 15 帧滑动平均后的残差标准差）才是"晃"的观感
  const hp = (a) => { const w = 15, o = []; for (let i = w; i < a.length; i++) { let s = 0; for (let j = i - w; j < i; j++) s += a[j]; o.push(a[i] - s / w); } const m = o.reduce((x, y) => x + y, 0) / o.length; return Math.sqrt(o.reduce((x, y) => x + (y - m) ** 2, 0) / o.length); };
  return {
    kartP2P: +(pp(th) * 180 / Math.PI).toFixed(1),
    camP2P: +(pp(cam) * 180 / Math.PI).toFixed(1),
    kartMaxRate: +(rate(th) * 180 / Math.PI).toFixed(1),
    camMaxRate: +(rate(cam) * 180 / Math.PI).toFixed(1),
    kartJitter: +(hp(th) * 180 / Math.PI).toFixed(2),
    camJitter: +(hp(cam) * 180 / Math.PI).toFixed(2),
    followRatio: +(pp(cam) / pp(th)).toFixed(2),
    kmh: Math.round(p.speedKmh),
  };
});
console.log(JSON.stringify({ synthetic: r, drift: d }));
await b.close(); server.close();
