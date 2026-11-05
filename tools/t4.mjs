import { chromium } from 'playwright-core';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
const ROOT = '/Users/jinlong/dev/github/qq-speed-3d';
const MIME = { '.html':'text/html;charset=utf-8', '.js':'text/javascript;charset=utf-8', '.css':'text/css;charset=utf-8' };
const server = createServer(async (req,res)=>{ try{ let p=req.url.split('?')[0]; if(p==='/')p='/index.html';
 const f=join(ROOT, normalize(p)); const d=await readFile(f); res.writeHead(200,{'content-type':MIME[extname(f)]||'application/octet-stream'}); res.end(d);}catch(e){res.writeHead(404);res.end('x');}});
await new Promise(r=>server.listen(8141,r));
const b = await chromium.launch({ channel:'chrome', headless:true, args:['--use-angle=metal'] });
const page = await b.newPage();
page.on('pageerror',e=>console.log('ERR',e.message));
await page.goto('http://localhost:8141/index.html');
await page.waitForTimeout(1200);
const rows = await page.evaluate(()=>{
  const r = window.__race;
  r.startRace();
  // 固定油门直行
  r.input.state = () => ({ throttle:true, brake:false, steer:0, drift:false });
  Object.defineProperty(r.input,'throttle',{get:()=>true, configurable:true});
  Object.defineProperty(r.input,'nitro',{get:()=>false, configurable:true});
  const out = [];
  const snap = (i) => {
    const k = r.karts[0];
    const q = r.track.query(k.pos.x, k.pos.z, k.hint);
    const p = r.track.at(q.s);
    out.push([i, +k.pos.x.toFixed(1), +k.pos.z.toFixed(1), p.y.toFixed(1), +k.pos.y.toFixed(1), +k.th.toFixed(2), +k.speed.toFixed(1), +q.s.toFixed(1), +q.offset.toFixed(1), +k.progress.toFixed(1), r.game.phase][0]=='countdown'?0:[i, +k.pos.x.toFixed(1), +k.pos.z.toFixed(1), 'y', +k.pos.y.toFixed(1), +k.th.toFixed(2), +k.speed.toFixed(1), +q.s.toFixed(1), +q.offset.toFixed(1), +k.progress.toFixed(1), r.game.phase].join(' '));
  };
  for (let i=0;i<700;i++){ r.update(1/60); if (i%20===0) out.push(snap(i)); }
  return out;
});
console.log(rows.join('\n'));
await b.close(); server.close();
