import { chromium } from 'playwright-core';
for (const args of [[], ['--use-angle=metal'], ['--ignore-gpu-blocklist', '--enable-gpu-rasterization']]) {
  const b = await chromium.launch({ channel: 'chrome', headless: false, args: [...args, '--window-size=1200,700'] });
  const page = await b.newPage({ viewport: { width: 1200, height: 700 } });
  await page.goto('about:blank');
  const info = await page.evaluate(() => {
    const c = document.createElement('canvas');
    const gl = c.getContext('webgl2') || c.getContext('webgl');
    if (!gl) return { gl: null };
    const e = gl.getExtension('WEBGL_debug_renderer_info');
    return { renderer: e ? gl.getParameter(e.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER),
             vendor: e ? gl.getParameter(e.UNMASKED_VENDOR_WEBGL) : '', maxTex: gl.getParameter(gl.MAX_TEXTURE_SIZE) };
  });
  console.log(JSON.stringify(args), JSON.stringify(info));
  await b.close();
}
