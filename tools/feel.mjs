// 手感自检：用真实键盘事件走完 加速→漂移→小喷→双喷→氮气
import { chromium } from 'playwright-core';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
const ROOT = new URL('..', import.meta.url).pathname;
const MIME = { '.html': 'text/html;charset=utf-8', '.js': 'text/javascript;charset=utf-8', '.css': 'text/css;charset=utf-8' };
const server = createServer(async (req, res) => {
  try {
    let p = req.url.split('?')[0];
    if (p === '/') p = '/index.html';
    const f = join(ROOT, normalize(p));
    const d = await readFile(f);
    res.writeHead(200, { 'content-type': MIME[extname(f)] || 'application/octet-stream' });
    res.end(d);
  } catch { res.writeHead(404); res.end('x'); }
});
await new Promise(r => server.listen(8160, r));
const b = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=metal'] });
const page = await b.newPage({ viewport: { width: 1200, height: 700 } });
const errs = [];
page.on('pageerror', e => errs.push(e.message));
await page.goto('http://localhost:8160/index.html');
await page.waitForTimeout(1200);

const step = (s) => page.evaluate((s) => window.__race.step(s, 60), s);
const st = () => page.evaluate(() => {
  const p = window.__race.player;
  return {
    kmh: +p.speedKmh.toFixed(0), drift: p.drifting, energy: +p.driftEnergy.toFixed(2),
    nos: +p.nitro.toFixed(2), boost: +p.boostTime.toFixed(2), boostMul: +p.boostMul.toFixed(2),
    slip: +p.slip.toFixed(2), lap: p.lap, prog: Math.round(p.progress), hit: p.wallHits ?? 0,
  };
});

await page.evaluate(() => window.__race.startRace());
// 倒计时最后 0.3s 开始按住油门 → 起步加速
await step(3.2);
await page.keyboard.down('ArrowUp');
await step(0.5);
const a0 = await st();
await step(3);
const a1 = await st();
// 漂移：Shift + 左
await page.keyboard.down('ShiftLeft');
await page.keyboard.down('ArrowLeft');
await step(1.2);
const d0 = await st();
await step(1.2);
const d1 = await st();
// 松手 → 小喷
await page.keyboard.up('ShiftLeft');
await page.keyboard.up('ArrowLeft');
await step(0.1);
const m0 = await st();
// 0.5s 内再次漂移 → 双喷
await page.keyboard.down('ShiftLeft');
await page.keyboard.down('ArrowLeft');
await step(0.9);
const dbl = await page.evaluate(() => {
  const p = window.__race.player;
  return { drift: p.drifting, energy: +p.driftEnergy.toFixed(2) };
});
await page.keyboard.up('ShiftLeft');
await page.keyboard.up('ArrowLeft');
await step(0.1);
const m1 = await st();
// 氮气
await page.evaluate(() => { window.__race.player.nitro = 1; });
await page.keyboard.down('ControlLeft');
await step(0.15);
const n0 = await st();
await page.keyboard.up('ControlLeft');
await step(2.5);
const n1 = await st();
// 复位
await page.keyboard.press('KeyR');
await step(0.3);
const r0 = await page.evaluate(() => {
  const r = window.__race;
  const q = r.track.query(r.player.pos.x, r.player.pos.z, r.player.hint);
  return { off: +q.offset.toFixed(1), kmh: +r.player.speedKmh.toFixed(0) };
});
// 相机 / 暂停 / 静音
await page.keyboard.press('KeyC');
const camMode = await page.evaluate(() => window.__race.cam.mode);
await page.keyboard.press('Escape');
await step(0.1);
const paused = await page.evaluate(() => window.__race.game.phase);
await page.keyboard.press('Escape');
await step(0.1);
const resumed = await page.evaluate(() => window.__race.game.phase);
await page.keyboard.press('KeyM');
await step(0.1);
const muted = await page.evaluate(() => {
  const t = [...document.querySelectorAll('.toasts .toast')].map(e => e.textContent).join('|');
  return `${t} muted=${window.__race.hud && window.__race.hud.audioMuted}`;
});
await page.keyboard.press('KeyM');

console.log(JSON.stringify({ a0, a1, d0, d1, m0, dbl, m1, n0, n1, r0, camMode, paused, resumed, muted, errs }, null, 1));
await b.close();
server.close();