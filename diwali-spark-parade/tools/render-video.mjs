#!/usr/bin/env node
// Deterministic offline renderer for Diwali Spark Parade.
// Renders every frame from the timeline (not in real time), renders the original soundtrack
// offline, and muxes both with FFmpeg — so the result is frame-exact on any machine.
//
// Needs Node 18+, Playwright with Chromium, and FFmpeg on PATH:
//   npm i -D playwright && npx playwright install chromium
//
//   node tools/render-video.mjs                         → diwali-spark-parade.mp4 (H.264 + AAC)
//   node tools/render-video.mjs --out loop.webm         → VP9 + Opus
//   node tools/render-video.mjs --scale 1.5             → 1080×1920
//   node tools/render-video.mjs --from 4.3 --to 9.7     → partial render (seconds)
//   node tools/render-video.mjs --reduced-motion --no-audio
//   node tools/render-video.mjs --frames out/frames     → PNG sequence instead of a video
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SPEC = 21.92, FPS = 30;

const argv = process.argv.slice(2);
const flag = (name) => argv.includes('--' + name);
const opt = (name, def) => { const i = argv.indexOf('--' + name); return i >= 0 && argv[i + 1] ? argv[i + 1] : def; };
const out = path.resolve(opt('out', 'diwali-spark-parade.mp4'));
const scale = Number(opt('scale', '1'));
const duration = SPEC;                                   // the loop is authored for 21.92 s
const from = Math.max(0, Number(opt('from', '0')));
const to = Math.min(duration, Number(opt('to', String(duration))));
const framesDir = opt('frames', null);
const withAudio = !flag('no-audio') && !framesDir;
if (flag('help')) { console.log(fs.readFileSync(fileURLToPath(import.meta.url), 'utf8').split('\n').slice(1, 17).join('\n')); process.exit(0); }

let chromium;
try { ({ chromium } = require('playwright')); } catch (e) {
  console.error('Playwright is required: npm i -D playwright && npx playwright install chromium');
  process.exit(1);
}

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.json': 'application/json', '.png': 'image/png' };
const server = http.createServer((req, res) => {
  const rel = decodeURIComponent(new URL(req.url, 'http://local').pathname);
  const file = path.join(root, rel === '/' ? 'index.html' : rel);
  if (!file.startsWith(root)) { res.writeHead(403); res.end(); return; }
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' });
    res.end(data);
  });
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const port = server.address().port;

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 900, height: 1300 } });
page.on('pageerror', (e) => console.error('page error:', e.message));
const query = '?paused&nosound&reset' + (flag('reduced-motion') ? '&reduced' : '&reduced=0');
await page.goto(`http://127.0.0.1:${port}/index.html${query}`);
await page.waitForFunction(() => window.DiwaliParade && window.DiwaliParade.ready, null, { timeout: 30000 });
await page.evaluate(() => document.fonts && document.fonts.ready);

const f0 = Math.round(from * FPS), f1 = Math.min(Math.round(to * FPS), Math.round(duration * FPS));
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'diwali-'));
let wav = null;

if (withAudio) {
  process.stderr.write('Rendering soundtrack… ');
  const a = await page.evaluate(async (d) => {
    const s = await window.DiwaliParade.renderSoundtrack(d);
    const n = s.music.length, pcm = new Int16Array(n * 2);
    for (let i = 0; i < n; i++) {
      for (let c = 0; c < 2; c++) {
        const v = s.music.channels[c][i] + s.sfx.channels[c][i];
        pcm[i * 2 + c] = Math.round(Math.max(-1, Math.min(1, v)) * 32767);
      }
    }
    const bytes = new Uint8Array(pcm.buffer);
    let bin = '';
    for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    return { b64: btoa(bin), sr: s.sampleRate };
  }, duration);
  const data = Buffer.from(a.b64, 'base64');
  const head = Buffer.alloc(44);
  head.write('RIFF', 0); head.writeUInt32LE(36 + data.length, 4); head.write('WAVE', 8);
  head.write('fmt ', 12); head.writeUInt32LE(16, 16); head.writeUInt16LE(1, 20); head.writeUInt16LE(2, 22);
  head.writeUInt32LE(a.sr, 24); head.writeUInt32LE(a.sr * 4, 28); head.writeUInt16LE(4, 32); head.writeUInt16LE(16, 34);
  head.write('data', 36); head.writeUInt32LE(data.length, 40);
  wav = path.join(tmp, 'soundtrack.wav');
  fs.writeFileSync(wav, Buffer.concat([head, data]));
  console.error('done');
}

let ff = null;
if (framesDir) fs.mkdirSync(framesDir, { recursive: true });
else {
  const webm = out.toLowerCase().endsWith('.webm');
  const vcodec = webm ? ['-c:v', 'libvpx-vp9', '-b:v', '0', '-crf', '24', '-row-mt', '1', '-pix_fmt', 'yuv420p']
    : ['-c:v', 'libx264', '-preset', 'slow', '-crf', '16', '-pix_fmt', 'yuv420p', '-movflags', '+faststart'];
  const acodec = webm ? ['-c:a', 'libopus', '-b:a', '160k'] : ['-c:a', 'aac', '-b:a', '192k'];
  const args = ['-y', '-loglevel', 'error', '-f', 'image2pipe', '-framerate', String(FPS), '-i', '-'];
  if (wav) args.push('-ss', String(f0 / FPS), '-t', String((f1 - f0) / FPS), '-i', wav);
  args.push(...vcodec, '-r', String(FPS));
  if (wav) args.push(...acodec);
  args.push(out);
  ff = spawn('ffmpeg', args, { stdio: ['pipe', 'inherit', 'inherit'] });
  ff.on('error', (e) => { console.error('FFmpeg failed to start (is it on PATH?):', e.message); process.exit(1); });
}

for (let f = f0; f < f1; f++) {
  const t = (f / FPS) * (SPEC / duration);
  const b64 = await page.evaluate(([t, k]) => window.DiwaliParade.renderAt(t, k).toDataURL('image/png').slice(22), [t, scale]);
  const png = Buffer.from(b64, 'base64');
  if (framesDir) fs.writeFileSync(path.join(framesDir, `frame_${String(f).padStart(4, '0')}.png`), png);
  else if (!ff.stdin.write(png)) await new Promise((r) => ff.stdin.once('drain', r));
  if (f % 15 === 0 || f === f1 - 1) process.stderr.write(`\rFrames ${f - f0 + 1}/${f1 - f0}`);
}
process.stderr.write('\n');
if (ff) {
  ff.stdin.end();
  const code = await new Promise((r) => ff.on('close', r));
  if (code !== 0) { console.error('FFmpeg exited with code', code); process.exitCode = 1; }
  else console.log('Wrote', out);
} else console.log('Wrote PNG frames to', path.resolve(framesDir));

await browser.close();
server.close();
fs.rmSync(tmp, { recursive: true, force: true });
