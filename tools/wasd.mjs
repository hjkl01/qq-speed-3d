// 验证 WASD 与方向键等价（真实键盘事件，走完整 input → kart.update）
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
await new Promise(r => server.listen(8191, r));
const b = await chromium.launch({ channel: 'chrome', headless: true });
const page = await b.newPage({ viewport: { width: 1280, height: 720 } });
const errs = []; page.on('pageerror', e => errs.push(e.message));
await page.goto('http://localhost:8191/index.html');
await page.waitForTimeout(1200);
await page.keyboard.press('Enter');
await page.evaluate(() => window.__race.step(4.2, 60));   // 跑完倒计时
const st = async () => page.evaluate(() => ({ kmh: +window.__race.player.speedKmh.toFixed(1), th: +window.__race.player.th.toFixed(3), x: +window.__race.player.pos.x.toFixed(2), z: +window.__race.player.pos.z.toFixed(2) }));
const run = async (key, secs) => { await page.keyboard.down(key); await page.evaluate((s) => window.__race.step(s, 60), secs); await page.keyboard.up(key); };

const r = {};
r.phase = await page.evaluate(() => window.__race.game.phase);
r.base = await st();
await run('KeyW', 2.0); r.afterW = await st();
await page.keyboard.press('KeyR'); await page.evaluate(() => window.__race.step(0.2, 60));
await run('ArrowUp', 2.0); r.afterArrowUp = await st();
// 左右：W 加速后按 A / D 看 th 变化方向
await page.keyboard.press('KeyR'); await page.evaluate(() => window.__race.step(0.2, 60));
await run('KeyW', 1.5);
const before = await st();
await run('KeyA', 0.6); r.afterA = { ...(await st()), dth: +((await st()).th - before.th).toFixed(3) };
await page.keyboard.press('KeyR'); await page.evaluate(() => window.__race.step(0.2, 60));
await run('KeyW', 1.5);
const before2 = await st();
await run('KeyD', 0.6); r.afterD = { ...(await st()), dth: +((await st()).th - before2.th).toFixed(3) };
// W 和 ↑ 同时按，松开其中一个：油门不能跟着断（曾经 keyup 直接按动作删）
await page.evaluate(() => window.__race.input.clear());
await page.keyboard.down('KeyW'); await page.keyboard.down('ArrowUp');
await page.keyboard.up('ArrowUp');
r.dualUp = await page.evaluate(() => window.__race.input.throttle);
await page.keyboard.up('KeyW');
r.dualUpReleased = await page.evaluate(() => window.__race.input.throttle);

// S 刹车
await run('KeyW', 1.5);
const v1 = (await st()).kmh;
await run('KeyS', 1.2);
r.brake = { before: v1, after: (await st()).kmh };
// Space 漂移 + Ctrl 氮气
await page.evaluate(() => { const i = window.__race.input; i.down.add('up'); window.__race.step(0.4, 60); });
await page.keyboard.down('Space'); await page.keyboard.down('KeyA');
await page.evaluate(() => window.__race.step(1.0, 60));
r.drift = await page.evaluate(() => ({ drifting: window.__race.player.drifting, e: +window.__race.player.driftEnergy.toFixed(2) }));
await page.keyboard.up('Space'); await page.keyboard.up('KeyA');
await page.evaluate(() => window.__race.step(0.3, 60));
r.miniTurbo = await page.evaluate(() => +window.__race.player.boostTime.toFixed(2));
console.log(JSON.stringify({ ...r, errs }, null, 1));
await b.close(); server.close();
