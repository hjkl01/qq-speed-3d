// 截图 + 资源/错误检查
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
await new Promise(r => server.listen(8150, r));
const b = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=metal'] });
const page = await b.newPage({ viewport: { width: 1440, height: 810 } });
const bad = [];
page.on('response', r => { if (r.status() >= 400) bad.push(r.status() + ' ' + r.url()); });
page.on('pageerror', e => bad.push('ERR ' + e.message));
page.on('console', m => { if (m.type() === 'error') bad.push('CONSOLE ' + m.text()); });
await page.goto('http://localhost:8150/index.html');
await page.waitForTimeout(1500);
await page.screenshot({ path: '/tmp/s1-menu.png' });

await page.evaluate(() => window.__race.startRace());
await page.waitForTimeout(300);
await page.screenshot({ path: '/tmp/s2-countdown.png' });

// 用 AI 控制器把玩家开出去（保证画面真实）
await page.evaluate(() => {
  const r = window.__race;
  const AI = r.drivers[0].constructor;
  window.__pd = new AI(r.player, r.track, { skill: 1, lineBias: 0 });
  r.input.state = () => window.__pd.inputs(1 / 60, r.game.raceTime, r.karts[1]) || { throttle: 0.5, brake: false, steer: 0, drift: false };
  Object.defineProperty(r.input, 'nitro', { get: () => r.player.nitro >= 0.999, configurable: true });
  Object.defineProperty(r.input, 'throttle', { get: () => !!r.input.state().throttle, configurable: true });
  r.step(14, 60);
});
await page.waitForTimeout(500);
await page.screenshot({ path: '/tmp/s3-straight.png' });

const st = await page.evaluate(() => {
  const r = window.__race;
  r.step(9, 60);
  return { phase: r.game.phase, lap: r.player.lap, sp: +r.player.speedKmh.toFixed(0), drift: r.player.drifting, nitro: +r.player.nitro.toFixed(2) };
});
await page.waitForTimeout(500);
await page.screenshot({ path: '/tmp/s4-corner.png' });

// 强制漂移画面
const dr = await page.evaluate(() => {
  const r = window.__race;
  const base = r.input.state.bind(r.input);
  r.input.state = () => ({ ...base(), drift: true });
  r.step(1.6, 60);
  r.input.state = base;
  return { drift: r.player.drifting, energy: +r.player.driftEnergy.toFixed(2), slip: +r.player.slip.toFixed(2), cam: r.cam.mode };
});
await page.waitForTimeout(500);
await page.screenshot({ path: '/tmp/s5-drift.png' });

// 远景 + 车头视角
for (const [m, name] of [[1, 's6-far'], [2, 's7-hood']]) {
  await page.evaluate((m) => { const r = window.__race; r.cam.mode = m; r.cam.init = false; r.step(0.6, 60); }, m);
  await page.waitForTimeout(400);
  await page.screenshot({ path: `/tmp/${name}.png` });
}
await page.evaluate(() => { const r = window.__race; r.cam.mode = 0; r.cam.init = false; });

// 跑到终点 → 结算（多步几次确保整场跑完）
await page.evaluate(() => {
  const r = window.__race;
  for (let i = 0; i < 40 && r.game.phase !== 'results'; i++) r.step(10, 60);
});
await page.waitForTimeout(600);
await page.screenshot({ path: '/tmp/s8-results.png' });

const fin = await page.evaluate(() => {
  const r = window.__race;
  return { phase: r.game.phase, t: +r.game.raceTime.toFixed(1), laps: r.player.lapTimes.map(v => +v.toFixed(1)), perf: window.__perf };
});
console.log(JSON.stringify({ st, dr, fin, bad }, null, 1));
await b.close();
server.close();