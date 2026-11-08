// Renderiza scene.html cuadro por cuadro y lo codifica con ffmpeg.
// Uso: node render.mjs <build_dir> [--preview t1,t2,...] [--fps 30]
import { createRequire } from 'module';
import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');

const here = path.dirname(fileURLToPath(import.meta.url));
const build = process.argv[2];
const args = process.argv.slice(3);
const opt = k => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : null; };
const fps = Number(opt('--fps') || 30);
const scenes = JSON.parse(fs.readFileSync(path.join(here, 'scenes.json'), 'utf8'));
const tl = JSON.parse(fs.readFileSync(path.join(build, 'timeline.json'), 'utf8'));

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
await page.goto('file://' + path.join(here, 'scene.html'));
await page.evaluate(([s, t]) => window.init(s, t), [scenes, tl]);

if (opt('--preview')) {
  for (const t of opt('--preview').split(',').map(Number)) {
    await page.evaluate(T => window.renderAt(T), t);
    await page.screenshot({ path: path.join(build, `preview_${String(t).padStart(6, '0')}.png`) });
  }
  await browser.close();
  process.exit(0);
}

const out = path.join(build, 'video_sin_audio.mp4');
const ff = spawn('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'image2pipe', '-framerate', String(fps), '-c:v', 'mjpeg', '-i', '-',
  '-c:v', 'libx264', '-preset', 'medium', '-crf', '22', '-pix_fmt', 'yuv420p', out], { stdio: ['pipe', 'inherit', 'inherit'] });
const N = Math.ceil(tl.total * fps);
const t0 = Date.now();
for (let f = 0; f < N; f++) {
  await page.evaluate(T => window.renderAt(T), f / fps);
  const buf = await page.screenshot({ type: 'jpeg', quality: 92 });
  if (!ff.stdin.write(buf)) await new Promise(r => ff.stdin.once('drain', r));
  if (f % 300 === 0) console.log(`frame ${f}/${N}  ${((Date.now() - t0) / 1000).toFixed(0)}s`);
}
ff.stdin.end();
await new Promise(r => ff.on('close', r));
await browser.close();
console.log('listo:', out);
