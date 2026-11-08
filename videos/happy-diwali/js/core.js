/* core.js — namespace, constants, timing, easing, RNG and drawing helpers.
 *
 * Everything in this project is a pure function of time `t` (seconds):
 * renderFrame(ctx, t) draws the exact same picture every time it is called
 * with the same t. That is what makes frame-exact video export possible.
 */
(function () {
  'use strict';
  const DL = (window.DL = window.DL || {});

  // Design space. The canvas is scaled to any output size (1080x1920 for export).
  DL.W = 720;
  DL.H = 1280;
  DL.FPS = 30;
  DL.DURATION = 27.5;
  DL.GROUND = 830;

  // Master timeline (seconds). Scene code reads beats from here so the
  // soundtrack (audio.js) and the picture stay in sync.
  DL.T = {
    walkEnd: 1.3,
    ignite: 2.0,
    launch: 3.4,
    rocketGone: 4.4,
    rocketBack: 4.85,
    shock: 5.0,
    runStart: 5.2,
    camStart: 5.3,
    trip: 9.8,
    land: 10.05,
    pullUp: 10.65,
    camStop: 12.6,
    boom: 14.6,
    kidsReturn: 16.9,
    wipe: 21.6,
    wipeEnd: 22.2,
    logoPop: 22.25,
    dotLoop: 22.75,
    follow: 23.2,
    button: 23.7,
    tap: 24.45,
    link: 24.85,
    end: 27.5,
  };

  const clamp = (x, a = 0, b = 1) => (x < a ? a : x > b ? b : x);
  const lerp = (a, b, t) => a + (b - a) * t;
  const prog = (t, a, b) => clamp((t - a) / (b - a));
  const TAU = Math.PI * 2;

  const E = {
    linear: (x) => x,
    inQuad: (x) => x * x,
    outQuad: (x) => 1 - (1 - x) * (1 - x),
    inOutQuad: (x) => (x < 0.5 ? 2 * x * x : 1 - Math.pow(-2 * x + 2, 2) / 2),
    inCubic: (x) => x * x * x,
    outCubic: (x) => 1 - Math.pow(1 - x, 3),
    inOutCubic: (x) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2),
    outQuart: (x) => 1 - Math.pow(1 - x, 4),
    inQuart: (x) => x * x * x * x,
    outBack: (x) => {
      const c1 = 1.70158, c3 = c1 + 1;
      return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2);
    },
    outBackBig: (x) => {
      const c1 = 2.6, c3 = c1 + 1;
      return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2);
    },
    inBack: (x) => {
      const c1 = 1.70158, c3 = c1 + 1;
      return c3 * x * x * x - c1 * x * x;
    },
    outElastic: (x) =>
      x === 0 ? 0 : x === 1 ? 1 : Math.pow(2, -10 * x) * Math.sin(((x * 10 - 0.75) * TAU) / 3) + 1,
    sine: (x) => 0.5 - 0.5 * Math.cos(Math.PI * x),
    step: (x) => (x < 1 ? 0 : 1),
  };

  /** Keyframe interpolation. keys = [[t, value, easeName?], ...] sorted by t.
   *  The ease on key i shapes the segment that ends at key i. Values may be
   *  numbers or arrays of numbers. */
  function kf(t, keys) {
    if (t <= keys[0][0]) return keys[0][1];
    for (let i = 1; i < keys.length; i++) {
      const k1 = keys[i];
      if (t <= k1[0]) {
        const k0 = keys[i - 1];
        const span = k1[0] - k0[0];
        const p = span <= 0 ? 1 : E[k1[2] || 'inOutQuad']((t - k0[0]) / span);
        const a = k0[1], b = k1[1];
        if (Array.isArray(a)) return a.map((v, j) => lerp(v, b[j], p));
        return lerp(a, b, p);
      }
    }
    return keys[keys.length - 1][1];
  }

  /** Deterministic RNG (mulberry32). */
  function rng(seed) {
    let a = seed >>> 0;
    return function () {
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  /** Integer hash -> [-1, 1]. */
  function hash(n) {
    n = (n << 13) ^ n;
    const t = (Math.imul(n, (Math.imul(Math.imul(n, n), 15731) + 789221) | 0) + 1376312589) & 0x7fffffff;
    return 1 - t / 1073741824;
  }
  /** Smooth 1-D value noise in [-1, 1]. */
  function noise1(x, seed = 0) {
    const i = Math.floor(x), f = x - i;
    const u = f * f * (3 - 2 * f);
    return lerp(hash(i + seed * 1013), hash(i + 1 + seed * 1013), u);
  }

  /** Two-bone IK. Returns the joint position. bend = +1 / -1 picks the side. */
  function ik(ax, ay, tx, ty, l1, l2, bend) {
    let dx = tx - ax, dy = ty - ay;
    let d = Math.hypot(dx, dy) || 0.0001;
    const dmax = l1 + l2 - 0.001;
    if (d > dmax) d = dmax;
    const dmin = Math.abs(l1 - l2) + 0.001;
    if (d < dmin) d = dmin;
    const a = Math.acos(clamp((l1 * l1 + d * d - l2 * l2) / (2 * l1 * d), -1, 1));
    const base = Math.atan2(dy, dx);
    const ang = base + bend * a;
    return [ax + Math.cos(ang) * l1, ay + Math.sin(ang) * l1];
  }

  // ---------- drawing helpers ----------
  const OUTLINE = '#3A2418';

  function poly(ctx, pts) {
    ctx.beginPath();
    ctx.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
  }
  /** Thick rounded stroke with an outline: the "limb" look. */
  function limb(ctx, pts, w, fill, lw = 2.4, ol = OUTLINE) {
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    poly(ctx, pts);
    ctx.strokeStyle = ol;
    ctx.lineWidth = w + lw * 2;
    ctx.stroke();
    poly(ctx, pts);
    ctx.strokeStyle = fill;
    ctx.lineWidth = w;
    ctx.stroke();
  }
  function fillStroke(ctx, fill, lw = 2.4, ol = OUTLINE) {
    if (fill) {
      ctx.fillStyle = fill;
      ctx.fill();
    }
    if (lw > 0) {
      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';
      ctx.strokeStyle = ol;
      ctx.lineWidth = lw;
      ctx.stroke();
    }
  }
  function ellipse(ctx, x, y, rx, ry, rot = 0) {
    ctx.beginPath();
    ctx.ellipse(x, y, Math.max(0.01, rx), Math.max(0.01, ry), rot, 0, TAU);
  }
  function circle(ctx, x, y, r) {
    ctx.beginPath();
    ctx.arc(x, y, Math.max(0.01, r), 0, TAU);
  }
  /** 4-point sparkle star. */
  function star4(ctx, x, y, r, rot = 0, k = 0.14) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(rot);
    ctx.beginPath();
    ctx.moveTo(r, 0);
    for (let i = 1; i <= 4; i++) {
      const a = (i * Math.PI) / 2;
      const m = a - Math.PI / 4;
      ctx.quadraticCurveTo(Math.cos(m) * r * k, Math.sin(m) * r * k, Math.cos(a) * r, Math.sin(a) * r);
    }
    ctx.closePath();
    ctx.restore();
  }
  /** Rounded rectangle path. */
  function rrect(ctx, x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  Object.assign(DL, {
    clamp, lerp, prog, TAU, E, kf, rng, hash, noise1, ik,
    OUTLINE, poly, limb, fillStroke, ellipse, circle, star4, rrect,
  });
})();
