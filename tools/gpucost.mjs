// 真实 GPU 每帧成本：绕开 rAF 节流，直接连续 render + gl.finish() 计时
import { chromium } from 'playwright-core';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
const ROOT = new URL('..', import.meta.url).pathname;
const MIME = { '.html':'text/html;charset=utf-8', '.js':'text/javascript;charset=utf-8', '.css':'text/css;charset=utf-8' };
const server = createServer(async (req,res)=>{ try{ let p=req.url.split('?')[0]; if(p==='/')p='/index.html';
 const f=join(ROOT, normalize(p)); const d=await readFile(f); res.writeHead(200,{'content-type':MIME[extname(f)]||'application/octet-stream'}); res.end(d);}catch(e){res.writeHead(404);res.end('x');}});
await new Promise(r=>server.listen(8202,r));
const b = await chromium.launch({ channel:'chrome', headless:true, args:['--use-angle=metal','--enable-gpu'] });
const page = await b.newPage({ viewport:{width:1920,height:1080} });
await page.goto('http://localhost:8202/index.html');
await page.waitForTimeout(1200);
await page.evaluate(()=>window.__race.startRace());
await page.waitForTimeout(1500);
const r = await page.evaluate(()=>{
  const R = window.__race, gl = R.renderer.getContext();
  const size = () => { R.renderer.setSize(window.innerWidth, window.innerHeight); };
  size();
  for (let i=0;i<30;i++) { R.renderer.render(R.scene, R.camera); gl.finish(); }   // 预热（着色器/上传）
  const t0 = performance.now();
  for (let i=0;i<120;i++) { R.renderer.render(R.scene, R.camera); gl.finish(); }
  const ms = (performance.now()-t0)/120;
  return { gpuMsPerFrame:+ms.toFixed(2), impliedFps:Math.round(1000/ms),
    size:[R.renderer.domElement.width,R.renderer.domElement.height],
    calls:R.renderer.info.render.calls, tris:R.renderer.info.render.triangles };
});
console.log(JSON.stringify(r));
await b.close(); server.close();
