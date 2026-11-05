// 定位帧率杀手：逐个关掉可疑的 CSS/渲染特性，测 rAF 帧率
import { chromium } from 'playwright-core';
const b = await chromium.launch({ channel: 'chrome', headless: false, args: ['--window-size=1440,860'] });
const page = await b.newPage({ viewport: { width: 1440, height: 810 } });
await page.goto('https://hjkl01.github.io/qqspeed/', { waitUntil: 'load' });
await page.waitForTimeout(1200);
await page.keyboard.press('Enter');
await page.waitForTimeout(4200);
const measure = async (label) => {
  const r = await page.evaluate(() => new Promise((res) => {
    let n = 0; const t0 = performance.now();
    const f = () => { n++; if (performance.now() - t0 < 2500) requestAnimationFrame(f);
      else res(+(n / ((performance.now() - t0) / 1000)).toFixed(1)); };
    requestAnimationFrame(f);
  }));
  console.log(label, r);
  return r;
};
await measure('baseline-visible');
await page.addStyleTag({ content: '*{backdrop-filter:none!important;-webkit-backdrop-filter:none!important}' });
await page.waitForTimeout(400);
await measure('no-backdrop');
await page.evaluate(() => { window.__race.hud.hide(); });
await page.waitForTimeout(400);
await measure('no-hud');
await page.evaluate(() => { document.querySelectorAll('.hud').forEach(e => e.style.display = 'none'); window.__race.hud.show(); });
await page.waitForTimeout(400);
await measure('no-hud-dom');
await page.evaluate(() => { window.__race.renderer.shadowMap.enabled = false; window.__race.scene.traverse(o => { if (o.isMesh) o.castShadow = false; }); });
await page.waitForTimeout(600);
await measure('no-shadow');
await page.evaluate(() => { window.__race.renderer.setPixelRatio(1); });
await page.waitForTimeout(500);
await measure('dpr1');
await b.close();
