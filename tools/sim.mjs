// 逻辑自检：无渲染快速推进一整场比赛（自动驾驶）
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
await new Promise(r => server.listen(8130, r));

const b = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=metal'] });
const page = await b.newPage({ viewport: { width: 1000, height: 640 } });
const errs = [];
page.on('pageerror', e => errs.push(e.message));
await page.goto('http://localhost:8130/index.html');
await page.waitForTimeout(1200);

await page.evaluate(() => {
  const r = window.__race;
  r.startRace();
  // 自动驾驶：纯追踪 + 弯前减速 + 弯道漂移
  const state = () => {
    const k = r.player;
    const q = r.track.query(k.pos.x, k.pos.z, k.hint);
    const sp = Math.abs(k.speed);
    const look = 12 + sp * 0.5;
    const p = r.track.at(q.s + look);
    let err = ((Math.atan2(p.z - k.pos.z, p.x - k.pos.x) - k.th + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
    let curv = 0;
    for (let i = 0; i < 6; i++) {
      const c = r.track.at(q.s + 15 + sp * (0.4 + i * 0.4));
      if (Math.abs(c.curv) > Math.abs(curv)) curv = c.curv;
    }
    const vT = Math.sqrt(30 / Math.max(1 / 900, Math.abs(curv)));
    const brake = sp > vT * 1.03;
    const drift = Math.abs(curv) > 1 / 80 && sp > 26;
    return {
      throttle: !brake && sp < vT * 1.05,
      brake,
      steer: Math.max(-1, Math.min(1, err * 2.2)),
      drift,
    };
  };
  r.input.state = state;
  Object.defineProperty(r.input, 'nitro', { get: () => r.player.nitro >= 0.999 });
  Object.defineProperty(r.input, 'throttle', { get: () => state().throttle });
});

const log = [];
for (let i = 0; i < 40; i++) {
  const s = await page.evaluate(() => {
    const r = window.__race;
    r.step(5, 60);
    return {
      t: +r.game.raceTime.toFixed(1),
      ph: r.game.phase,
      p: { lap: r.player.lap, prog: +r.player.progress.toFixed(0), sp: +r.player.speedKmh.toFixed(0), lt: r.player.lapTimes.map(v => +v.toFixed(1)), fin: r.player.finished },
      ai: r.karts.filter(k => !k.isPlayer).map(k => `${k.lap}:${Math.round(k.progress)}:${Math.round(k.speedKmh)}${k.finished ? ':FIN' : ''}${k.stuckT ? ':S' + k.stuckT.toFixed(1) : ''}`),
      nan: r.karts.some(k => !isFinite(k.pos.x) || !isFinite(k.pos.z) || !isFinite(k.speed)),
    };
  });
  log.push(s);
  if (s.ph === 'results' || s.p.fin) break;
}
console.log(log.map(l => `${l.t}s ph=${l.ph} P${l.p.lap}@${l.p.prog} ${l.p.sp}km/h ${l.p.fin ? 'FIN' : ''} | ${l.ai.join(' ')}${l.nan ? ' NAN!' : ''}`).join('\n'));

// 结算
const res = await page.evaluate(async () => {
  const r = window.__race;
  r.step(6, 60);
  return {
    phase: r.game.phase,
    table: [...document.querySelectorAll('.rrow')].map(e => e.textContent.replace(/\s+/g, ' ').trim()),
    stats: document.getElementById('resultStats')?.textContent.replace(/\s+/g, ' ').trim(),
    laps: r.player.lapTimes,
  };
});
console.log(JSON.stringify(res, null, 1));
console.log('ERRORS', errs.slice(0, 5));
await b.close();
server.close();