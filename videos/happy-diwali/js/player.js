/* player.js — preview player, soundtrack playback and in-browser export.
 *
 * Exposes DL.ready (Promise) and DL.renderToDataURL(t) for the headless
 * renderer in render/render.mjs. */
(function () {
  'use strict';
  const DL = window.DL;
  const $ = (id) => document.getElementById(id);
  const canvas = $('screen');
  const ctx = canvas.getContext('2d');
  const SCALE = canvas.width / DL.W;
  const RENDER_MODE = new URLSearchParams(location.search).has('render');
  const app = document.querySelector('.app');

  let t = 0;
  let playing = false;
  let muted = false;
  let soundtrack = null;
  let soundPromise = null;
  let ac = null, gain = null, src = null;
  let clock = null; // { kind: 'audio'|'perf', origin, offset }

  const status = (msg) => ($('status').textContent = msg);

  function draw() {
    DL.renderFrame(ctx, t, SCALE);
    $('seek').value = t;
    $('time').textContent = `${t.toFixed(2)} / ${DL.DURATION.toFixed(2)}`;
  }

  // ------------------------------------------------------------- playback
  function ensureAudio() {
    if (!ac) {
      ac = new AudioContext({ sampleRate: 48000 });
      gain = ac.createGain();
      gain.gain.value = muted ? 0 : 1;
      gain.connect(ac.destination);
    }
    if (ac.state === 'suspended') ac.resume();
  }
  function startSource(offset) {
    stopSource();
    if (!soundtrack) return false;
    src = ac.createBufferSource();
    src.buffer = soundtrack;
    src.connect(gain);
    const when = ac.currentTime + 0.05;
    src.start(when, offset);
    clock = { kind: 'audio', origin: when, offset };
    return true;
  }
  function stopSource() {
    if (src) {
      try {
        src.stop();
      } catch (e) {
        /* already stopped */
      }
      src.disconnect();
      src = null;
    }
  }
  function currentTime() {
    if (!clock) return t;
    if (clock.kind === 'audio') return clock.offset + Math.max(0, ac.currentTime - clock.origin);
    return clock.offset + (performance.now() / 1000 - clock.origin);
  }

  function play() {
    if (t >= DL.DURATION - 1e-3) t = 0;
    ensureAudio();
    if (!startSource(t)) clock = { kind: 'perf', origin: performance.now() / 1000, offset: t };
    playing = true;
    app.classList.add('playing');
    requestAnimationFrame(tick);
  }
  function pause() {
    if (!playing) return;
    t = currentTime();
    playing = false;
    stopSource();
    clock = null;
    app.classList.remove('playing');
    draw();
  }
  function tick() {
    if (!playing) return;
    // picked up the soundtrack mid-play? switch to the audio clock
    if (clock.kind === 'perf' && soundtrack && ac) startSource(currentTime());
    t = Math.min(DL.DURATION, currentTime());
    draw();
    if (t >= DL.DURATION) {
      playing = false;
      stopSource();
      clock = null;
      app.classList.remove('playing');
      return;
    }
    requestAnimationFrame(tick);
  }
  function seekTo(v) {
    const was = playing;
    if (was) pause();
    t = Math.max(0, Math.min(DL.DURATION, v));
    draw();
    if (was) play();
  }

  // ------------------------------------------------------------- export
  function pickMime() {
    const prefs = [
      'video/mp4;codecs=avc1.640028,mp4a.40.2',
      'video/mp4;codecs=avc1,mp4a',
      'video/mp4',
      'video/webm;codecs=vp9,opus',
      'video/webm;codecs=vp8,opus',
      'video/webm',
    ];
    return prefs.find((m) => window.MediaRecorder && MediaRecorder.isTypeSupported(m)) || '';
  }
  function download(blob, name) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      URL.revokeObjectURL(a.href);
      a.remove();
    }, 2000);
  }

  async function exportVideo() {
    if (!window.MediaRecorder || !canvas.captureStream) {
      status('This browser cannot record a canvas. Use Chrome/Edge, or run render/render.mjs.');
      return;
    }
    pause();
    const eac = new AudioContext({ sampleRate: 48000 }); // created inside the click (user gesture)
    const btns = document.querySelectorAll('button, input');
    btns.forEach((b) => (b.disabled = true));
    try {
      if (!soundtrack) {
        status('Preparing soundtrack…');
        await soundPromise;
      }
      const mime = pickMime();
      const stream = canvas.captureStream(DL.FPS);
      const dest = eac.createMediaStreamDestination();
      const s = eac.createBufferSource();
      s.buffer = soundtrack;
      s.connect(dest);
      stream.addTrack(dest.stream.getAudioTracks()[0]);
      const rec = new MediaRecorder(stream, { mimeType: mime || undefined, videoBitsPerSecond: 14e6, audioBitsPerSecond: 192e3 });
      const chunks = [];
      rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
      const stopped = new Promise((r) => (rec.onstop = r));
      t = 0;
      draw();
      rec.start(250);
      const startAt = eac.currentTime + 0.2;
      s.start(startAt);
      await new Promise((resolve) => {
        const loop = () => {
          const tt = eac.currentTime - startAt;
          t = Math.max(0, Math.min(DL.DURATION, tt));
          draw();
          status(`Recording… ${Math.round((t / DL.DURATION) * 100)}% (keep this tab visible)`);
          if (tt >= DL.DURATION + 0.15) resolve();
          else requestAnimationFrame(loop);
        };
        requestAnimationFrame(loop);
      });
      rec.stop();
      await stopped;
      const type = rec.mimeType || mime || 'video/webm';
      const ext = type.includes('mp4') ? 'mp4' : 'webm';
      download(new Blob(chunks, { type }), `the-dev-loop-happy-diwali.${ext}`);
      status(`Saved the-dev-loop-happy-diwali.${ext}`);
    } catch (e) {
      console.error(e);
      status('Export failed: ' + e.message);
    } finally {
      eac.close();
      btns.forEach((b) => (b.disabled = false));
    }
  }

  async function downloadWav() {
    if (!soundtrack) {
      status('Preparing soundtrack…');
      await soundPromise;
    }
    download(new Blob([DL.encodeWav(soundtrack)], { type: 'audio/wav' }), 'the-dev-loop-happy-diwali.wav');
    status('Saved the-dev-loop-happy-diwali.wav');
  }

  // ------------------------------------------------------------- wiring
  $('play').addEventListener('click', () => (playing ? pause() : play()));
  $('bigPlay').addEventListener('click', play);
  canvas.addEventListener('click', () => (playing ? pause() : play()));
  $('restart').addEventListener('click', () => seekTo(0));
  $('seek').addEventListener('input', (e) => seekTo(parseFloat(e.target.value)));
  $('mute').addEventListener('click', () => {
    muted = !muted;
    app.classList.toggle('muted', muted);
    if (gain) gain.gain.value = muted ? 0 : 1;
  });
  $('export').addEventListener('click', exportVideo);
  $('wav').addEventListener('click', downloadWav);
  document.addEventListener('keydown', (e) => {
    if (e.target.tagName === 'INPUT' && e.code !== 'Space') return;
    if (e.code === 'Space') {
      e.preventDefault();
      playing ? pause() : play();
    } else if (e.code === 'ArrowRight') seekTo(t + 1 / DL.FPS);
    else if (e.code === 'ArrowLeft') seekTo(t - 1 / DL.FPS);
  });

  // ------------------------------------------------------------- boot
  DL.ready = (async () => {
    await DL.loadAssets();
    draw();
    if (!RENDER_MODE) {
      status('Preparing soundtrack…');
      soundPromise = DL.renderSoundtrack().then((b) => {
        soundtrack = b;
        status('Ready — press play.');
        return b;
      });
    } else status('Render mode');
  })();

  /** Used by render/render.mjs: draw time t and return a PNG data URL. */
  DL.renderToDataURL = function (time, type = 'image/png', quality) {
    t = time;
    DL.renderFrame(ctx, time, SCALE);
    return canvas.toDataURL(type, quality);
  };
})();
