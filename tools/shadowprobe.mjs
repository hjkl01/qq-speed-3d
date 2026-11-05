// 俯视截图 + 像素分析：检测车底/场景是否有阴影
import { chromium } from 'playwright-core';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { execSync } from 'node:child_process';
const ROOT = '/Users/jinlong/dev/github/qq-speed-3d';
const MIME = { '.html': 'text/html;charset=utf-8', '.js': 'text/javascript;charset=utf-8', '.css': 'text/css;charset=utf-8' };
const server = createServer(async (req, res) => {
  try { let p = req.url.split('?')[0]; if (p === '/') p = '/index.html';
    const f = join(ROOT, normalize(p)); const d = await readFile(f);
    res.writeHead(200, { 'content-type': MIME[extname(f)] || 'application/octet-stream' }); res.end(d);
  } catch { res.writeHead(404); res.end('x'); } });
await new Promise(r => server.listen(8163, r));
const W = 800, H = 800;
const b = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=metal'] });
const page = await b.newPage({ viewport: { width: W, height: H } });
page.on('pageerror', e => console.log('ERR', e.message));
await page.goto('http://localhost:8163/index.html');
await page.waitForTimeout(1500);
await page.evaluate(() => window.__race.startRace());
await page.evaluate(() => window.__race.step(4, 60));
await page.evaluate(() => {
  window.__camHook = (cam) => {
    const p = window.__race.player.pos;
    cam.position.set(p.x + 0.01, p.y + 13, p.z);
    cam.lookAt(p.x, p.y, p.z);
  };
});
await page.waitForTimeout(500);
await page.screenshot({ path: '/tmp/p-top.png' });
const info = await page.evaluate(() => {
  const r = window.__race;
  return { shadowMap: !!r.sun.shadow.map, size: r.sun.shadow.map?.width, camBox: r.sun.shadow.camera.right,
           enabled: r.renderer.shadowMap.enabled, meshes: (() => { let n = 0; r.scene.traverse(o => { if (o.isMesh && o.castShadow) n++; }); return n; })() };
});
// 关掉太阳阴影再拍一张，对比差异（判断阴影是否真的在渲染）
await page.evaluate(() => { window.__race.sun.castShadow = false; window.__race.renderer.shadowMap.needsUpdate = true; });
await page.waitForTimeout(700);
await page.screenshot({ path: '/tmp/p-top-noshadow.png' });

// 像素：中心 90x90（车底）与 260x260 外环（路面）亮度
const raw = execSync('ffmpeg -v error -i /tmp/p-top.png -vf format=rgb24 -f rawvideo -', { maxBuffer: 1e8 });
const lum = (x, y) => { const i = (y * W + x) * 3; return 0.299 * raw[i] + 0.587 * raw[i + 1] + 0.114 * raw[i + 2]; };
const mean = (x0, y0, x1, y1) => { let s = 0, n = 0; for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) { s += lum(x, y); n++; } return s / n; };
const c = W / 2;
const center = mean(c - 45, c - 45, c + 45, c + 45);
const near = mean(c - 130, c - 130, c + 130, c + 130);
const far = mean(60, 60, 200, 200);
const raw2 = execSync('ffmpeg -v error -i /tmp/p-top-noshadow.png -vf format=rgb24 -f rawvideo -', { maxBuffer: 1e8 });
let diff = 0, tot = 0, maxd = 0;
for (let i = 0; i < W * H; i++) { const d = Math.abs(raw[i * 3] - raw2[i * 3]); tot += d; if (d > 6) diff++; if (d > maxd) maxd = d; }
const shadowStats = { changedPct: +(diff / (W * H) * 100).toFixed(1), meanDelta: +(tot / (W * H)).toFixed(2), maxDelta: maxd };
console.log(JSON.stringify({ info, shadowStats, center: +center.toFixed(1), near: +near.toFixed(1), far: +far.toFixed(1) }));
await b.close(); server.close();
