/* audio.js — an original soundtrack, synthesised from scratch with the Web
 * Audio API and rendered offline (deterministic, sample-accurate to DL.T).
 *
 *   music : plucked strings (Karplus–Strong), bells, tabla-style drums, bass
 *   sfx   : fuse sizzle, rocket whistles, whooshes, trip/thud, the BOOM,
 *           fireworks, UI pops and the "Follow" tap
 *
 * DL.renderSoundtrack() -> Promise<AudioBuffer>
 * DL.encodeWav(buffer)   -> ArrayBuffer (16-bit PCM)
 */
(function () {
  'use strict';
  const DL = window.DL;
  const T = DL.T;

  const NOTE = { C: 0, 'C#': 1, D: 2, 'D#': 3, E: 4, F: 5, 'F#': 6, G: 7, 'G#': 8, A: 9, 'A#': 10, Bb: 10, B: 11 };
  const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);
  function nf(name) {
    const m = /^([A-G](?:#|b)?)(-?\d)$/.exec(name);
    return mtof(NOTE[m[1]] + (parseInt(m[2], 10) + 1) * 12);
  }
  const toks = (s) => s.trim().split(/\s+/);

  DL.renderSoundtrack = async function (opts = {}) {
    const SR = opts.sampleRate || 48000;
    const dur = DL.DURATION;
    const ctx = new OfflineAudioContext({ numberOfChannels: 2, length: Math.ceil(dur * SR), sampleRate: SR });
    const rnd = DL.rng(2024);

    // ------------------------------------------------------------ buses
    const master = ctx.createGain();
    master.gain.value = 0.9;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14;
    comp.knee.value = 8;
    comp.ratio.value = 4;
    comp.attack.value = 0.004;
    comp.release.value = 0.22;
    master.connect(comp).connect(ctx.destination);

    const reverb = ctx.createConvolver();
    reverb.buffer = impulse(ctx, 2.6, 2.8);
    const revRet = ctx.createGain();
    revRet.gain.value = 0.32;
    reverb.connect(revRet).connect(master);

    const music = ctx.createGain();
    music.gain.value = 0.5;
    music.connect(master);
    const sfx = ctx.createGain();
    sfx.gain.value = 0.8;
    sfx.connect(master);
    const musicRev = ctx.createGain();
    musicRev.gain.value = 0.55;
    music.connect(musicRev).connect(reverb);
    const sfxRev = ctx.createGain();
    sfxRev.gain.value = 0.25;
    sfx.connect(sfxRev).connect(reverb);

    // ------------------------------------------------------------ sample synthesis
    const noise = (() => {
      const b = ctx.createBuffer(2, SR * 4, SR);
      for (let c = 0; c < 2; c++) {
        const d = b.getChannelData(c);
        const r = DL.rng(77 + c);
        for (let i = 0; i < d.length; i++) d[i] = r() * 2 - 1;
      }
      return b;
    })();
    const cache = new Map();
    function mono(key, seconds, fill) {
      if (cache.has(key)) return cache.get(key);
      const b = ctx.createBuffer(1, Math.ceil(seconds * SR), SR);
      fill(b.getChannelData(0));
      cache.set(key, b);
      return b;
    }

    /** Karplus–Strong plucked string. Returns {buf, rate} (rate fixes tuning). */
    function pluckBuf(freq, ring = 1.4, bright = 0.55) {
      const N = Math.max(4, Math.round(SR / freq));
      const key = `pl:${N}:${ring}:${bright}`;
      const buf = mono(key, ring + 0.2, (d) => {
        const line = new Float32Array(N);
        const r = DL.rng(N * 31 + 7);
        let lp = 0;
        for (let i = 0; i < N; i++) {
          lp += bright * (r() * 2 - 1 - lp);
          line[i] = lp;
        }
        const f0 = SR / N;
        const fb = Math.pow(0.001, 1 / (f0 * ring));
        let idx = 0, dc = 0, last = 0;
        for (let i = 0; i < d.length; i++) {
          const a = line[idx], b = line[(idx + 1) % N];
          line[idx] = fb * 0.5 * (a + b);
          idx = (idx + 1) % N;
          // DC blocker
          const y = a - last + 0.995 * dc;
          last = a;
          dc = y;
          d[i] = y * Math.min(1, i / 24);
        }
        normalize(d, 0.9);
      });
      return { buf, rate: freq / (SR / N) };
    }
    function bellBuf(freq) {
      return mono(`bell:${freq.toFixed(2)}`, 3.2, (d) => {
        const P = [[1, 1, 1.5], [2.0, 0.38, 0.9], [3.01, 0.2, 0.55], [4.17, 0.14, 0.35], [5.43, 0.07, 0.22], [0.5, 0.1, 1.8]];
        for (const [m, a, dec] of P) {
          const w = (2 * Math.PI * freq * m) / SR;
          if (w >= Math.PI) continue; // above Nyquist
          const cw = Math.cos(w), sw = Math.sin(w), k = Math.exp(-1 / (dec * SR));
          let c = 1, sn = 0, env = a;
          for (let i = 0; i < d.length; i++) {
            d[i] += sn * env;
            const nc = c * cw - sn * sw;
            sn = sn * cw + c * sw;
            c = nc;
            env *= k;
          }
        }
        const atk = Math.floor(0.002 * SR);
        for (let i = 0; i < atk; i++) d[i] *= i / atk;
        normalize(d, 0.8);
      });
    }
    const kickBuf = mono('kick', 0.6, (d) => {
      let ph = 0;
      for (let i = 0; i < d.length; i++) {
        const t = i / SR;
        const f = 48 + 120 * Math.exp(-t * 30);
        ph += (2 * Math.PI * f) / SR;
        d[i] = Math.sin(ph) * Math.exp(-t * 7.5) * Math.min(1, t / 0.0015);
      }
    });
    // tabla-ish: "na" (bright ringing slap) and "ge" (bass with the upward swoop)
    const naBuf = mono('na', 0.5, (d) => {
      const r = DL.rng(5);
      let ph = 0, ph2 = 0;
      for (let i = 0; i < d.length; i++) {
        const t = i / SR;
        const f = 560 * (1 + 0.04 * Math.exp(-t * 40));
        ph += (2 * Math.PI * f) / SR;
        ph2 += (2 * Math.PI * f * 2.02) / SR;
        const click = (r() * 2 - 1) * Math.exp(-t * 300) * 0.5;
        d[i] = (Math.sin(ph) * 0.8 + Math.sin(ph2) * 0.25) * Math.exp(-t * 11) + click;
      }
      normalize(d, 0.8);
    });
    const geBuf = mono('ge', 0.8, (d) => {
      let ph = 0;
      for (let i = 0; i < d.length; i++) {
        const t = i / SR;
        const f = 78 + 46 * (1 - Math.exp(-t * 9));
        ph += (2 * Math.PI * f) / SR;
        d[i] = Math.sin(ph) * Math.exp(-t * 5.5) * Math.min(1, t / 0.003);
      }
      normalize(d, 0.9);
    });
    const shakerBuf = mono('shk', 0.12, (d) => {
      const r = DL.rng(9);
      let hp = 0, last = 0;
      for (let i = 0; i < d.length; i++) {
        const t = i / SR;
        const n = r() * 2 - 1;
        hp = 0.85 * (hp + n - last);
        last = n;
        d[i] = hp * Math.min(1, t / 0.006) * Math.exp(-t * 45);
      }
      normalize(d, 0.6);
    });

    // ------------------------------------------------------------ players
    function play(buf, when, { gain = 1, rate = 1, pan = 0, dest = music, lp = 0 } = {}) {
      if (when < 0 || when >= dur) return null;
      const s = ctx.createBufferSource();
      s.buffer = buf;
      s.playbackRate.value = rate;
      const g = ctx.createGain();
      g.gain.value = gain;
      let node = s;
      if (lp) {
        const f = ctx.createBiquadFilter();
        f.type = 'lowpass';
        f.frequency.value = lp;
        node.connect(f);
        node = f;
      }
      node.connect(g);
      if (pan) {
        const p = ctx.createStereoPanner();
        p.pan.value = pan;
        g.connect(p).connect(dest);
      } else g.connect(dest);
      s.start(when);
      return { s, g };
    }
    const pluck = (when, note, o = {}) => {
      const { buf, rate } = pluckBuf(nf(note), o.ring || 1.4, o.bright || 0.55);
      const v = play(buf, when, { gain: o.gain ?? 0.5, rate, pan: o.pan || 0, lp: o.lp || 0 });
      if (v && o.cut) {
        v.g.gain.setValueAtTime(o.gain ?? 0.5, when + o.cut);
        v.g.gain.linearRampToValueAtTime(0, when + o.cut + 0.05);
      }
    };
    const bell = (when, note, gain = 0.25, pan = 0) => play(bellBuf(nf(note)), when, { gain, pan });
    const kick = (when, gain = 0.8) => play(kickBuf, when, { gain });
    const na = (when, gain = 0.3, pan = 0.15) => play(naBuf, when, { gain, pan });
    const ge = (when, gain = 0.45) => play(geBuf, when, { gain });
    const shaker = (when, gain = 0.12) => play(shakerBuf, when, { gain: gain * 0.7, pan: -0.25, lp: 8000 });

    function bass(when, note, len, gain = 0.32) {
      if (when >= dur) return;
      const o = ctx.createOscillator();
      o.type = 'triangle';
      o.frequency.value = nf(note);
      const o2 = ctx.createOscillator();
      o2.type = 'sine';
      o2.frequency.value = nf(note) / 2;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0, when);
      g.gain.linearRampToValueAtTime(gain, when + 0.01);
      g.gain.setTargetAtTime(gain * 0.6, when + 0.02, 0.08);
      g.gain.setTargetAtTime(0, when + len, 0.04);
      const f = ctx.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.value = 700;
      o.connect(f);
      const g2 = ctx.createGain();
      g2.gain.value = 0.7;
      o2.connect(g2).connect(f);
      f.connect(g).connect(music);
      o.start(when);
      o2.start(when);
      o.stop(when + len + 0.4);
      o2.stop(when + len + 0.4);
    }
    function pad(when, notes, len, gain = 0.06, attack = 0.8) {
      const g = ctx.createGain();
      g.gain.setValueAtTime(0, when);
      g.gain.linearRampToValueAtTime(gain, when + attack);
      g.gain.setValueAtTime(gain, when + len);
      g.gain.linearRampToValueAtTime(0, when + len + 1.2);
      const f = ctx.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.value = 1400;
      f.Q.value = 0.4;
      f.connect(g).connect(music);
      notes.forEach((n, i) => {
        for (const det of [-7, 6]) {
          const o = ctx.createOscillator();
          o.type = 'sawtooth';
          o.frequency.value = nf(n);
          o.detune.value = det + i;
          o.connect(f);
          o.start(when);
          o.stop(when + len + 1.4);
        }
      });
    }

    // ------------------------------------------------------------ sfx helpers
    function noiseSrc(when, len, { type = 'bandpass', f0 = 800, f1 = 800, q = 1, gain = 0.5, attack = 0.02, release = 0.1, pan = 0, pan1 = null, dest = sfx, curve = 'exp' } = {}) {
      if (when >= dur) return;
      const s = ctx.createBufferSource();
      s.buffer = noise;
      s.loop = true;
      const f = ctx.createBiquadFilter();
      f.type = type;
      f.Q.value = q;
      f.frequency.setValueAtTime(f0, when);
      if (curve === 'exp') f.frequency.exponentialRampToValueAtTime(f1, when + len);
      else f.frequency.linearRampToValueAtTime(f1, when + len);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0, when);
      g.gain.linearRampToValueAtTime(gain, when + attack);
      g.gain.setValueAtTime(gain, Math.max(when + attack, when + len - release));
      g.gain.linearRampToValueAtTime(0, when + len);
      const p = ctx.createStereoPanner();
      p.pan.setValueAtTime(pan, when);
      if (pan1 !== null) p.pan.linearRampToValueAtTime(pan1, when + len);
      s.connect(f).connect(g).connect(p).connect(dest);
      s.start(when, rnd() * 3);
      s.stop(when + len + 0.05);
      return { f, g, p };
    }
    function tone(when, len, { type = 'sine', f0 = 440, f1 = null, gain = 0.3, attack = 0.01, release = 0.1, vib = 0, vibRate = 6, pan = 0, dest = sfx, curve = 'exp' } = {}) {
      if (when >= dur) return;
      const o = ctx.createOscillator();
      o.type = type;
      o.frequency.setValueAtTime(f0, when);
      if (f1) {
        if (curve === 'exp') o.frequency.exponentialRampToValueAtTime(f1, when + len);
        else o.frequency.linearRampToValueAtTime(f1, when + len);
      }
      if (vib) {
        const l = ctx.createOscillator();
        l.frequency.value = vibRate;
        const lg = ctx.createGain();
        lg.gain.value = vib;
        l.connect(lg).connect(o.frequency);
        l.start(when);
        l.stop(when + len + 0.1);
      }
      const g = ctx.createGain();
      g.gain.setValueAtTime(0, when);
      g.gain.linearRampToValueAtTime(gain, when + attack);
      g.gain.setValueAtTime(gain, Math.max(when + attack, when + len - release));
      g.gain.linearRampToValueAtTime(0, when + len);
      const p = ctx.createStereoPanner();
      p.pan.value = pan;
      o.connect(g).connect(p).connect(dest);
      o.start(when);
      o.stop(when + len + 0.05);
      return { o, g };
    }
    const crackBufs = [0, 1, 2, 3].map((v) =>
      mono(`crk:${v}`, 0.05, (d) => {
        const r = DL.rng(900 + v);
        let hp = 0, last = 0;
        const dec = 90 + v * 40;
        for (let i = 0; i < d.length; i++) {
          const t = i / SR;
          const x = r() * 2 - 1;
          hp = 0.6 * (hp + x - last);
          last = x;
          d[i] = hp * Math.exp(-t * dec);
        }
        normalize(d, 0.9);
      })
    );
    function crackle(t0, t1, density, gain = 0.25, pan = 0, spread = 0.6) {
      const n = Math.floor((t1 - t0) * density);
      for (let i = 0; i < n; i++) {
        const w = t0 + rnd() * (t1 - t0);
        const fade = 1 - (w - t0) / (t1 - t0);
        play(crackBufs[i % 4], w, {
          gain: gain * (0.3 + rnd() * 0.7) * (0.35 + 0.65 * fade),
          rate: 0.7 + rnd() * 0.8,
          pan: Math.max(-1, Math.min(1, pan + (rnd() - 0.5) * spread)) || 0.001,
          dest: sfx,
        });
      }
    }
    const pop = (when, gain = 0.35, f = 500, pan = 0) =>
      tone(when, 0.13, { f0: f, f1: f * 2.6, gain, attack: 0.004, release: 0.1, pan });
    function thump(when, gain = 0.5) {
      tone(when, 0.28, { f0: 120, f1: 42, gain, attack: 0.003, release: 0.25 });
      noiseSrc(when, 0.18, { type: 'lowpass', f0: 600, f1: 150, gain: gain * 0.6, attack: 0.002, release: 0.16 });
    }

    // ============================================================ SCORE
    const spb = 0.5;      // seconds per beat (120 bpm)
    const s16 = spb / 4;  // 16th note

    // ---- 0.0–2.0 tiptoe intro: staccato plucks + footsteps
    const intro = toks('D4 . A3 . D4 E4 F#4 . A4 . F#4 . E4 . D4 .');
    intro.forEach((n, i) => n !== '.' && pluck(i * s16 * 1, n, { gain: 0.42, ring: 0.5, cut: 0.11, pan: (i % 2 ? 0.2 : -0.2) }));
    [0, 1].forEach((b) => bass(b * 1.0, 'D2', 0.35, 0.26));
    for (let i = 0; i < 9; i++) {
      // pitter-patter footsteps as they scurry in
      thump(0.05 + i * 0.135, 0.08);
    }
    // ---- 2.0–3.4 fuse burning: tremolo builds
    for (let i = 0; i < 11; i++) {
      const w = T.ignite + 0.15 + i * s16;
      const k = i / 10;
      pluck(w, i % 2 ? 'A3' : 'D4', { gain: 0.16 + 0.3 * k, ring: 0.4, cut: 0.1 });
    }
    noiseSrc(T.ignite - 0.02, T.launch - T.ignite + 0.05, { type: 'bandpass', f0: 3800, f1: 5200, q: 0.8, gain: 0.16, attack: 0.05, release: 0.05, pan: -0.45 });
    crackle(T.ignite, T.launch, 45, 0.2, -0.45, 0.2);
    tone(T.ignite, 0.06, { f0: 2400, f1: 1800, gain: 0.15, pan: -0.4 }); // ignition tick

    // ---- launch: whoosh + rising whistle, panning left as it flies off
    noiseSrc(T.launch, 1.05, { f0: 400, f1: 3200, q: 1.2, gain: 0.55, attack: 0.03, release: 0.4, pan: -0.35, pan1: -0.9 });
    tone(T.launch + 0.05, 1.0, { f0: 900, f1: 2600, gain: 0.11, vib: 30, vibRate: 13, attack: 0.08, release: 0.35, pan: -0.4 });
    thump(T.launch, 0.32);
    // harp run "wow" + shimmering chord while they watch
    toks('D4 E4 F#4 A4 B4 D5 E5 F#5 A5').forEach((n, i) => pluck(T.launch + 0.08 + i * 0.055, n, { gain: 0.26, ring: 1.8, pan: -0.3 + i * 0.07 }));
    ['D5', 'F#5', 'A5', 'E6'].forEach((n, i) => bell(3.95 + i * 0.03, n, 0.08, (i - 1.5) * 0.3));
    // relief "ta-da"
    pluck(T.rocketGone + 0.05, 'A4', { gain: 0.38, ring: 1 });
    pluck(T.rocketGone + 0.2, 'D5', { gain: 0.42, ring: 1.4 });
    bell(T.rocketGone + 0.2, 'D6', 0.1);

    // ---- the rocket is BACK: descending whistle, then the shock sting
    tone(4.55, 0.48, { f0: 2600, f1: 1250, gain: 0.12, vib: 25, vibRate: 11, attack: 0.05, release: 0.05, pan: -0.85 });
    noiseSrc(4.6, 0.45, { f0: 500, f1: 2500, q: 1, gain: 0.4, attack: 0.35, release: 0.05, pan: -0.9, pan1: -0.4 });
    // sting: minor stab + crash
    ['D3', 'A3', 'D4', 'F4', 'A4'].forEach((n) => pluck(T.shock, n, { gain: 0.36, ring: 0.9, bright: 0.85 }));
    bass(T.shock, 'D2', 0.4, 0.4);
    kick(T.shock, 0.9);
    noiseSrc(T.shock, 1.2, { type: 'bandpass', f0: 6000, f1: 4500, q: 0.5, gain: 0.26, attack: 0.002, release: 1.1 });

    // ---- rocket hiss through the chase (follows the rocket on the left)
    noiseSrc(T.rocketBack, T.boom - T.rocketBack, { f0: 1600, f1: 1100, q: 0.9, gain: 0.07, attack: 0.3, release: 0.2, pan: -0.55, pan1: -0.05 });

    // ---- CHASE groove (D | C | G | A), bars of 2 s
    const CH = [
      { root: 'D2', fifth: 'A2', mel: 'D5 . D5 E5 F#5 . E5 D5 A4 . B4 . D5 . . .' },
      { root: 'C2', fifth: 'G2', mel: 'C5 . C5 D5 E5 . D5 C5 G4 . A4 . C5 . . .' },
      { root: 'G2', fifth: 'D3', mel: 'B4 . B4 C5 D5 . C5 B4 G4 . A4 . B4 . D5 .' },
      { root: 'A2', fifth: 'E3', mel: 'E5 . D5 . C#5 . A4 . E5 F#5 E5 D5 C#5 . A4 .' },
    ];
    const up = (n) => n.replace(/\d/, (d) => String(+d + 1));
    function chaseBar(t0, bar, until) {
      const c = CH[bar % 4];
      for (let i = 0; i < 16; i++) {
        const w = t0 + i * s16;
        if (w >= until) break;
        if ([0, 3, 6, 8, 11, 14].includes(i)) (i % 8 === 0 ? kick : (x) => ge(x, 0.32))(w, 0.75);
        if ([2, 4, 7, 10, 12, 15].includes(i)) na(w, i === 4 || i === 12 ? 0.3 : 0.18);
        shaker(w, i % 2 ? 0.07 : 0.11);
        if (i % 2 === 0) {
          const bn = [c.root, up(c.root), c.fifth, up(c.root)][(i / 2) % 4];
          bass(w, bn, s16 * 1.6, 0.27);
        }
        const m = toks(c.mel)[i];
        if (m !== '.') pluck(w, m, { gain: 0.33, ring: 0.9, bright: 0.7, pan: 0.12 });
      }
    }
    for (let b = 0, t0 = T.runStart; t0 < T.trip; b++, t0 += 2) chaseBar(t0, b, T.trip - 0.01);

    // ---- the trip: bonk, thud, slide, tense tremolo, boing
    tone(T.trip + 0.05, 0.16, { type: 'square', f0: 330, f1: 220, gain: 0.08, attack: 0.002 });
    pluck(T.trip + 0.05, 'C#4', { gain: 0.3, ring: 0.6 });
    thump(T.land, 0.75);
    noiseSrc(T.land, 0.5, { type: 'bandpass', f0: 900, f1: 300, q: 0.8, gain: 0.25, attack: 0.01, release: 0.3 });
    for (let i = 0; i < 9; i++) pluck(T.land + 0.12 + i * 0.06, i % 2 ? 'C5' : 'C#5', { gain: 0.1 + i * 0.012, ring: 0.3, cut: 0.05 });
    tone(T.pullUp, 0.35, { f0: 180, f1: 520, gain: 0.16, vib: 40, vibRate: 18, attack: 0.005, release: 0.15 });
    pop(T.pullUp + 0.02, 0.2, 300);

    // ---- chase resumes, then they flee off screen
    const resume = T.pullUp + 0.15;
    for (let b = 0, t0 = resume; t0 < 13.4; b++, t0 += 2) chaseBar(t0, b, 13.35);
    noiseSrc(12.75, 0.7, { f0: 600, f1: 2200, q: 0.9, gain: 0.25, attack: 0.05, release: 0.4, pan: 0.2, pan1: 0.95 }); // whoosh off right
    // deflating rocket + sputter
    tone(13.35, 0.9, { type: 'triangle', f0: 880, f1: 220, gain: 0.08, vib: 18, vibRate: 9, attack: 0.02, release: 0.3, curve: 'exp' });
    for (let i = 0; i < 9; i++) {
      const w = 13.85 + i * 0.075 + rnd() * 0.02;
      noiseSrc(w, 0.04, { type: 'lowpass', f0: 1800, f1: 600, gain: 0.3, attack: 0.002, release: 0.03, pan: -0.1 });
    }
    // riser into the boom
    noiseSrc(13.9, 0.68, { f0: 300, f1: 4000, q: 2, gain: 0.22, attack: 0.5, release: 0.04 });
    tone(13.95, 0.62, { f0: 300, f1: 1400, gain: 0.05, vib: 12, vibRate: 22, attack: 0.4, release: 0.03 });

    // ---- BOOM
    tone(T.boom, 1.6, { f0: 95, f1: 30, gain: 0.85, attack: 0.002, release: 1.4 });
    noiseSrc(T.boom, 1.9, { type: 'lowpass', f0: 3200, f1: 160, q: 0.6, gain: 0.9, attack: 0.002, release: 1.7 });
    noiseSrc(T.boom, 0.3, { type: 'highpass', f0: 2500, f1: 2000, q: 0.5, gain: 0.35, attack: 0.001, release: 0.28 });
    crackle(T.boom + 0.1, T.boom + 1.7, 70, 0.3, 0, 1.4);
    // festive chord on the reveal
    ['D3', 'A3', 'D4', 'F#4', 'A4', 'D5'].forEach((n, i) => pluck(T.boom + 0.06 + i * 0.012, n, { gain: 0.3, ring: 2.4, bright: 0.75, pan: (i - 2.5) * 0.15 }));
    ['F#5', 'A5', 'D6'].forEach((n, i) => bell(T.boom + 0.1 + i * 0.07, n, 0.16, (i - 1) * 0.4));
    bass(T.boom + 0.05, 'D2', 1.2, 0.36);

    // ---- celebration groove (D | G | A | D)
    const CEL = [
      { root: 'D2', fifth: 'A2', mel: 'F#5 . A5 . B5 A5 F#5 . D5 . E5 . F#5 . . .', arp: 'D4 F#4 A4 F#4' },
      { root: 'G2', fifth: 'D3', mel: 'G5 . B5 . D6 B5 G5 . E5 . F#5 . G5 . . .', arp: 'G3 B3 D4 B3' },
      { root: 'A2', fifth: 'E3', mel: 'A5 . C#6 . E6 C#6 A5 . E5 . F#5 . G5 . A5 .', arp: 'A3 C#4 E4 C#4' },
      { root: 'D2', fifth: 'A2', mel: 'D6 . A5 . F#5 . D5 . A5 . . . D6 . . .', arp: 'D4 F#4 A4 D5' },
    ];
    function celBar(t0, bar, until) {
      const c = CEL[bar % 4];
      const mel = toks(c.mel), arp = toks(c.arp);
      for (let i = 0; i < 16; i++) {
        const w = t0 + i * s16;
        if (w >= until) break;
        if (i === 0 || i === 8) kick(w, 0.55);
        if (i === 6 || i === 14) ge(w, 0.28);
        if (i === 4 || i === 12) na(w, 0.26);
        if (i === 10) na(w, 0.14);
        if (i % 2 === 0) shaker(w, 0.07);
        if (i === 0) bass(w, c.root, 0.9, 0.26);
        if (i === 8) bass(w, c.fifth, 0.9, 0.22);
        if (mel[i] !== '.') bell(w, mel[i], 0.2, 0.15);
        if (i % 2 === 0) pluck(w, arp[(i / 2) % 4], { gain: 0.15, ring: 0.8, pan: -0.3 });
      }
    }
    const celStart = T.boom + 0.5;
    for (let b = 0, t0 = celStart; t0 < T.wipe; b++, t0 += 2) celBar(t0, b, T.wipe - 0.02);

    // fireworks: whistle up, pop, crackle
    (DL.FIREWORKS || []).forEach((f) => {
      const pan = (f.x - 360) / 420;
      tone(f.t, 0.42, { f0: 700, f1: 1700, gain: 0.035, attack: 0.05, release: 0.05, pan });
      noiseSrc(f.t + 0.42, 0.25, { type: 'lowpass', f0: 2600, f1: 300, gain: 0.3, attack: 0.002, release: 0.22, pan });
      crackle(f.t + 0.55, f.t + 1.35, 40, 0.12, pan, 0.4);
    });

    // ---- END CARD
    noiseSrc(T.wipe - 0.1, 0.75, { f0: 300, f1: 2600, q: 0.8, gain: 0.32, attack: 0.25, release: 0.4 }); // wipe whoosh
    ['D4', 'F#4', 'A4', 'D5'].forEach((n, i) => pluck(T.wipe + 0.55 + i * 0.04, n, { gain: 0.26, ring: 2.4 }));
    pad(T.wipe + 0.4, ['D3', 'A3', 'E4', 'F#4'], 4.2, 0.045, 1.2);
    bass(T.wipe + 0.55, 'D2', 3.8, 0.18);
    pop(T.logoPop + 0.28, 0.3, 420);
    // the loop dot: a gentle rising shimmer
    toks('D5 E5 F#5 A5 B5 D6 E6 F#6 A6').forEach((n, i) => bell(T.dotLoop + 0.1 + i * 0.17, n, 0.06 + i * 0.004, Math.sin(i * 1.3) * 0.5));
    pop(T.follow + 0.05, 0.2, 380);
    pop(T.button + 0.05, 0.28, 520);
    // the tap: click + success ding
    noiseSrc(T.tap, 0.03, { type: 'highpass', f0: 3000, f1: 3000, gain: 0.35, attack: 0.001, release: 0.02 });
    tone(T.tap, 0.05, { f0: 1800, f1: 1200, gain: 0.12, attack: 0.001, release: 0.04 });
    bell(T.tap + 0.08, 'A5', 0.2);
    bell(T.tap + 0.2, 'D6', 0.22);
    pop(T.link + 0.05, 0.18, 460);
    bell(T.link + 0.1, 'F#5', 0.1, -0.3);
    bell(T.link + 0.25, 'A5', 0.1, 0.3);
    // soft closing arpeggio
    const arpEnd = toks('D4 F#4 A4 D5 A4 F#4 E4 A4 D5 F#5 D5 A4');
    for (let i = 0; i < 16; i++) {
      const w = 25.2 + i * 0.25;
      if (w > 27.0) break;
      pluck(w, arpEnd[i % arpEnd.length], { gain: 0.13 * (1 - i / 18), ring: 1.6, pan: Math.sin(i) * 0.4 });
    }
    ['D5', 'F#5', 'A5'].forEach((n, i) => bell(26.2 + i * 0.05, n, 0.07));

    // master fade-out at the very end
    master.gain.setValueAtTime(0.9, dur - 1.0);
    master.gain.linearRampToValueAtTime(0.0, dur - 0.05);

    const out = await ctx.startRendering();
    // final peak safety (-1 dBFS)
    let peak = 0;
    for (let c = 0; c < out.numberOfChannels; c++) {
      const d = out.getChannelData(c);
      for (let i = 0; i < d.length; i++) peak = Math.max(peak, Math.abs(d[i]));
    }
    const lim = 0.89;
    if (peak > lim) {
      const k = lim / peak;
      for (let c = 0; c < out.numberOfChannels; c++) {
        const d = out.getChannelData(c);
        for (let i = 0; i < d.length; i++) d[i] *= k;
      }
    }
    return out;
  };

  function normalize(d, to) {
    let p = 0;
    for (let i = 0; i < d.length; i++) p = Math.max(p, Math.abs(d[i]));
    if (p > 0) for (let i = 0; i < d.length; i++) d[i] *= to / p;
  }

  /** Stereo reverb impulse: decaying noise, darker as it fades. */
  function impulse(ctx, seconds, decay) {
    const SR = ctx.sampleRate;
    const len = Math.floor(seconds * SR);
    const b = ctx.createBuffer(2, len, SR);
    for (let c = 0; c < 2; c++) {
      const d = b.getChannelData(c);
      const r = DL.rng(311 + c);
      let lp = 0;
      for (let i = 0; i < len; i++) {
        const t = i / SR;
        const k = 0.15 + 0.8 * (t / seconds);
        lp += (1 - k) * (r() * 2 - 1 - lp);
        d[i] = lp * Math.pow(1 - i / len, decay) * (i < SR * 0.01 ? i / (SR * 0.01) : 1);
      }
    }
    return b;
  }

  /** 16-bit PCM WAV encoder. */
  DL.encodeWav = function (buf) {
    const ch = buf.numberOfChannels, sr = buf.sampleRate, n = buf.length;
    const data = new DataView(new ArrayBuffer(44 + n * ch * 2));
    const w = (o, s) => [...s].forEach((c, i) => data.setUint8(o + i, c.charCodeAt(0)));
    w(0, 'RIFF');
    data.setUint32(4, 36 + n * ch * 2, true);
    w(8, 'WAVE');
    w(12, 'fmt ');
    data.setUint32(16, 16, true);
    data.setUint16(20, 1, true);
    data.setUint16(22, ch, true);
    data.setUint32(24, sr, true);
    data.setUint32(28, sr * ch * 2, true);
    data.setUint16(32, ch * 2, true);
    data.setUint16(34, 16, true);
    w(36, 'data');
    data.setUint32(40, n * ch * 2, true);
    const chans = Array.from({ length: ch }, (_, c) => buf.getChannelData(c));
    let o = 44;
    for (let i = 0; i < n; i++) {
      for (let c = 0; c < ch; c++) {
        const v = Math.max(-1, Math.min(1, chans[c][i]));
        data.setInt16(o, v < 0 ? v * 0x8000 : v * 0x7fff, true);
        o += 2;
      }
    }
    return data.buffer;
  };
})();
