import { chromium } from 'playwright-core';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
const ROOT = '/Users/jinlong/dev/github/qq-speed-3d';
const MIME = { '.html':'text/html;charset=utf-8', '.js':'text/javascript;charset=utf-8', '.css':'text/css;charset=utf-8' };
const server = createServer(async (req,res)=>{ try{ let p=req.url.split('?')[0]; if(p==='/')p='/index.html';
 const f=join(ROOT, normalize(p)); const d=await readFile(f); res.writeHead(200,{'content-type':MIME[extname(f)]||'application/octet-stream'}); res.end(d);}catch(e){res.writeHead(404);res.end('x');}});
await new Promise(r=>server.listen(8129,r));
const args = process.argv.slice(2);
const b = await chromium.launch({ channel:'chrome', headless:true, args });
const page = await b.newPage({ viewport:{width:1280,height:720} });
await page.goto('http://localhost:8129/index.html');
await page.waitForTimeout(2000);
const bench = async (label, fn) => {
  const ms = await page.evaluate(async (src)=>{
    const f = new Function('return ' + src)();
    const r = window.__race;
    for (let i=0;i<3;i++) f(r);
    const gl = r.renderer.getContext();
    const t0 = performance.now();
    for (let i=0;i<30;i++) { f(r); }
    gl.finish();
    return (performance.now()-t0)/30;
  }, fn);
  return [label, +ms.toFixed(2)];
};
const rows = [];
rows.push(await bench('full', 'r => r.renderer.render(r.scene, r.camera)'));
rows.push(await bench('noShadowPass', 'r => { r.renderer.shadowMap.enabled=false; r.renderer.render(r.scene,r.camera); r.renderer.shadowMap.enabled=true; }'));
rows.push(await bench('empty', 'r => { const s=new r.THREE.Scene(); r.renderer.render(s, r.camera); }'));
rows.push(await bench('dpr05', 'r => { r.renderer.setPixelRatio(0.5); r.renderer.render(r.scene,r.camera); }'));
rows.push(await bench('dpr1', 'r => { r.renderer.setPixelRatio(1); r.renderer.render(r.scene,r.camera); }'));
const ri = await page.evaluate(()=>{const r=window.__race.renderer; return {calls:r.info.render.calls, tris:r.info.render.triangles};});
console.log(JSON.stringify({args, rows, ri}));
await b.close(); server.close();
