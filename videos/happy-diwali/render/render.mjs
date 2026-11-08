// Frame-exact MP4 export.
//
// Headless Chromium runs the very same HTML/CSS/JS as index.html, draws every
// frame at an exact timestamp, synthesises the soundtrack with the Web Audio
// API, and ffmpeg encodes the result.
//
//   node render/render.mjs                     # -> output/the-dev-loop-happy-diwali.mp4
//   node render/render.mjs --crf 16 --out my.mp4
//   node render/render.mjs --music track.mp3   # use your own licensed music instead
//   node render/render.mjs --from 14 --to 16   # render a slice (handy while editing)
//
// Requires: Node 18+, ffmpeg on PATH, and Playwright with Chromium
// (npm i -D playwright && npx playwright install chromium).
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const args = Object.fromEntries(
  process.argv.slice(2).reduce((acc, a, i, arr) => {
    if (a.startsWith('--')) acc.push([a.slice(2), arr[i + 1] && !arr[i + 1].startsWith('--') ? arr[i + 1] : true]);
    return acc;
  }, [])
);
const out = resolve(args.out || join(root, 'output/the-dev-loop-happy-diwali.mp4'));
const crf = String(args.crf || 18);
const music = args.music ? resolve(args.music) : null;

const browser = await chromium.launch(
  process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}
);
const page = await browser.newPage({ viewport: { width: 1200, height: 2100 } });
page.on('pageerror', (e) => console.error('page error:', e.message));
await page.goto(pathToFileURL(join(root, 'index.html')).href + '?render');
await page.evaluate(() => window.DL.ready);

const { fps, duration, width, height } = await page.evaluate(() => ({
  fps: DL.FPS,
  duration: DL.DURATION,
  width: document.getElementById('screen').width,
  height: document.getElementById('screen').height,
}));
const from = Number(args.from || 0);
const to = Math.min(duration, Number(args.to || duration));
const first = Math.round(from * fps);
const last = Math.round(to * fps); // exclusive
mkdirSync(dirname(out), { recursive: true });

// ---- soundtrack (rendered offline in the page)
let audioIn = music;
if (!music) {
  process.stdout.write('Synthesising soundtrack… ');
  const b64 = await page.evaluate(async () => {
    const buf = await DL.renderSoundtrack();
    const bytes = new Uint8Array(DL.encodeWav(buf));
    let s = '';
    for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    return btoa(s);
  });
  audioIn = out.replace(/\.mp4$/i, '') + '.wav';
  writeFileSync(audioIn, Buffer.from(b64, 'base64'));
  console.log('done →', audioIn);
} else if (!existsSync(music)) {
  throw new Error(`music file not found: ${music}`);
}

// ---- encoder
const ff = spawn(
  'ffmpeg',
  [
    '-y', '-loglevel', 'error',
    '-f', 'image2pipe', '-framerate', String(fps), '-c:v', 'png', '-i', '-',
    '-ss', String(from), '-t', String(to - from), '-i', audioIn,
    '-vf', 'scale=out_color_matrix=bt709:out_range=tv,format=yuv420p',
    '-c:v', 'libx264', '-preset', 'slow', '-crf', crf, '-profile:v', 'high', '-level:v', '4.2',
    '-colorspace', 'bt709', '-color_primaries', 'bt709', '-color_trc', 'bt709', '-color_range', 'tv',
    ...(music ? ['-af', `afade=t=out:st=${Math.max(0, to - from - 1)}:d=1`] : []),
    '-c:a', 'aac', '-b:a', '192k', '-ar', '48000',
    '-movflags', '+faststart', '-shortest', out,
  ],
  { stdio: ['pipe', 'inherit', 'inherit'] }
);
const ffDone = once(ff, 'close');

const t0 = Date.now();
for (let i = first; i < last; i++) {
  const url = await page.evaluate((t) => DL.renderToDataURL(t), i / fps);
  const png = Buffer.from(url.slice(url.indexOf(',') + 1), 'base64');
  if (!ff.stdin.write(png)) await once(ff.stdin, 'drain');
  if ((i - first) % fps === 0) {
    const pct = (((i - first) / (last - first)) * 100).toFixed(0);
    process.stdout.write(`\rFrames ${i - first}/${last - first} (${pct}%)`);
  }
}
ff.stdin.end();
const [code] = await ffDone;
await browser.close();
if (code !== 0) throw new Error(`ffmpeg exited with ${code}`);
console.log(`\rRendered ${last - first} frames (${width}×${height}) in ${((Date.now() - t0) / 1000).toFixed(1)} s → ${out}`);
