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
await new Promise(r => server.listen(8188, r));
const b = await chromium.launch({ channel: 'chrome', headless: true });
const page = await b.newPage({ viewport: { width: 1440, height: 810 } });
await page.goto('http://localhost:8188/index.html');
await page.waitForTimeout(1200);
await page.keyboard.press('Enter');
await page.evaluate(() => window.__race.step(8, 60));
const list = await page.evaluate(() => {
  const out = [];
  document.querySelectorAll('*').forEach((e) => {
    const cs = getComputedStyle(e);
    if (cs.display === 'none' || cs.visibility === 'hidden' || +cs.opacity === 0) return;
    const r = e.getBoundingClientRect();
    if (r.width * r.height < 250000) return;          // 只看大块
    const bg = cs.backgroundColor, bi = cs.backgroundImage.slice(0, 60);
    if (bg === 'rgba(0, 0, 0, 0)' && (!bi || bi === 'none') && cs.backdropFilter === 'none' && cs.mixBlendMode === 'normal') return;
    out.push({ tag: e.tagName + (e.id ? '#' + e.id : '') + (e.className && typeof e.className === 'string' ? '.' + e.className.split(' ').join('.') : ''),
      rect: [Math.round(r.x), Math.round(r.y), Math.round(r.width), Math.round(r.height)],
      bg, bgImg: bi, opacity: cs.opacity, bf: cs.backdropFilter, blend: cs.mixBlendMode, filter: cs.filter.slice(0, 30), z: cs.zIndex });
  });
  return out;
});
console.log(JSON.stringify(list, null, 1));
await b.close(); server.close();
