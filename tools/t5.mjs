import { chromium } from 'playwright-core';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
const ROOT = '/Users/jinlong/dev/github/qq-speed-3d';
const MIME = { '.html':'text/html;charset=utf-8', '.js':'text/javascript;charset=utf-8', '.css':'text/css;charset=utf-8' };
const server = createServer(async (req,res)=>{ try{ let p=req.url.split('?')[0]; if(p==='/')p='/index.html';
 const f=join(ROOT, normalize(p)); const d=await readFile(f); res.writeHead(200,{'content-type':MIME[extname(f)]||'application/octet-stream'}); res.end(d);}catch(e){res.writeHead(404);res.end('x');}});
await new Promise(r=>server.listen(8143,r));
const b = await chromium.launch({ channel:'chrome', headless:true, args:['--use-angle=metal'] });
const page = await b.newPage();
page.on('pageerror',e=>console.log('ERR',e.message));
await page.goto('http://localhost:8143/index.html');
await page.waitForTimeout(1200);
const rows = await page.evaluate(()=>{
  const r = window.__race;
  r.startRace();
  const out = [];
  for (let i=0;i<400;i++){
    r.update(1/60);
    const k = r.karts[1], d = r.drivers[1].dbg || {};
    if (i%10===0 && r.game.phase==='racing') {
      const q = r.track.query(k.pos.x, k.pos.z, -1);
      out.push([i, 'x'+k.pos.x.toFixed(1), 'z'+k.pos.z.toFixed(1), 'th'+k.th.toFixed(2), 'crs'+k.course.toFixed(2), 'sp'+k.speed.toFixed(1), 'q.s'+q.s.toFixed(0), 'off'+q.offset.toFixed(1), 'p'+k.progress.toFixed(0),
        d.err!==undefined?('e'+d.err.toFixed(2)+' st'+d.steer.toFixed(2)+' '+(d.throttle?'T':'-')+(d.brake?'B':'-')+' vT'+d.vTarget.toFixed(0)) : ''].join(' '));
    }
  }
  return out;
});
console.log(rows.slice(0,34).join('\n'));
await b.close(); server.close();
