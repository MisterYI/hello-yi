// Render a scene page to an MP4, frame by frame.
//
//   node render.mjs agent-explainer.html                 -> out/agent-explainer.mp4 + contact sheet
//   node render.mjs cat-mv.html --audio out/cat-mv.wav   -> out/cat-mv.mp4 with a soundtrack
//   node render.mjs cat-mv.html --still 12.5             -> out/still-12.5.png (one frame, for quick checks)
//   node render.mjs sand-lookdev.html --jpeg             -> pass frames as high-quality JPEG instead of PNG;
//                                                            much faster for grainy, noise-heavy pictures
//   node render.mjs sand-lookdev.html --from 10 --to 20 --out part2
//                                                         -> render only that time range to out/part2.mp4,
//                                                            so long renders can run as parallel segments
//
// Pipeline: headless Chromium loads the page, we call window.renderFrame(t)
// for every frame, read the canvas back as PNG and pipe it into ffmpeg.

import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { basename, dirname, extname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const outDir = join(here, 'out');
mkdirSync(outDir, { recursive: true });

const args = process.argv.slice(2);
const flag = name => args.includes(name) ? args[args.indexOf(name) + 1] : null;
const page_ = args.find((a, i) => a.endsWith('.html') && !args[i - 1]?.startsWith('--')) || 'agent-explainer.html';
const stillAt = flag('--still') !== null ? Number(flag('--still')) : null;
const audio = flag('--audio') ? resolve(flag('--audio')) : null;
const name = flag('--out') || basename(page_, extname(page_));
const jpeg = args.includes('--jpeg') && stillAt === null;

// Use the system Chromium if PLAYWRIGHT_CHROMIUM is set or the cloud image path exists.
const executablePath = process.env.PLAYWRIGHT_CHROMIUM
  || (existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined);

const browser = await chromium.launch({ executablePath });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
await page.goto(pathToFileURL(resolve(here, page_)).href + '?render');
await page.evaluate(() => window.ready);
const { fps, duration } = await page.evaluate(() => ({ fps: window.FPS, duration: window.DURATION }));

const grab = async t => {
  const dataUrl = await page.evaluate(({ t, jpeg }) => {
    window.renderFrame(t);
    const c = document.getElementById('c');
    return jpeg ? c.toDataURL('image/jpeg', 0.95) : c.toDataURL('image/png');
  }, { t, jpeg });
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
  const mp4 = join(outDir, `${name}.mp4`);
  // Loudness-normalise the soundtrack to -14 LUFS (the usual streaming level) at 48 kHz.
  const audioArgs = audio ? ['-i', audio, '-af', 'loudnorm=I=-14:TP=-1.5:LRA=11', '-ar', '48000',
    '-c:a', 'aac', '-b:a', '192k', '-shortest'] : [];
  const encoding = run('ffmpeg', [
    '-y', '-loglevel', 'error',
    '-f', 'image2pipe', '-framerate', String(fps), '-i', '-',
    ...audioArgs,
    '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '18', '-preset', 'slow',
    '-movflags', '+faststart', mp4,
  ]);
  const ffmpeg = run.last;
  const first = Math.round(Number(flag('--from') ?? 0) * fps);
  const last = Math.round(Number(flag('--to') ?? duration) * fps);
  const frames = last - first;
  for (let i = 0; i < frames; i++) {
    const png = await grab((first + i) / fps);
    if (!ffmpeg.stdin.write(png)) await new Promise(r => ffmpeg.stdin.once('drain', r));
    if (i % fps === 0) process.stdout.write(`\rframe ${i}/${frames}`);
  }
  ffmpeg.stdin.end();
  await encoding;
  console.log(`\rwrote ${mp4} (${frames} frames)`);

  // Contact sheet: one still per second tiled into one image, for reviewing
  // the whole video at a glance.
  const cols = 8, rows = Math.ceil(frames / fps / cols);
  await run('ffmpeg', [
    '-y', '-loglevel', 'error', '-i', mp4,
    '-vf', `fps=1,scale=320:-1,tile=${cols}x${rows}:padding=4:color=white`,
    '-frames:v', '1', join(outDir, `${name}-contact-sheet.png`),
  ], { stdio: 'inherit' });
  console.log('wrote', join(outDir, `${name}-contact-sheet.png`));
}

await browser.close();
