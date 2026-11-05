import { chromium } from 'playwright-core';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
const ROOT = '/Users/jinlong/dev/github/qq-speed-3d';
const MIME = { '.html':'text/html;charset=utf-8', '.js':'text/javascript;charset=utf-8', '.css':'text/css;charset=utf-8' };
const server = createServer(async (req,res)=>{ try{ let p=req.url.split('?')[0]; if(p==='/')p='/index.html';
 const f=join(ROOT, normalize(p)); const d=await readFile(f); res.writeHead(200,{'content-type':MIME[extname(f)]||'application/octet-stream'}); res.end(d);}catch(e){res.writeHead(404);res.end('x');}});
await new Promise(r=>server.listen(8140,r));
const b = await chromium.launch({ channel:'chrome', headless:true, args:['--use-angle=metal'] });
const page = await b.newPage();
page.on('pageerror',e=>console.log('ERR',e.message));
await page.goto('http://localhost:8140/index.html');
await page.waitForTimeout(1200);
const rows = await page.evaluate(()=>{
  const r = window.__race;
  r.startRace();
  const out = [];
  for (let i=0;i<600;i++){
    r.update(1/60);
    if (i%30===0) {
      const k = r.karts[0];
      const q = r.track.query(k.pos.x, k.pos.z, k.hint);
      out.push([i, +k.pos.x.toFixed(1), +k.pos.z.toFixed(1), +k.th.toFixed(2), +k.speed.toFixed(1), +q.s.toFixed(1), +q.offset.toFixed(1), +k.progress.toFixed(1), +k.lapDist.toFixed(1), r.game.phase]);
    }
  }
  return out;
});
console.log(rows.map(r=>r.join(' ')).join('\n'));
await b.close(); server.close();
