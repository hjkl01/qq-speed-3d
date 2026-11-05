// 卡丁车特写：投影玩家车到屏幕坐标，再裁剪放大，方便看清模型
import { chromium } from 'playwright-core';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { execSync } from 'node:child_process';
const ROOT = '/Users/jinlong/dev/github/qq-speed3d'.replace('qq-speed3d', 'qq-speed-3d');
const MIME = { '.html': 'text/html;charset=utf-8', '.js': 'text/javascript;charset=utf-8', '.css': 'text/css;charset=utf-8' };
const server = createServer(async (req, res) => {
  try {
    let p = req.url.split('?')[0]; if (p === '/') p = '/index.html';
    const f = join(ROOT, normalize(p)); const d = await readFile(f);
    res.writeHead(200, { 'content-type': MIME[extname(f)] || 'application/octet-stream' }); res.end(d);
  } catch { res.writeHead(404); res.end('x'); }
});
await new Promise(r => server.listen(8162, r));
const W = 1440, H = 810;
const b = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=metal'] });
const page = await b.newPage({ viewport: { width: W, height: H } });
page.on('pageerror', e => console.log('ERR', e.message));
await page.goto('http://localhost:8162/index.html');
await page.waitForTimeout(1500);
await page.screenshot({ path: '/tmp/k0-menu.png' });

await page.evaluate(() => window.__race.startRace());
await page.evaluate(() => {
  const r = window.__race;
  const AI = r.drivers[0].constructor;
  window.__pd = new AI(r.player, r.track, { skill: 1, lineBias: 0 });
  r.input.state = () => window.__pd.inputs(1 / 60, r.game.raceTime, r.karts[1]) || { throttle: 0.5, brake: false, steer: 0, drift: false };
  Object.defineProperty(r.input, 'nitro', { get: () => r.player.nitro >= 0.999, configurable: true });
  Object.defineProperty(r.input, 'throttle', { get: () => !!r.input.state().throttle, configurable: true });
  r.step(8, 60);
});
// 近景三视角：正后 / 侧后 / 侧前（用相机钩子，不受追尾逻辑干扰）
const views = [
  { name: 'rear', off: [-5.0, 2.0, 0.2] },
  { name: 'side', off: [-0.2, 1.5, 5.0] },
  { name: 'front', off: [4.6, 1.6, 3.0] },
];
for (const v of views) {
  await page.evaluate((off) => {
    window.__camHook = (cam) => {
      const r = window.__race, p = r.player.pos, th = r.player.th;
      const c = Math.cos(th), sn = Math.sin(th);
      cam.position.set(p.x + off[0] * c - off[2] * sn, p.y + off[1], p.z + off[0] * sn + off[2] * c);
      cam.lookAt(p.x, p.y + 0.75, p.z);
    };
  }, v.off);
  await page.waitForTimeout(450);
  await page.screenshot({ path: `/tmp/k-${v.name}.png` });
}
await page.evaluate(() => { window.__camHook = null; });

const box = await page.evaluate(() => {
  const r = window.__race, T = r.THREE;
  const v = new T.Vector3(r.player.pos.x, r.player.pos.y + 0.7, r.player.pos.z).project(r.camera);
  return { x: (v.x * 0.5 + 0.5), y: (-v.y * 0.5 + 0.5), z: v.z, kmh: r.player.speedKmh };
});
await page.waitForTimeout(400);
await page.screenshot({ path: '/tmp/k-full.png' });
const cx = Math.round(box.x * W), cy = Math.round(box.y * H);
const cw = 460, ch = 300;
const x0 = Math.max(0, Math.min(W - cw, cx - cw / 2)), y0 = Math.max(0, Math.min(H - ch, cy - ch / 2));
execSync(`ffmpeg -v error -y -i /tmp/k-full.png -vf "crop=${cw}:${ch}:${x0}:${y0},scale=${cw * 2}:${ch * 2}:flags=lanczos" /tmp/k-kart.png`);
console.log(JSON.stringify({ box, crop: [x0, y0, cw, ch] }));
await b.close(); server.close();