// 图片网格统计：找出黑块/纯色块/过曝区域（粗粒度视觉体检）
import { execSync } from 'node:child_process';

const GW = 8, GH = 6;
for (const f of process.argv.slice(2)) {
  const W = 320, H = 180;
  const raw = execSync(`ffmpeg -v error -i ${f} -vf "scale=${W}:${H},format=rgb24" -f rawvideo -`, { maxBuffer: 1e8 });
  const cw = W / GW, ch = H / GH;
  const rows = [];
  let worst = null;
  for (let gy = 0; gy < GH; gy++) {
    let line = '';
    for (let gx = 0; gx < GW; gx++) {
      let sum = 0, n = 0, blacks = 0;
      const colors = new Set();
      for (let y = gy * ch; y < (gy + 1) * ch; y++) {
        for (let x = gx * cw; x < (gx + 1) * cw; x++) {
          const i = (y * W + x) * 3;
          const r = raw[i], g = raw[i + 1], b = raw[i + 2];
          const l = 0.299 * r + 0.587 * g + 0.114 * b;
          sum += l; n++;
          if (l < 8) blacks++;
          colors.add(((r >> 4) << 8) | ((g >> 4) << 4) | (b >> 4));
        }
      }
      const mean = sum / n;
      const bf = blacks / n;
      line += `${String(Math.round(mean)).padStart(3)}${bf > 0.95 ? '#' : colors.size < 4 ? '!' : ' '}`;
      if (bf > 0.95 && (!worst || bf > worst.bf)) worst = { gx, gy, bf, mean };
    }
    rows.push(line);
  }
  console.log(f.split('/').pop(), `(# 全黑 ! 纯色)`);
  console.log(rows.map((r, i) => `  y${i} ${r}`).join('\n'));
  if (worst) console.log(`  ⚠ 全黑块 cell(${worst.gx},${worst.gy})`);
}