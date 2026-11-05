// 用多模态模型批量看截图（本地开发用，不自带密钥；从 ~/.pi/agent/models.json 读取）
import { execSync } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const cfg = JSON.parse(readFileSync(join(homedir(), '.pi/agent/models.json'), 'utf8'));
const prov = cfg.providers['qwen'] || cfg.providers['qwen-suanfa'];
const KEY = prov.apiKey, BASE = prov.baseUrl;
const MODEL = process.env.VMODEL || 'qwen3.8-max';
const prompt = process.argv[2];
const files = process.argv.slice(3);

const out = [];
for (const f of files) {
  const small = `/tmp/vs-${f.split('/').pop().replace(/\.[^.]+$/, '')}.jpg`;
  if (!existsSync(small) || process.env.VRESIZE) {
    execSync(`ffmpeg -v error -y -i ${f} -vf scale=1100:-1 -q:v 5 ${small}`);
  }
  const img = readFileSync(small).toString('base64');
  const body = {
    model: MODEL,
    messages: [{
      role: 'user',
      content: [{ type: 'text', text: prompt }, { type: 'image_url', image_url: { url: `data:image/jpeg;base64,${img}` } }],
    }],
    max_tokens: 900,
  };
  const res = await fetch(BASE + '/chat/completions', {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const j = await res.json();
  const txt = j.choices?.[0]?.message?.content || JSON.stringify(j).slice(0, 300);
  out.push(`===== ${f.split('/').pop()} =====\n${txt}`);
  console.log(`===== ${f.split('/').pop()} =====\n${txt}\n`);
}
writeFileSync('/tmp/vision-report.txt', out.join('\n\n'));