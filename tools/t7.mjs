import { chromium } from 'playwright-core';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
const ROOT = '/Users/jinlong/dev/github/qq-speed-3d';
const MIME = { '.html':'text/html;charset=utf-8', '.js':'text/javascript;charset=utf-8', '.css':'text/css;charset=utf-8' };
const server = createServer(async (req,res)=>{ try{ let p=req.url.split('?')[0]; if(p==='/')p='/index.html';
 const f=join(ROOT, normalize(p)); const d=await readFile(f); res.writeHead(200,{'content-type':MIME[extname(f)]||'application/octet-stream'}); res.end(d);}catch(e){res.writeHead(404);res.end('x');}});
await new Promise(r=>server.listen(8161,r));
const b = await chromium.launch({ channel:'chrome', headless:true, args:['--use-angle=metal'] });
const page = await b.newPage();
page.on('pageerror',e=>console.log('ERR',e.message));
await page.goto('http://localhost:8161/index.html');
await page.waitForTimeout(1200);
await page.evaluate(()=>window.__race.startRace());
await page.evaluate(()=>window.__race.step(3.4,60));
await page.keyboard.down('ArrowUp');
await page.evaluate(()=>window.__race.step(3,60));
await page.keyboard.down('ShiftLeft');
await page.keyboard.down('ArrowLeft');
const rows = await page.evaluate(()=>{
  const r = window.__race, out = [];
  for (let i=0;i<180;i++){
    r.update(1/60); r.input.endFrame();
    if (i%10===0) {
      const p = r.player;
      out.push([i, 'in.drift='+r.input.drift, 'down='+[...r.input.down].join('+'), 'drift='+p.drifting, 'e='+p.driftEnergy.toFixed(2), 'slip='+p.slip.toFixed(2), 'kmh='+p.speedKmh.toFixed(0), 'boost='+p.boostTime.toFixed(2), p.boostKind].join(' '));
    }
  }
  return out;
});
console.log(rows.join('\n'));
await b.close(); server.close();
