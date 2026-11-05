import { chromium } from 'playwright-core';
const b = await chromium.launch({ channel: 'chrome', headless: false, args: ['--window-size=1440,860'] });
const page = await b.newPage({ viewport: { width: 1440, height: 810 } });
const m = async (label) => console.log(label, await page.evaluate(() => new Promise((res) => {
  let n = 0; const t0 = performance.now();
  const f = () => { n++; if (performance.now() - t0 < 2000) requestAnimationFrame(f); else res(+(n / ((performance.now() - t0) / 1000)).toFixed(1)); };
  requestAnimationFrame(f);
})));
await page.goto('about:blank'); await page.waitForTimeout(300); await m('blank');
await page.setContent('<body style="margin:0"><div style="width:100vw;height:100vh;background:linear-gradient(45deg,#123,#abc)"></div><script>let n=0;function f(){n++;requestAnimationFrame(f)}requestAnimationFrame(f)</script></body>');
await page.waitForTimeout(300); await m('css-anim');
await page.goto('https://hjkl01.github.io/qqspeed/', { waitUntil: 'load' });
await page.waitForTimeout(1500); await m('game-menu');
await page.keyboard.press('Enter'); await page.waitForTimeout(4200); await m('game-racing');
// 停掉游戏主循环再测：排除渲染
await page.evaluate(() => { window.__stop = true; const r = window.__race; r.renderer.setAnimationLoop && r.renderer.setAnimationLoop(null); });
await m('game-after-stop-frame');
console.log('screen:', await page.evaluate(() => ({ dpr: devicePixelRatio, w: innerWidth, h: innerHeight })));
await b.close();
