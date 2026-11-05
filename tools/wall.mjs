// 回归自检：蹭墙/顶墙不应该把速度打没（曾经每帧 *0.86，顶着墙按住 W 只跑 13km/h）
import { chromium } from 'playwright-core';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
const ROOT = new URL('..', import.meta.url).pathname;
const MIME = { '.html': 'text/html;charset=utf-8', '.js': 'text/javascript;charset=utf-8', '.css': 'text/css;charset=utf-8' };
const server = createServer(async (req, res) => {
  try {
    let p = req.url.split('?')[0]; if (p === '/') p = '/index.html';
    const f = join(ROOT, normalize(p)); const d = await readFile(f);
    res.writeHead(200, { 'content-type': MIME[extname(f)] || 'application/octet-stream' }); res.end(d);
  } catch { res.writeHead(404); res.end('x'); }
});
await new Promise(r => server.listen(8163, r));

const b = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=metal'] });
const page = await b.newPage({ viewport: { width: 900, height: 560 } });
const errs = [];
page.on('pageerror', e => errs.push(e.message));
await page.goto('http://localhost:8163/index.html');
await page.waitForTimeout(1000);

const step = (s) => page.evaluate((s) => window.__race.step(s, 60), s);
const kmh = () => page.evaluate(() => +window.__race.player.speedKmh.toFixed(0));

// 车头垂直顶住护栏、静止
const noseToWall = () => page.evaluate(() => {
  const r = window.__race, p = r.player;
  if (r.game.phase !== 'racing') r.startRace();
  const q = r.track.query(p.pos.x, p.pos.z, p.hint);
  p.pos.x += q.rightx * (q.half + 0.3);
  p.pos.z += q.rightz * (q.half + 0.3);
  p.speed = 0;
  p.th = Math.atan2(q.rightz, q.rightx);
  p.course = p.th;
  p.hint = -1;
});

const fail = [];
await noseToWall();
await step(4.5);                       // 过完倒计时
await page.keyboard.down('ArrowUp');
await step(3);
const stuck = await kmh();
await page.keyboard.up('ArrowUp');

// 回到赛道，直道不转向 → 高速撞墙后贴墙滑行
await page.evaluate(() => { window.__race.player.resetToTrack(); });
await step(0.5);
await page.keyboard.down('ArrowUp');
await step(7);                         // 233km/h 撞墙
const hit = await kmh();
await step(1);
const scrape = await kmh();
await page.keyboard.up('ArrowUp');
await b.close(); server.close();

if (!(stuck > 30)) fail.push(`顶墙后按住 W 仍起不来：${stuck}km/h`);
if (!(scrape > 120)) fail.push(`贴墙滑行掉速过多：撞墙 ${hit}km/h → ${scrape}km/h`);
console.log(JSON.stringify({ stuck, hit, scrape, errs, fail }, null, 1));
if (errs.length || fail.length) process.exit(1);