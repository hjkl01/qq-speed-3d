import { chromium } from 'playwright-core';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
const ROOT = '/Users/jinlong/dev/github/qq-speed-3d';
const MIME = { '.html':'text/html;charset=utf-8', '.js':'text/javascript;charset=utf-8', '.css':'text/css;charset=utf-8' };
const server = createServer(async (req,res)=>{ try{ let p=req.url.split('?')[0]; if(p==='/')p='/index.html';
 const f=join(ROOT, normalize(p)); const d=await readFile(f); res.writeHead(200,{'content-type':MIME[extname(f)]||'application/octet-stream'}); res.end(d);}catch(e){res.writeHead(404);res.end('x');}});
await new Promise(r=>server.listen(8126,r));
const b = await chromium.launch({ channel:'chrome', headless:false, args:['--use-angle=metal'] });
const page = await b.newPage({ viewport:{width:1440,height:860} });
await page.goto('http://localhost:8126/index.html');
await page.waitForTimeout(2500);
const fps = () => page.evaluate(()=>new Promise(res=>{let n=0;const t0=performance.now();const f=()=>{n++;if(performance.now()-t0<2000)requestAnimationFrame(f);else res(+(n/((performance.now()-t0)/1000)).toFixed(1));};requestAnimationFrame(f);}));
const base = await fps();
const info = await page.evaluate(()=>{
  const r = window.__race;
  // 找到 renderer
  return { children: r.scene.children.map(c=>c.type+':'+(c.name||'')), };
});
// 统计 mesh / 绘制调用
const stat = await page.evaluate(()=>{
  let meshes=0, inst=0, tris=0, shadow=0;
  window.__race.scene.traverse(o=>{ if(o.isMesh||o.isPoints){meshes++; if(o.isInstancedMesh)inst++; if(o.castShadow)shadow++;} });
  return {meshes, inst, shadow};
});
const noShadow = await page.evaluate(async ()=>{ // toggle shadows
  const r=window.__race; const rend = r.renderer;
  return 'n/a';
});
console.log(JSON.stringify({base, stat, info}, null, 1));
await page.screenshot({path:'/tmp/shot-gpu.png'});
await b.close(); server.close();
