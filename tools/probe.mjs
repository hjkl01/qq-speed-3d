import { chromium } from 'playwright-core';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
const ROOT = '/Users/jinlong/dev/github/qq-speed-3d';
const MIME = { '.html':'text/html;charset=utf-8', '.js':'text/javascript;charset=utf-8', '.css':'text/css;charset=utf-8' };
const server = createServer(async (req,res)=>{ try{ let p=req.url.split('?')[0]; if(p==='/')p='/index.html';
 const f=join(ROOT, normalize(p)); const d=await readFile(f); res.writeHead(200,{'content-type':MIME[extname(f)]||'application/octet-stream'}); res.end(d);}catch(e){res.writeHead(404);res.end('x');}});
await new Promise(r=>server.listen(8124,r));
const b = await chromium.launch({channel:'chrome',headless:true,args:['--use-gl=angle','--enable-unsafe-swiftshader']});
const page = await b.newPage({viewport:{width:1280,height:720}});
page.on('pageerror', e=>console.log('ERR', e.message));
await page.goto('http://localhost:8124/index.html');
await page.waitForTimeout(1500);
await page.click('#btnStart');
for (let i=0;i<10;i++){
  await page.waitForTimeout(1000);
  const s = await page.evaluate(()=>{
    const r=window.__race;
    const d = r.drivers?.[1]?.dbg || {};
    return { t:+r.game.raceTime.toFixed(1), ph:r.game.phase, k:r.karts.map(k=>({n:k.name, s:+k.trackQ?.s.toFixed(0), prog:+k.progress.toFixed(0), lap:k.lap, sp:+k.speed.toFixed(1), off:+(k.offset??0).toFixed(1), th:+k.th.toFixed(2), crs:+k.course.toFixed(2) })),
      dbg: r.drivers?.[1]?.dbg ? { err:+d.err.toFixed(3), steer:+d.steer.toFixed(2), thr:d.throttle, brk:d.brake, curv:+d.maxCurv.toFixed(4), vT:+d.vTarget.toFixed(1), lat:+d.lat.toFixed(1), off:+d.off.toFixed(1) } : null };
  });
  console.log(JSON.stringify(s));
}
await b.close(); server.close();
