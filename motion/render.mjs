// Render scene.html to an MP4, frame by frame.
//
//   node render.mjs                 -> out/hello-yi.mp4 + out/contact-sheet.png
//   node render.mjs --still 4.2     -> out/still-4.2.png (one frame, for quick checks)
//
// Pipeline: headless Chromium loads the page, we call window.renderFrame(t)
// for every frame, read the canvas back as PNG and pipe it into ffmpeg.

import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const outDir = join(here, 'out');
mkdirSync(outDir, { recursive: true });

const args = process.argv.slice(2);
const stillAt = args.includes('--still') ? Number(args[args.indexOf('--still') + 1]) : null;

// Use the system Chromium if PLAYWRIGHT_CHROMIUM is set or the cloud image path exists.
const executablePath = process.env.PLAYWRIGHT_CHROMIUM
  || (existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined);

const browser = await chromium.launch({ executablePath });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
await page.goto(pathToFileURL(join(here, 'scene.html')).href + '?render');
await page.evaluate(() => window.ready);
const { fps, duration } = await page.evaluate(() => ({ fps: window.FPS, duration: window.DURATION }));

const grab = async t => {
  const dataUrl = await page.evaluate(t => {
    window.renderFrame(t);
    return document.getElementById('c').toDataURL('image/png');
  }, t);
  return Buffer.from(dataUrl.split(',')[1], 'base64');
};

const run = (cmd, argv, opts = {}) => new Promise((resolve, reject) => {
  const p = spawn(cmd, argv, { stdio: ['pipe', 'inherit', 'inherit'], ...opts });
  p.on('error', reject);
  p.on('close', code => code === 0 ? resolve() : reject(new Error(`${cmd} exited ${code}`)));
  run.last = p;
});

if (stillAt !== null) {
  const file = join(outDir, `still-${stillAt}.png`);
  writeFileSync(file, await grab(stillAt));
  console.log('wrote', file);
} else {
  const mp4 = join(outDir, 'hello-yi.mp4');
  const encoding = run('ffmpeg', [
    '-y', '-loglevel', 'error',
    '-f', 'image2pipe', '-framerate', String(fps), '-i', '-',
    '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '18', '-preset', 'slow',
    '-movflags', '+faststart', mp4,
  ]);
  const ffmpeg = run.last;
  const frames = Math.round(duration * fps);
  for (let i = 0; i < frames; i++) {
    const png = await grab(i / fps);
    if (!ffmpeg.stdin.write(png)) await new Promise(r => ffmpeg.stdin.once('drain', r));
    if (i % fps === 0) process.stdout.write(`\rframe ${i}/${frames}`);
  }
  ffmpeg.stdin.end();
  await encoding;
  console.log(`\rwrote ${mp4} (${frames} frames)`);

  // Contact sheet: 2 stills per second tiled into one image, for reviewing
  // the whole video at a glance.
  const cols = 6, rows = Math.ceil(duration * 2 / cols);
  await run('ffmpeg', [
    '-y', '-loglevel', 'error', '-i', mp4,
    '-vf', `fps=2,scale=320:-1,tile=${cols}x${rows}:padding=4:color=white`,
    '-frames:v', '1', join(outDir, 'contact-sheet.png'),
  ], { stdio: 'inherit' });
  console.log('wrote', join(outDir, 'contact-sheet.png'));
}

await browser.close();
