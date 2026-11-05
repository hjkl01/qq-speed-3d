// 浏览器自检：加载页面 / 收集报错 / 起跑 / 漂移 / 截图
import { chromium } from 'playwright-core';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname;
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.json': 'application/json',
};

const server = createServer(async (req, res) => {
  try {
    let p = decodeURIComponent(req.url.split('?')[0]);
    if (p === '/' || p === '') p = '/index.html';
    const file = join(ROOT, normalize(p).replace(/^(\.\.[/\\])+/, ''));
    const data = await readFile(file);
    res.writeHead(200, { 'content-type': MIME[extname(file)] || 'application/octet-stream' });
    res.end(data);
  } catch (e) {
    res.writeHead(404); res.end('404 ' + req.url);
  }
});
await new Promise(r => server.listen(8123, r));

const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-gl=angle', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1440, height: 860 } });
const errors = [];
page.on('console', (m) => {
  if (m.type() === 'error' || m.type() === 'warning') errors.push(`${m.type()}: ${m.text()}`);
});
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}\n${e.stack}`));

await page.goto('http://localhost:8123/index.html', { waitUntil: 'load' });
await page.waitForTimeout(2500);
await page.screenshot({ path: '/tmp/shot-menu.png' });

// 开始
await page.click('#btnStart');
await page.waitForTimeout(5200); // 倒计时 4s
await page.screenshot({ path: '/tmp/shot-start.png' });

// 加速 3 秒
await page.keyboard.down('ArrowUp');
await page.waitForTimeout(3000);
const s1 = await page.evaluate(() => ({ sp: window.__race.player.speedKmh, phase: window.__race.game.phase, lap: window.__race.player.lap }));
await page.screenshot({ path: '/tmp/shot-run.png' });

// 漂移
await page.keyboard.down('Shift');
await page.keyboard.down('ArrowRight');
await page.waitForTimeout(800);
const s2 = await page.evaluate(() => ({
  drifting: window.__race.player.drifting,
  energy: window.__race.player.driftEnergy,
  slip: window.__race.player.slip,
  nos: window.__race.player.nitro,
}));
await page.screenshot({ path: '/tmp/shot-drift.png' });
await page.keyboard.up('Shift');
await page.keyboard.up('ArrowRight');
await page.waitForTimeout(400);
const s3 = await page.evaluate(() => ({ boost: window.__race.player.boostTime, kind: window.__race.player.boostKind }));

// 自动驾驶 20 秒看 AI 是否跑完圈
await page.evaluate(() => {
  window.__auto = true;
  const r = window.__race;
  setInterval(() => {
    const k = r.player;
    const q = r.track.query(k.pos.x, k.pos.z, k.hint);
    const p = r.track.at(q.s + 14 + Math.abs(k.speed) * 0.5);
    const tx = p.x, tz = p.z;
    const want = Math.atan2(tz - k.pos.z, tx - k.pos.x);
    let d = (want - k.th + Math.PI * 3) % (Math.PI * 2) - Math.PI;
    window.__steer = Math.max(-1, Math.min(1, d * 2));
    window.__thr = Math.abs(d) > 0.5 ? 0.2 : 1;
  }, 16);
});
await page.keyboard.up('ArrowUp');

// 用脚本注入输入（模拟玩家稳定跑圈）
for (let i = 0; i < 40; i++) {
  const st = await page.evaluate(() => {
    const r = window.__race; const k = r.player;
    return { st: window.__steer, thr: window.__thr, sp: k.speedKmh, s: k.progress, lap: k.lap };
  });
  if (st.st > 0.1) await page.keyboard.down('ArrowRight');
  else if (st.st < -0.1) await page.keyboard.down('ArrowLeft');
  else { await page.keyboard.up('ArrowRight'); await page.keyboard.up('ArrowLeft'); }
  if (st.thr > 0.5) await page.keyboard.down('ArrowUp');
  else { await page.keyboard.up('ArrowUp'); await page.keyboard.down('ArrowDown'); }
  await page.waitForTimeout(500);
  if (st.thr <= 0.5) { await page.keyboard.up('ArrowDown'); }
}
const s4 = await page.evaluate(() => {
  const r = window.__race;
  return {
    phase: r.game.phase,
    raceTime: r.game.raceTime,
    player: { lap: r.player.lap, prog: r.player.progress, sp: r.player.speedKmh, best: r.player.bestLap, nos: r.player.nitro },
    ai: r.karts.filter(k => !k.isPlayer).map(k => ({ n: k.name, lap: k.lap, prog: Math.round(k.progress), sp: Math.round(k.speedKmh), fin: k.finished })),
    fps: 0,
  };
});
await page.screenshot({ path: '/tmp/shot-late.png' });

// FPS
const fps = await page.evaluate(() => new Promise((res) => {
  let n = 0; const t0 = performance.now();
  const tick = () => { n++; if (performance.now() - t0 < 2000) requestAnimationFrame(tick); else res(Math.round(n / ((performance.now() - t0) / 1000))); };
  requestAnimationFrame(tick);
}));

console.log(JSON.stringify({ s1, s2, s3, s4, fps, errors }, null, 2));
await browser.close();
server.close();