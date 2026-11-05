// 线上页面实跑：确认无 404、能开局、能跑动
import { chromium } from 'playwright-core';
const b = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=metal'] });
const page = await b.newPage({ viewport: { width: 1280, height: 720 } });
const bad = [];
page.on('pageerror', e => bad.push('ERR ' + e.message));
page.on('response', r => { if (r.status() >= 400) bad.push(r.status() + ' ' + r.url()); });
const t0 = Date.now();
await page.goto('https://qq-speed-3d.pages.dev/', { waitUntil: 'load' });
await page.waitForTimeout(2500);
const boot = Date.now() - t0;
const phase0 = await page.evaluate(() => window.__race?.game?.phase);
await page.keyboard.press('Enter');
await page.waitForTimeout(3600);            // 让倒计时真的走完（真实 rAF）
await page.keyboard.down('ArrowUp');
await page.waitForTimeout(2600);
const st = await page.evaluate(() => ({
  phase: window.__race.game.phase,
  kmh: Math.round(window.__race.player.speedKmh),
  lap: window.__race.player.lap,
  nos: +window.__race.player.nitro.toFixed(2),
}));
await page.screenshot({ path: '/tmp/live.png' });
await page.keyboard.up('ArrowUp');
console.log(JSON.stringify({ bootMs: boot, phase0, st, bad }));
await b.close();
