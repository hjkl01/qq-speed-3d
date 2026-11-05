// 逻辑自检：4 车全程用 AI 控制器跑完 3 圈，检查圈数/名次/结算
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
await new Promise(r => server.listen(8142, r));
const b = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=metal'] });
const page = await b.newPage();
const errs = [];
page.on('pageerror', e => errs.push(e.message));
await page.goto('http://localhost:8142/index.html');
await page.waitForTimeout(1200);

await page.evaluate(() => {
  const r = window.__race;
  r.startRace();
  // 玩家也用 AI 控制器
  const AI = r.drivers[0].constructor;
  const pd = new AI(r.player, r.track, { skill: 1, lineBias: 0 });
  window.__pd = pd;
  // 通过输入层驱动玩家，走完整 input → kart.update 路径
  r.input.state = () => pd.inputs(1 / 60, r.game.raceTime, r.karts[1]) || { throttle: false, brake: true, steer: 0, drift: false };
  Object.defineProperty(r.input, 'nitro', { get: () => r.player.nitro >= 0.999, configurable: true });
  Object.defineProperty(r.input, 'throttle', { get: () => !!r.input.state().throttle, configurable: true });
});

const lines = [];
let done = false;
for (let n = 0; n < 60 && !done; n++) {
  const s = await page.evaluate(() => {
    const r = window.__race;
    r.step(5, 60);
    return {
      t: +r.game.raceTime.toFixed(1), ph: r.game.phase,
      k: r.karts.map(k => `${k.name} L${k.lap} ${Math.round(k.progress)}m ${Math.round(k.speedKmh)}k${k.finished ? ' FIN' : ''}${k.driftTime > 0.2 ? ' ~' : ''}`),
      laps: r.karts.map(k => k.lapTimes.map(v => +v.toFixed(1))),
      nan: r.karts.some(k => !isFinite(k.pos.x) || !isFinite(k.progress)),
      pd: window.__pd.dbg ? `err${window.__pd.dbg.err.toFixed(2)} vT${window.__pd.dbg.vTarget.toFixed(0)} ${window.__pd.dbg.throttle ? 'T' : ''}${window.__pd.dbg.brake ? 'B' : ''} off${window.__pd.dbg.off.toFixed(1)}` : '-',
    };
  });
  lines.push(`${s.t}s ${s.ph} | ${s.k.join(' | ')} | ${s.pd}${s.nan ? ' NAN!' : ''}`);
  done = s.ph === 'results';
}
console.log(lines.join('\n'));
const res = await page.evaluate(() => {
  const r = window.__race;
  r.step(3, 60);
  return {
    phase: r.game.phase,
    rows: [...document.querySelectorAll('#resultTable tr, .rrow, #resRows tr')].map(e => e.textContent.replace(/\s+/g, ' ').trim()),
    laps: r.karts.map(k => `${k.name}:${k.lapTimes.map(v => v.toFixed(1)).join('/')}`),
    best: r.karts.map(k => (k.bestLap === Infinity ? '-' : k.bestLap.toFixed(1))),
  };
});
console.log(JSON.stringify(res, null, 1));
console.log('ERRORS', errs.slice(0, 4));
await b.close();
server.close();