import { chromium } from 'playwright-core';
const b = await chromium.launch({ channel: 'chrome', headless: false, args: ['--window-size=1440,860'] });
const page = await b.newPage({ viewport: { width: 1440, height: 810 } });
await page.goto('https://hjkl01.github.io/qqspeed/', { waitUntil: 'load' });
await page.waitForTimeout(1200);
await page.keyboard.press('Enter');
await page.waitForTimeout(4200);
const measure = async (label) => {
  const r = await page.evaluate(() => new Promise((res) => {
    let n = 0; const t0 = performance.now(); let gapMax = 0, last = t0;
    const f = () => { const now = performance.now(); gapMax = Math.max(gapMax, now - last); last = now; n++;
      if (now - t0 < 2500) requestAnimationFrame(f);
      else res({ fps: +(n / ((now - t0) / 1000)).toFixed(1), gapMax: +gapMax.toFixed(0), perf: window.__perf }); };
    requestAnimationFrame(f);
  }));
  console.log(label, JSON.stringify(r)); return r;
};
await measure('a-1440x810@1.7');
await page.evaluate(() => { window.__race.renderer.setSize(720, 405); });
await page.waitForTimeout(500); await measure('b-720x405');
await page.evaluate(() => { window.__race.renderer.setSize(1440, 810); window.__race.renderer.setPixelRatio(1); });
await page.waitForTimeout(500); await measure('c-1440@1.0');
await page.evaluate(() => { window.__race.camera.far = 800; window.__race.camera.updateProjectionMatrix(); window.__race.scene.fog.far = 700; });
await page.waitForTimeout(500); await measure('d-far800');
await page.evaluate(() => { const r = window.__race; r.effects && r.effects.group && (r.effects.group.visible = false); });
await page.waitForTimeout(500); await measure('e-noeffects');
await b.close();
