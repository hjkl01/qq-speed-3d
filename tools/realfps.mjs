// 真实（有头）Chrome 测帧率：区分 headless 软渲染与真机性能
import { chromium } from 'playwright-core';
const b = await chromium.launch({ channel: 'chrome', headless: false, args: ['--window-size=1440,860'] });
const page = await b.newPage({ viewport: { width: 1440, height: 810 } });
await page.goto('https://hjkl01.github.io/qqspeed/', { waitUntil: 'load' });
await page.waitForTimeout(1500);
await page.keyboard.press('Enter');
await page.waitForTimeout(4500);
await page.keyboard.down('ArrowUp');
const r = await page.evaluate(() => new Promise((res) => {
  let n = 0; const t0 = performance.now();
  const f = () => { n++; if (performance.now() - t0 < 3000) requestAnimationFrame(f);
    else res({ fps: +(n / ((performance.now() - t0) / 1000)).toFixed(1), perf: window.__race && window.__perf }); };
  requestAnimationFrame(f);
}));
const st = await page.evaluate(() => ({ kmh: Math.round(window.__race.player.speedKmh), dr: window.__race.renderer.info.render }));
await page.waitForTimeout(1200);
const st2 = await page.evaluate(() => ({ kmh: Math.round(window.__race.player.speedKmh) }));
await page.keyboard.up('ArrowUp');
console.log(JSON.stringify({ ...r, st, st2 }));
await b.close();
