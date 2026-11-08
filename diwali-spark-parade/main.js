/*!
 * Diwali Spark Parade — an original festive 2D cartoon in HTML Canvas + Web Audio.
 *
 * main.js
 *   1. constants, palette & config        6. pose library + simple IK
 *   2. math / easing / seeded RNG         7. effects & particles (deterministic)
 *   3. 2D matrices                        8. greeting title
 *   4. SVG → rig loader                   9. shots, timeline, transitions, renderFrame(t)
 *   5. rig renderer (+ bend deformer)    10. original soundtrack (Web Audio, offline-rendered)
 *                                         11. player, UI, recorder, boot
 *
 * Every frame is a pure function of timeline time t (0 ≤ t < 21.92 s): nothing depends on
 * frame counts or accumulated state, so preview, scrubbing and export always agree.
 */
(function () {
  'use strict';

  // ════════════════════════════════════════════════════════════════════════════
  // 1. CONSTANTS, PALETTE, CONFIG
  // ════════════════════════════════════════════════════════════════════════════
  const W = 720, H = 1280, FPS = 30;
  const SPEC_DURATION = 21.92;
  const GROUND = 856;
  const BEATS = 52;                              // 13 bars of 4/4 fit the loop exactly
  const SPB = SPEC_DURATION / BEATS;             // seconds per beat ≈ 0.4215 s (≈142.3 BPM)
  const TITLE_CENTER = { x: 362, y: 650 };

  const DEFAULT_PALETTE = Object.freeze({
    backgroundCream: '#FFF7EA',
    cornerTurquoise: '#4F9C96',
    cornerCoral: '#E58D73',
    outlinePlumBrown: '#624239',
    titleDeepPlum: '#4D2F50',
    titleVermilion: '#E75A42',
    titleShadow: '#4D2F50',
    titleOutline: '#FFF1CB',
    goldAccent: '#F2BB4B',
    softPeach: '#F6C2A5',
    turquoise: '#42A8A2',
    indigo: '#6269A0',
    girlDressPink: '#EC789A',
    boyKurtaMustard: '#F0B84F',
    elephantBlueGray: '#79B9C2',
    elephantEarPeach: '#F2B3AE',
    diyaClay: '#C87658',
    diyaFlame: '#FFCD57',
    sageGround: '#B8B49B',
    sparkleIvory: '#FFF6CB',
    footerInk: '#A88781',
  });

  // Palette tokens that are also used inside the SVG rigs: exact hex matches are re-tinted live.
  const RIG_TOKENS = ['outlinePlumBrown', 'goldAccent', 'turquoise', 'indigo', 'girlDressPink', 'boyKurtaMustard',
    'elephantBlueGray', 'elephantEarPeach', 'diyaClay', 'diyaFlame', 'sparkleIvory', 'cornerCoral'];
  const TOKEN_BY_HEX = {};
  RIG_TOKENS.forEach((k) => { TOKEN_BY_HEX[DEFAULT_PALETTE[k].toLowerCase()] = k; });

  const PRESETS = {
    original: { label: 'Cream & teal (original)', colors: {} },
    marigold: {
      label: 'Marigold morning',
      colors: { backgroundCream: '#FFF0CC', cornerTurquoise: '#3E8E89', cornerCoral: '#E0725A', titleDeepPlum: '#5B2A4E',
        titleVermilion: '#D8473A', titleShadow: '#5B2A4E', sageGround: '#C8B98F', footerInk: '#9E7E6E' },
    },
    lantern: {
      label: 'Lantern night',
      colors: { backgroundCream: '#2D2443', cornerTurquoise: '#5CC0B7', cornerCoral: '#F29A7E', titleDeepPlum: '#FFE7C2',
        titleVermilion: '#FF7D57', titleShadow: '#120C1C', sageGround: '#5D5479', footerInk: '#B9A4C9' },
    },
  };

  const reducedByOS = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  const config = {
    line1: 'HAPPY',
    line2: 'DIWALI',
    brand: 'Your Studio',
    brandSub: 'Festive Motion',
    showFooter: true,
    duration: SPEC_DURATION,     // real seconds per loop (timeline is time-scaled to fit)
    speed: 1,                    // preview playback rate
    volume: 0.8,
    muted: false,
    sfx: true,
    reducedMotion: reducedByOS,
    grain: true,
    preset: 'original',
    palette: Object.assign({}, DEFAULT_PALETTE),
  };

  // ════════════════════════════════════════════════════════════════════════════
  // 2. MATH, EASING, SEEDED RANDOMNESS, COLOUR
  // ════════════════════════════════════════════════════════════════════════════
  const DEG = Math.PI / 180, TAU = Math.PI * 2;
  const clamp = (x, a = 0, b = 1) => (x < a ? a : x > b ? b : x);
  const lerp = (a, b, t) => a + (b - a) * t;
  const seg = (x, a, b) => clamp((x - a) / (b - a));
  const wave = (t, period, phase = 0) => Math.sin((t / period) * TAU + phase);
  const E = {
    inQuad: (t) => t * t,
    outQuad: (t) => t * (2 - t),
    inOutQuad: (t) => (t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t),
    inCubic: (t) => t * t * t,
    outCubic: (t) => 1 - Math.pow(1 - t, 3),
    inOutCubic: (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),
    outBack: (t, s = 1.70158) => 1 + (s + 1) * Math.pow(t - 1, 3) + s * Math.pow(t - 1, 2),
    inOutSine: (t) => -(Math.cos(Math.PI * t) - 1) / 2,
    outSine: (t) => Math.sin((t * Math.PI) / 2),
    outElastic: (t) => (t <= 0 ? 0 : t >= 1 ? 1 : Math.pow(2, -10 * t) * Math.sin((t * 10 - 0.75) * ((2 * Math.PI) / 3)) + 1),
    smooth: (t) => t * t * (3 - 2 * t),
  };

  /** CSS-style cubic-bezier easing (x→y) solved with Newton + bisection. */
  function cubicBezier(p1x, p1y, p2x, p2y) {
    const cx = 3 * p1x, bx = 3 * (p2x - p1x) - cx, ax = 1 - cx - bx;
    const cy = 3 * p1y, by = 3 * (p2y - p1y) - cy, ay = 1 - cy - by;
    const sx = (t) => ((ax * t + bx) * t + cx) * t;
    const sy = (t) => ((ay * t + by) * t + cy) * t;
    const dsx = (t) => (3 * ax * t + 2 * bx) * t + cx;
    return function (x) {
      if (x <= 0) return 0;
      if (x >= 1) return 1;
      let t = x;
      for (let i = 0; i < 8; i++) {
        const e = sx(t) - x;
        if (Math.abs(e) < 1e-6) return sy(t);
        const d = dsx(t);
        if (Math.abs(d) < 1e-6) break;
        t -= e / d;
      }
      let lo = 0, hi = 1;
      t = x;
      for (let i = 0; i < 32; i++) {
        const v = sx(t);
        if (Math.abs(v - x) < 1e-6) break;
        if (v < x) lo = t; else hi = t;
        t = (lo + hi) / 2;
      }
      return sy(t);
    };
  }
  const titleIn = cubicBezier(0.2, 1.55, 0.45, 1);   // spec: titleIn easing

  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function hash(str) {
    let h = 2166136261 >>> 0;
    for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
    return h >>> 0;
  }
  /** Deterministic generator for (key, index): same inputs → same particle, every frame, every run. */
  const rng = (key, i = 0) => mulberry32((hash(key) ^ Math.imul(i + 1, 0x9e3779b1)) >>> 0);

  function hexToRgb(hex) {
    let h = String(hex).replace('#', '');
    if (h.length === 3) h = h.split('').map((c) => c + c).join('');
    const n = parseInt(h.slice(0, 6), 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  const rgba = (hex, a) => { const c = hexToRgb(hex); return `rgba(${c[0]},${c[1]},${c[2]},${a})`; };
  function mixHex(a, b, t) {
    const A = hexToRgb(a), B = hexToRgb(b);
    return '#' + A.map((v, i) => Math.round(lerp(v, B[i], t)).toString(16).padStart(2, '0')).join('');
  }
  const P = () => config.palette;
  const colorOf = (hex) => { const k = TOKEN_BY_HEX[hex]; return k ? config.palette[k] : hex; };
  const MOTION = () => (config.reducedMotion ? 0.45 : 1);

  // ════════════════════════════════════════════════════════════════════════════
  // 3. 2D AFFINE MATRICES  [a b c d e f]  (x' = a·x + c·y + e,  y' = b·x + d·y + f)
  // ════════════════════════════════════════════════════════════════════════════
  const Mx = {
    id: () => [1, 0, 0, 1, 0, 0],
    mul: (m, n) => [
      m[0] * n[0] + m[2] * n[1], m[1] * n[0] + m[3] * n[1],
      m[0] * n[2] + m[2] * n[3], m[1] * n[2] + m[3] * n[3],
      m[0] * n[4] + m[2] * n[5] + m[4], m[1] * n[4] + m[3] * n[5] + m[5],
    ],
    tr: (x, y) => [1, 0, 0, 1, x, y],
    rot: (r) => { const c = Math.cos(r), s = Math.sin(r); return [c, s, -s, c, 0, 0]; },
    sc: (x, y = x) => [x, 0, 0, y, 0, 0],
    apply: (m, x, y) => [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]],
    inv: (m) => {
      const det = m[0] * m[3] - m[1] * m[2];
      const a = m[3] / det, b = -m[1] / det, c = -m[2] / det, d = m[0] / det;
      return [a, b, c, d, -(a * m[4] + c * m[5]), -(b * m[4] + d * m[5])];
    },
  };

  // ════════════════════════════════════════════════════════════════════════════
  // 4. SVG → RIG LOADER
  //    Reads the hand-authored SVG files in /assets and turns every data-part group into an
  //    animatable node: baked geometry (all transforms applied), pivot, optional bend axis,
  //    switchable states and invisible anchors. Colours stay linked to palette tokens.
  // ════════════════════════════════════════════════════════════════════════════
  function parsePathData(d) {
    const toks = d.match(/[MmLlHhVvCcSsQqTtAaZz]|[-+]?(?:\d*\.\d+|\d+\.?)(?:[eE][-+]?\d+)?/g) || [];
    const out = [];
    let i = 0, cmd = '', x = 0, y = 0, sx = 0, sy = 0, lcx = 0, lcy = 0, lqx = 0, lqy = 0;
    const num = () => parseFloat(toks[i++]);
    const isCmd = (s) => /[A-Za-z]/.test(s);
    while (i < toks.length) {
      if (isCmd(toks[i])) cmd = toks[i++];
      else if (!cmd) { i++; continue; }
      const rel = cmd === cmd.toLowerCase();
      const C = cmd.toUpperCase();
      if (C !== 'Z' && i >= toks.length) break;
      switch (C) {
        case 'M': {
          let nx = num(), ny = num();
          if (rel) { nx += x; ny += y; }
          x = sx = nx; y = sy = ny; out.push(['M', x, y]);
          cmd = rel ? 'l' : 'L';
          break;
        }
        case 'L': { let nx = num(), ny = num(); if (rel) { nx += x; ny += y; } x = nx; y = ny; out.push(['L', x, y]); break; }
        case 'H': { let nx = num(); if (rel) nx += x; x = nx; out.push(['L', x, y]); break; }
        case 'V': { let ny = num(); if (rel) ny += y; y = ny; out.push(['L', x, y]); break; }
        case 'C': {
          let a = num(), b = num(), c = num(), e = num(), f = num(), g = num();
          if (rel) { a += x; b += y; c += x; e += y; f += x; g += y; }
          out.push(['C', a, b, c, e, f, g]); lcx = c; lcy = e; x = f; y = g;
          break;
        }
        case 'S': {
          let c = num(), e = num(), f = num(), g = num();
          if (rel) { c += x; e += y; f += x; g += y; }
          const prev = out[out.length - 1];
          const a = prev && prev[0] === 'C' ? 2 * x - lcx : x, b = prev && prev[0] === 'C' ? 2 * y - lcy : y;
          out.push(['C', a, b, c, e, f, g]); lcx = c; lcy = e; x = f; y = g;
          break;
        }
        case 'Q': {
          let a = num(), b = num(), f = num(), g = num();
          if (rel) { a += x; b += y; f += x; g += y; }
          out.push(['Q', a, b, f, g]); lqx = a; lqy = b; x = f; y = g;
          break;
        }
        case 'T': {
          let f = num(), g = num();
          if (rel) { f += x; g += y; }
          const prev = out[out.length - 1];
          const a = prev && prev[0] === 'Q' ? 2 * x - lqx : x, b = prev && prev[0] === 'Q' ? 2 * y - lqy : y;
          out.push(['Q', a, b, f, g]); lqx = a; lqy = b; x = f; y = g;
          break;
        }
        case 'A': {
          const rx = num(), ry = num(), ang = num(), fa = num(), fs = num();
          let f = num(), g = num();
          if (rel) { f += x; g += y; }
          for (const c of arcToCubics(x, y, rx, ry, ang, fa, fs, f, g)) out.push(['C', c[0], c[1], c[2], c[3], c[4], c[5]]);
          x = f; y = g;
          break;
        }
        case 'Z': out.push(['Z']); x = sx; y = sy; break;
        default: i++;
      }
    }
    return out;
  }

  /** SVG elliptical arc → cubic Béziers (SVG spec, appendix F.6). */
  function arcToCubics(x1, y1, rx, ry, angle, fa, fs, x2, y2) {
    if (!rx || !ry) return [[x1, y1, x2, y2, x2, y2]];
    const phi = angle * DEG, cp = Math.cos(phi), sp = Math.sin(phi);
    const dx = (x1 - x2) / 2, dy = (y1 - y2) / 2;
    const x1p = cp * dx + sp * dy, y1p = -sp * dx + cp * dy;
    rx = Math.abs(rx); ry = Math.abs(ry);
    const lam = (x1p * x1p) / (rx * rx) + (y1p * y1p) / (ry * ry);
    if (lam > 1) { const s = Math.sqrt(lam); rx *= s; ry *= s; }
    const sign = fa === fs ? -1 : 1;
    const nume = rx * rx * ry * ry - rx * rx * y1p * y1p - ry * ry * x1p * x1p;
    const deno = rx * rx * y1p * y1p + ry * ry * x1p * x1p;
    const co = sign * Math.sqrt(Math.max(0, nume / deno));
    const cxp = (co * rx * y1p) / ry, cyp = (-co * ry * x1p) / rx;
    const cx = cp * cxp - sp * cyp + (x1 + x2) / 2, cy = sp * cxp + cp * cyp + (y1 + y2) / 2;
    const ang = (ux, uy, vx, vy) => Math.atan2(ux * vy - uy * vx, ux * vx + uy * vy);
    const th1 = ang(1, 0, (x1p - cxp) / rx, (y1p - cyp) / ry);
    let dth = ang((x1p - cxp) / rx, (y1p - cyp) / ry, (-x1p - cxp) / rx, (-y1p - cyp) / ry);
    if (!fs && dth > 0) dth -= TAU; else if (fs && dth < 0) dth += TAU;
    const n = Math.max(1, Math.ceil(Math.abs(dth) / (Math.PI / 2)));
    const d = dth / n, k = (4 / 3) * Math.tan(d / 4);
    const pt = (px, py) => [cx + rx * px * cp - ry * py * sp, cy + rx * px * sp + ry * py * cp];
    const res = [];
    for (let i = 0; i < n; i++) {
      const a1 = th1 + i * d, a2 = a1 + d;
      const c1 = Math.cos(a1), s1 = Math.sin(a1), c2 = Math.cos(a2), s2 = Math.sin(a2);
      const A = pt(c1 - k * s1, s1 + k * c1), B = pt(c2 + k * s2, s2 - k * c2), Z = pt(c2, s2);
      res.push([A[0], A[1], B[0], B[1], Z[0], Z[1]]);
    }
    return res;
  }

  const KAPPA = 0.5522847498;
  function ellipseSegs(cx, cy, rx, ry) {
    const kx = rx * KAPPA, ky = ry * KAPPA;
    return [
      ['M', cx + rx, cy],
      ['C', cx + rx, cy + ky, cx + kx, cy + ry, cx, cy + ry],
      ['C', cx - kx, cy + ry, cx - rx, cy + ky, cx - rx, cy],
      ['C', cx - rx, cy - ky, cx - kx, cy - ry, cx, cy - ry],
      ['C', cx + kx, cy - ry, cx + rx, cy - ky, cx + rx, cy],
      ['Z'],
    ];
  }
  function shapeSegs(el) {
    const n = (a, d = 0) => { const v = el.getAttribute(a); return v == null ? d : parseFloat(v); };
    switch (el.localName) {
      case 'path': return parsePathData(el.getAttribute('d') || '');
      case 'circle': return ellipseSegs(n('cx'), n('cy'), n('r'), n('r'));
      case 'ellipse': return ellipseSegs(n('cx'), n('cy'), n('rx'), n('ry'));
      case 'line': return [['M', n('x1'), n('y1')], ['L', n('x2'), n('y2')]];
      case 'rect': {
        const x = n('x'), y = n('y'), w = n('width'), h = n('height');
        let rx = Math.min(n('rx', n('ry', 0)), w / 2), ry = Math.min(n('ry', rx), h / 2);
        if (!rx || !ry) return [['M', x, y], ['L', x + w, y], ['L', x + w, y + h], ['L', x, y + h], ['Z']];
        const kx = rx * (1 - KAPPA), ky = ry * (1 - KAPPA);
        return [['M', x + rx, y], ['L', x + w - rx, y], ['C', x + w - kx, y, x + w, y + ky, x + w, y + ry],
          ['L', x + w, y + h - ry], ['C', x + w, y + h - ky, x + w - kx, y + h, x + w - rx, y + h],
          ['L', x + rx, y + h], ['C', x + kx, y + h, x, y + h - ky, x, y + h - ry],
          ['L', x, y + ry], ['C', x, y + ky, x + kx, y, x + rx, y], ['Z']];
      }
      case 'polyline':
      case 'polygon': {
        const v = (el.getAttribute('points') || '').trim().split(/[\s,]+/).map(parseFloat);
        const s = [];
        for (let i = 0; i + 1 < v.length; i += 2) s.push([i ? 'L' : 'M', v[i], v[i + 1]]);
        if (el.localName === 'polygon') s.push(['Z']);
        return s;
      }
      default: return null;
    }
  }
  function transformSegs(segs, m) {
    for (const s of segs) {
      for (let i = 1; i + 1 < s.length; i += 2) {
        const x = s[i], y = s[i + 1];
        s[i] = m[0] * x + m[2] * y + m[4];
        s[i + 1] = m[1] * x + m[3] * y + m[5];
      }
    }
  }
  function parseTransform(str) {
    let m = Mx.id();
    const re = /(matrix|translate|scale|rotate|skewX|skewY)\s*\(([^)]*)\)/g;
    let r;
    while ((r = re.exec(str))) {
      const a = r[2].trim().split(/[\s,]+/).map(parseFloat);
      let t;
      switch (r[1]) {
        case 'matrix': t = a.slice(0, 6); break;
        case 'translate': t = Mx.tr(a[0], a[1] || 0); break;
        case 'scale': t = Mx.sc(a[0], a.length > 1 ? a[1] : a[0]); break;
        case 'rotate':
          t = Mx.rot(a[0] * DEG);
          if (a.length > 2) t = Mx.mul(Mx.mul(Mx.tr(a[1], a[2]), t), Mx.tr(-a[1], -a[2]));
          break;
        case 'skewX': t = [1, 0, Math.tan(a[0] * DEG), 1, 0, 0]; break;
        default: t = [1, Math.tan(a[0] * DEG), 0, 1, 0, 0];
      }
      m = Mx.mul(m, t);
    }
    return m;
  }

  const PAINT0 = { fill: '#000000', stroke: 'none', sw: 1, alpha: 1, fo: 1, so: 1, cap: 'butt', join: 'miter' };
  function normColor(v) {
    if (v == null) return null;
    v = String(v).trim().toLowerCase();
    if (v === 'none' || v === 'transparent') return 'none';
    if (v[0] === '#') return v.length === 4 ? '#' + v[1] + v[1] + v[2] + v[2] + v[3] + v[3] : v.slice(0, 7);
    if (v === 'white') return '#ffffff';
    if (v === 'black') return '#000000';
    const m = v.match(/rgba?\(([^)]+)\)/);
    if (m) return '#' + m[1].split(',').slice(0, 3).map((x) => Math.round(parseFloat(x)).toString(16).padStart(2, '0')).join('');
    return v;
  }
  function readPaint(el, parent) {
    const p = Object.assign({}, parent);
    const style = {};
    (el.getAttribute('style') || '').split(';').forEach((kv) => {
      const i = kv.indexOf(':');
      if (i > 0) style[kv.slice(0, i).trim()] = kv.slice(i + 1).trim();
    });
    const get = (k) => (style[k] != null ? style[k] : el.getAttribute(k));
    const f = get('fill'); if (f != null) p.fill = normColor(f);
    const s = get('stroke'); if (s != null) p.stroke = normColor(s);
    const sw = get('stroke-width'); if (sw != null) p.sw = parseFloat(sw);
    const fo = get('fill-opacity'); if (fo != null) p.fo = parseFloat(fo);
    const so = get('stroke-opacity'); if (so != null) p.so = parseFloat(so);
    const lc = get('stroke-linecap'); if (lc != null) p.cap = lc;
    const lj = get('stroke-linejoin'); if (lj != null) p.join = lj;
    const op = get('opacity'); if (op != null) p.alpha = parent.alpha * parseFloat(op);
    return p;
  }
  const SKIP_TAGS = new Set(['title', 'desc', 'defs', 'metadata', 'style', 'script', 'text']);
  const numList = (s) => (s || '').trim().split(/[\s,]+/).filter(Boolean).map(parseFloat);

  function makePart(el, m, name) {
    const part = { name, pivot: [0, 0], bend: null, attachTip: false, switchName: null, states: null,
      defaultState: null, items: [], anchors: [] };
    if (!el) return part;
    const pv = numList(el.getAttribute('data-pivot'));
    part.pivot = pv.length >= 2 ? Mx.apply(m, pv[0], pv[1]) : Mx.apply(m, 0, 0);
    const bd = numList(el.getAttribute('data-bend'));
    if (bd.length >= 4) {
      const a = Mx.apply(m, bd[0], bd[1]), b = Mx.apply(m, bd[2], bd[3]);
      const L = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
      const ux = (b[0] - a[0]) / L, uy = (b[1] - a[1]) / L;
      part.bend = { ax: a[0], ay: a[1], bx: b[0], by: b[1], L, ux, uy, nx: -uy, ny: ux };
    }
    part.attachTip = el.getAttribute('data-attach') === 'tip';
    return part;
  }
  function walkKids(el, part, m, paint) {
    for (const c of Array.from(el.children)) walkNode(c, part, m, paint);
  }
  function walkNode(el, part, m, paintIn) {
    const tag = el.localName;
    if (SKIP_TAGS.has(tag)) return;
    const tf = el.getAttribute('transform');
    const mm = tf ? Mx.mul(m, parseTransform(tf)) : m;
    if (el.hasAttribute('data-anchor')) {
      const p = Mx.apply(mm, parseFloat(el.getAttribute('cx')) || 0, parseFloat(el.getAttribute('cy')) || 0);
      part.anchors.push({ name: el.getAttribute('data-anchor'), x: p[0], y: p[1] });
      return;
    }
    const paint = readPaint(el, paintIn);
    const hidden = el.getAttribute('display') === 'none' || /display\s*:\s*none/.test(el.getAttribute('style') || '');
    if (tag === 'g' || tag === 'svg' || tag === 'a') {
      if (el.hasAttribute('data-part')) {
        const child = makePart(el, mm, el.getAttribute('data-part'));
        part.items.push({ part: child });
        if (el.hasAttribute('data-switch')) {
          child.switchName = el.getAttribute('data-switch');
          child.states = {};
          for (const s of Array.from(el.children)) {
            if (!s.hasAttribute('data-state')) continue;
            const key = s.getAttribute('data-state');
            const holder = { items: [], anchors: child.anchors };
            const stf = s.getAttribute('transform');
            walkKids(s, holder, stf ? Mx.mul(mm, parseTransform(stf)) : mm, readPaint(s, paint));
            child.states[key] = holder.items;
            if (!child.defaultState) child.defaultState = key;
          }
        } else {
          walkKids(el, child, mm, paint);
        }
        return;
      }
      if (hidden) return;
      walkKids(el, part, mm, paint);
      return;
    }
    if (hidden) return;
    const segs = shapeSegs(el);
    if (!segs || !segs.length) return;
    transformSegs(segs, mm);
    const k = Math.sqrt(Math.abs(mm[0] * mm[3] - mm[1] * mm[2]));
    part.items.push({ shape: { segs, fill: paint.fill, stroke: paint.stroke, sw: paint.sw * k, alpha: paint.alpha,
      fo: paint.fo, so: paint.so, cap: paint.cap, join: paint.join, path: null } });
  }

  /** Parse one SVG document; returns { rigName: rig } for every <g data-rig>. */
  function loadRigs(svgText, label) {
    const doc = new DOMParser().parseFromString(svgText, 'image/svg+xml');
    if (doc.getElementsByTagName('parsererror').length) throw new Error('SVG parse error in ' + label);
    const rigs = {};
    for (const g of Array.from(doc.querySelectorAll('[data-rig]'))) {
      const root = makePart(null, Mx.id(), null);
      walkKids(g, root, Mx.id(), readPaint(g, PAINT0));      // the rig group's own transform is for viewing only
      const rig = { name: g.getAttribute('data-rig'), root, parts: {}, anchors: {} };
      (function index(part) {
        if (part.name) rig.parts[part.name] = part;
        part.anchors.forEach((a) => { rig.anchors[a.name] = [a.x, a.y]; });
        const lists = part.states ? Object.values(part.states).concat([part.items]) : [part.items];
        lists.forEach((list) => list.forEach((it) => it.part && index(it.part)));
      })(root);
      rigs[rig.name] = rig;
    }
    return rigs;
  }

  // ════════════════════════════════════════════════════════════════════════════
  // 5. RIG RENDERER
  //    pose = { x, y, s, flip, rot, sx, sy, alpha, gy, parts: { name: {rot,x,y,sx,sy,bend,alpha,hide} },
  //             sw: { switchName: state }, z: { partName: drawOrder } }
  //    Parts rotate/scale about their pivots; parts with a bend axis curl like rubber hose.
  // ════════════════════════════════════════════════════════════════════════════
  const view = { ctx: null, base: [1, 0, 0, 1, 0, 0], k: 1 };
  function setView(ctx, k) {
    view.ctx = ctx; view.k = k; view.base = [k, 0, 0, k, 0, 0];
    ctx.setTransform(k, 0, 0, k, 0, 0);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
  }
  const resetTf = () => { view.ctx.setTransform(view.k, 0, 0, view.k, 0, 0); view.ctx.globalAlpha = 1; };

  function rootMatrix(pose) {
    const s = pose.s == null ? 1 : pose.s;
    let m = Mx.tr(pose.x || 0, pose.y || 0);
    if (pose.rot) m = Mx.mul(m, Mx.rot(pose.rot * DEG));
    return Mx.mul(m, Mx.sc(s * (pose.flip || 1) * (pose.sx == null ? 1 : pose.sx), s * (pose.sy == null ? 1 : pose.sy)));
  }
  function partLocal(part, pp) {
    const r = (pp.rot || 0) * DEG, c = Math.cos(r), s = Math.sin(r);
    const sx = pp.sx == null ? 1 : pp.sx, sy = pp.sy == null ? 1 : pp.sy;
    const a = c * sx, b = s * sx, cc = -s * sy, d = c * sy;
    const px = part.pivot[0], py = part.pivot[1];
    return [a, b, cc, d, px + (pp.x || 0) - (a * px + cc * py), py + (pp.y || 0) - (b * px + d * py)];
  }

  /** Bend deformer: maps a rest-pose point onto a circular arc of total angle `ang` along the axis. */
  function bendPoint(b, ang, x, y) {
    const dx = x - b.ax, dy = y - b.ay;
    const s = dx * b.ux + dy * b.uy;
    if (s <= 0 || !ang) return [x, y];
    const d = dx * b.nx + dy * b.ny;
    const k = ang / b.L;
    const sc = s < b.L ? s : b.L;
    const phi = k * sc, cph = Math.cos(phi), sph = Math.sin(phi);
    const A = sph / k, B = (1 - cph) / k;
    const cx = b.ax + b.ux * A + b.nx * B, cy = b.ay + b.uy * A + b.ny * B;
    const upx = b.ux * cph + b.nx * sph, upy = b.uy * cph + b.ny * sph;
    const npx = -b.ux * sph + b.nx * cph, npy = -b.uy * sph + b.ny * cph;
    const ex = s - sc;
    return [cx + npx * d + upx * ex, cy + npy * d + upy * ex];
  }
  /** Rigid transform that carries children attached to a bent part's tip. */
  function tipMatrix(b, ang) {
    const c = bendPoint(b, ang, b.bx, b.by);
    const co = Math.cos(ang), si = Math.sin(ang);
    return [co, si, -si, co, c[0] - (co * b.bx - si * b.by), c[1] - (si * b.bx + co * b.by)];
  }
  function buildPath(segs, bend, ang) {
    const p = new Path2D();
    const f = bend ? (x, y) => bendPoint(bend, ang, x, y) : null;
    for (const s of segs) {
      const c = s[0];
      if (c === 'Z') { p.closePath(); continue; }
      if (!f) {
        if (c === 'M') p.moveTo(s[1], s[2]);
        else if (c === 'L') p.lineTo(s[1], s[2]);
        else if (c === 'C') p.bezierCurveTo(s[1], s[2], s[3], s[4], s[5], s[6]);
        else if (c === 'Q') p.quadraticCurveTo(s[1], s[2], s[3], s[4]);
        continue;
      }
      if (c === 'M') { const a = f(s[1], s[2]); p.moveTo(a[0], a[1]); }
      else if (c === 'L') { const a = f(s[1], s[2]); p.lineTo(a[0], a[1]); }
      else if (c === 'C') { const a = f(s[1], s[2]), b = f(s[3], s[4]), e = f(s[5], s[6]); p.bezierCurveTo(a[0], a[1], b[0], b[1], e[0], e[1]); }
      else if (c === 'Q') { const a = f(s[1], s[2]), e = f(s[3], s[4]); p.quadraticCurveTo(a[0], a[1], e[0], e[1]); }
    }
    return p;
  }
  function drawShape(ctx, sh, D, bend, ang, alpha) {
    ctx.setTransform(D[0], D[1], D[2], D[3], D[4], D[5]);
    const path = bend ? buildPath(sh.segs, bend, ang) : sh.path || (sh.path = buildPath(sh.segs));
    const ga = alpha * sh.alpha;
    if (sh.fill !== 'none') {
      ctx.globalAlpha = ga * sh.fo;
      ctx.fillStyle = colorOf(sh.fill);
      ctx.fill(path);
    }
    if (sh.stroke !== 'none' && sh.sw > 0) {
      ctx.globalAlpha = ga * sh.so;
      ctx.strokeStyle = colorOf(sh.stroke);
      ctx.lineWidth = sh.sw;
      ctx.lineCap = sh.cap;
      ctx.lineJoin = sh.join;
      ctx.stroke(path);
    }
  }
  function zSort(items, z) {
    let any = false;
    for (const it of items) if (it.part && it.part.name && z[it.part.name] != null) { any = true; break; }
    if (!any) return items;
    return items
      .map((it, i) => ({ it, i, z: it.part && it.part.name && z[it.part.name] != null ? z[it.part.name] : 0 }))
      .sort((A, B) => A.z - B.z || A.i - B.i)
      .map((o) => o.it);
  }
  function renderPart(ctx, part, Wp, pose, alpha, st) {
    const pp = part.name ? pose.parts[part.name] : null;
    if (pp && pp.hide) return;
    const W = pp ? Mx.mul(Wp, partLocal(part, pp)) : Wp;
    const a = pp && pp.alpha != null ? alpha * pp.alpha : alpha;
    const ang = part.bend && pp && pp.bend ? pp.bend * DEG : 0;
    const drawing = st.draw && (!st.only || st.inside || part.name === st.only);
    const enteredOnly = st.only && !st.inside && part.name === st.only;
    if (enteredOnly) st.inside = true;
    let items = part.items;
    if (part.states) items = part.states[(pose.sw && pose.sw[part.switchName]) || part.defaultState] || part.states[part.defaultState];
    if (pose.z) items = zSort(items, pose.z);
    let D = null;
    for (const it of items) {
      if (it.shape) {
        if (drawing && a > 0.002) {
          if (!D) D = Mx.mul(view.base, W);
          drawShape(ctx, it.shape, D, ang ? part.bend : null, ang, a);
        }
      } else {
        const ch = it.part;
        renderPart(ctx, ch, ch.attachTip && ang ? Mx.mul(W, tipMatrix(part.bend, ang)) : W, pose, a, st);
      }
    }
    if (st.anchors) {
      for (const an of part.anchors) {
        const q = ang ? bendPoint(part.bend, ang, an.x, an.y) : [an.x, an.y];
        const w = Mx.apply(W, q[0], q[1]);
        st.anchors[an.name] = { x: w[0], y: w[1], m: W };
      }
    }
    if (enteredOnly) st.inside = false;
  }
  /** Draw a rig. opt.anchors = {} collects world positions of anchors; opt.only draws one subtree;
   *  opt.noDraw only evaluates anchors. Returns the anchors object (if any). */
  function drawRig(rig, pose, opt) {
    const ctx = view.ctx;
    const st = { draw: !(opt && opt.noDraw), only: (opt && opt.only) || null, inside: false, anchors: (opt && opt.anchors) || null };
    const W0 = opt && opt.parent ? Mx.mul(opt.parent, rootMatrix(pose)) : rootMatrix(pose);
    renderPart(ctx, rig.root, W0, pose, pose.alpha == null ? 1 : pose.alpha, st);
    resetTf();
    return st.anchors;
  }
  function rigAnchors(rig, pose) { return drawRig(rig, pose, { noDraw: true, anchors: {} }); }

  // ════════════════════════════════════════════════════════════════════════════
  // 6. POSE LIBRARY + IK
  // ════════════════════════════════════════════════════════════════════════════
  let RIGS = null;   // { boy, girl, elephant, diya, sparkler, chakri } — filled at boot

  function newPose(x, y, s = 1, flip = 1) {
    return { x, y, gy: y, s, flip, rot: 0, sx: 1, sy: 1, alpha: 1, parts: {}, sw: {}, z: null };
  }
  const pp = (p, n) => p.parts[n] || (p.parts[n] = {});
  const add = (p, n, k, v) => { const o = pp(p, n); o[k] = (o[k] || 0) + v; };
  const mul = (p, n, k, v) => { const o = pp(p, n); o[k] = (o[k] == null ? 1 : o[k]) * v; };
  const set = (p, n, o) => Object.assign(pp(p, n), o);
  const face = (p, eyes, mouth) => { if (eyes) p.sw.eyes = eyes; if (mouth) p.sw.mouth = mouth; };
  const toFront = (p, ...names) => { p.z = p.z || {}; names.forEach((n) => { p.z[n] = 5; }); };

  function blinkScale(t, seed) {
    const period = 2.4 + ((seed * 0.37) % 1) * 1.5;
    const ph = (((t + seed * 1.13) % period) + period) % period;
    const dur = 0.13;
    return ph < dur ? 1 - 0.88 * Math.sin((Math.PI * ph) / dur) : 1;
  }
  /** Breathing, idle drift, blinking and secondary motion (braid, bow, hair, skirt). */
  function kidLife(p, t, seed) {
    const m = MOTION();
    const b = Math.sin((t * TAU) / 1.6 + seed);
    mul(p, 'torso', 'sy', 1 + 0.014 * b * m);
    add(p, 'head', 'rot', 1.8 * Math.sin((t * TAU) / 2.2 + seed * 1.7) * m);
    set(p, 'armL', { rot: 7 + 2.5 * b * m, bend: 6 });
    set(p, 'armR', { rot: -7 - 2.5 * b * m, bend: -6 });
    add(p, 'braid', 'bend', 5 * Math.sin((t * TAU) / 1.8 + seed) * m);
    add(p, 'braid', 'rot', 2 * Math.sin((t * TAU) / 1.8 + seed + 1) * m);
    add(p, 'tassel', 'rot', 8 * Math.sin((t * TAU) / 1.1 + seed) * m);
    add(p, 'bow', 'rot', 3 * Math.sin((t * TAU) / 1.4 + seed) * m);
    add(p, 'hairFront', 'rot', 0.8 * Math.sin((t * TAU) / 1.2 + seed) * m);
    add(p, 'skirt', 'rot', 1.2 * Math.sin((t * TAU) / 1.9 + seed) * m);
    const bl = blinkScale(t, seed);
    if (bl < 1) mul(p, 'eyes', 'sy', bl);
  }
  /** Hop with anticipation squash, stretched flight and a squash-bounce landing. */
  function hopState(t, t0, dur, h) {
    const pre = 0.08, post = 0.13;
    if (t < t0 - pre || t > t0 + dur + post) return { y: 0, sx: 1, sy: 1, air: 0, u: t < t0 ? 0 : 1 };
    if (t < t0) { const k = E.inOutQuad(seg(t, t0 - pre, t0)); return { y: 0, sx: 1 + 0.1 * k, sy: 1 - 0.13 * k, air: 0, u: 0 }; }
    if (t <= t0 + dur) {
      const u = (t - t0) / dur;
      const st = 1 - Math.min(1, Math.abs(u - 0.5) * 2);
      return { y: -h * 4 * u * (1 - u), sx: 1 - 0.07 * (1 - st), sy: 1 + 0.1 * (1 - st), air: 1, u };
    }
    const k = seg(t, t0 + dur, t0 + dur + post);
    const sq = Math.sin(Math.PI * k) * (1 - 0.3 * k);
    return { y: 0, sx: 1 + 0.15 * sq, sy: 1 - 0.17 * sq, air: 0, u: 1 };
  }
  function applyHop(p, hs) {
    const m = MOTION();
    p.y += hs.y * m; p.sx *= lerp(1, hs.sx, m); p.sy *= lerp(1, hs.sy, m);
  }
  /** Front-view crouch: torso drops, legs foreshorten, the skirt pools on the floor. */
  function kidCrouch(p, kind, a) {
    if (a <= 0) return;
    const drop = (kind === 'boy' ? 30 : 27) * a;
    add(p, 'torso', 'y', drop);
    add(p, 'legL', 'y', drop); mul(p, 'legL', 'sy', 1 - 0.5 * a); add(p, 'legL', 'rot', 16 * a);
    add(p, 'legR', 'y', drop); mul(p, 'legR', 'sy', 1 - 0.5 * a); add(p, 'legR', 'rot', -16 * a);
    if (kind === 'girl') { add(p, 'skirt', 'y', drop); mul(p, 'skirt', 'sy', 1 - 0.36 * a); mul(p, 'skirt', 'sx', 1 + 0.2 * a); }
  }
  /** Step-hop skip; landings fall on integer values of t·rate (so they can sit on the beat). */
  function kidSkip(p, t, rate, height, swing = 1) {
    const m = MOTION();
    const u = t * rate, f = u - Math.floor(u), odd = Math.floor(u) % 2 === 1;
    const air = Math.sin(Math.PI * f);
    p.y -= height * air * m;
    const land = f < 0.14 ? 1 - f / 0.14 : 0;
    p.sy *= 1 - 0.09 * land * m; p.sx *= 1 + 0.07 * land * m;
    const lift = air * 24 * swing * m;
    if (odd) { add(p, 'legL', 'rot', lift); add(p, 'legR', 'rot', -5 * air * m); }
    else { add(p, 'legR', 'rot', -lift); add(p, 'legL', 'rot', 5 * air * m); }
    add(p, 'armL', 'rot', (odd ? 34 : -6) * air * m * swing);
    add(p, 'armR', 'rot', (odd ? 6 : -34) * air * m * swing);
    add(p, 'braid', 'bend', -16 * air * m); add(p, 'braid', 'rot', (odd ? 5 : -5) * air * m);
    mul(p, 'skirt', 'sx', 1 + 0.06 * air * m);
    add(p, 'head', 'rot', (odd ? 3 : -3) * air * m);
  }
  function kidSway(p, t, period, deg, shift = 0) {
    const s = Math.sin((t * TAU) / period) * MOTION();
    add(p, 'torso', 'rot', deg * s); add(p, 'head', 'rot', -deg * 0.5 * s); add(p, 'skirt', 'rot', deg * 0.35 * s);
    p.x += shift * s;
  }
  function armsUp(p, a, wiggle = 0) {
    set(p, 'armL', { rot: lerp(7, 124 + wiggle, a), bend: lerp(6, -14, a) });
    set(p, 'armR', { rot: lerp(-7, -124 - wiggle, a), bend: lerp(-6, 14, a) });
  }
  function waveArm(p, side, t, rate = 2.6, amt = 1) {
    const w = Math.sin(t * TAU * rate) * MOTION();
    if (side === 'R') set(p, 'armR', { rot: lerp(-7, -132 - 16 * w, amt), bend: lerp(-6, -22 - 16 * w, amt) });
    else set(p, 'armL', { rot: lerp(7, 132 + 16 * w, amt), bend: lerp(6, 22 + 16 * w, amt) });
  }

  // ---- IK helpers (all solved in the torso's rest frame, so they ride on any body motion) ----
  function torsoWorld(rig, pose) {
    const W0 = rootMatrix(pose), tp = pose.parts.torso;
    return tp ? Mx.mul(W0, partLocal(rig.parts.torso, tp)) : W0;
  }
  const worldToTorso = (rig, pose, x, y) => Mx.apply(Mx.inv(torsoWorld(rig, pose)), x, y);
  /** Rubber-hose reach: rotate + bend the arm so the hand centre lands on T (torso-local).
   *  With no bendSign the elbow bulges down and outward, which reads as a natural arm. */
  function reachArm(rig, pose, side, T, bendSign) {
    const arm = rig.parts['arm' + side], b = arm.bend, g0 = rig.anchors['grip' + side], Pv = arm.pivot;
    if (!bendSign) {
      const dx = T[0] - Pv[0], dy = T[1] - Pv[1], out = side === 'L' ? -1 : 1;
      bendSign = dy * out - dx >= 0 ? 1 : -1;
    }
    const grip = (th) => bendPoint(b, th, g0[0], g0[1]);
    const dist = (th) => { const g = grip(th); return Math.hypot(g[0] - Pv[0], g[1] - Pv[1]); };
    const d = Math.hypot(T[0] - Pv[0], T[1] - Pv[1]);
    let th = 0;
    if (d < dist(0) - 0.01) {
      let lo = 0, hi = 2.9;
      for (let i = 0; i < 22; i++) { const mid = (lo + hi) / 2; if (dist(bendSign * mid) > d) lo = mid; else hi = mid; }
      th = (bendSign * (lo + hi)) / 2;
    }
    const g = grip(th);
    const rot = Math.atan2(T[1] - Pv[1], T[0] - Pv[0]) - Math.atan2(g[1] - Pv[1], g[0] - Pv[0]);
    set(pose, 'arm' + side, { rot: rot / DEG, bend: th / DEG });
  }
  function reachArmWorld(rig, pose, side, x, y, bendSign) { reachArm(rig, pose, side, worldToTorso(rig, pose, x, y), bendSign); }

  const SPARK_LEN = 65;   // grip → tip of the sparkler rig, in rig units
  /** Aim a hand-held sparkler so its tip lands on a world target; returns world grip/tip. */
  function aimSparkler(rig, pose, side, target, opts = {}) {
    const Wt = torsoWorld(rig, pose);
    const T = Mx.apply(Mx.inv(Wt), target.x, target.y);
    const Pv = rig.parts['arm' + side].pivot;
    const r1 = opts.reach || 33, L2 = SPARK_LEN;
    const dx = T[0] - Pv[0], dy = T[1] - Pv[1], d = Math.hypot(dx, dy) || 1;
    let Hp;
    if (d >= r1 + L2 || d <= Math.abs(r1 - L2)) {
      const rr = d >= r1 + L2 ? 36 : r1;
      Hp = [Pv[0] + (dx / d) * rr, Pv[1] + (dy / d) * rr];
    } else {
      // two hand positions satisfy both lengths: keep the one further out and lower,
      // so the sparkler is held away from the face and body
      const a = (r1 * r1 - L2 * L2 + d * d) / (2 * d), h = Math.sqrt(Math.max(0, r1 * r1 - a * a));
      const mx = Pv[0] + (dx * a) / d, my = Pv[1] + (dy * a) / d, out = side === 'L' ? -1 : 1;
      const c1 = [mx - (dy * h) / d, my + (dx * h) / d], c2 = [mx + (dy * h) / d, my - (dx * h) / d];
      const score = (c) => (c[0] - Pv[0]) * out + 0.6 * (c[1] - Pv[1]);
      Hp = score(c1) >= score(c2) ? c1 : c2;
    }
    reachArm(rig, pose, side, Hp, opts.bendSign);
    const ux = T[0] - Hp[0], uy = T[1] - Hp[1], ul = Math.hypot(ux, uy) || 1;
    const gW = Mx.apply(Wt, Hp[0], Hp[1]);
    const tW = Mx.apply(Wt, Hp[0] + (ux / ul) * L2, Hp[1] + (uy / ul) * L2);
    return { grip: { x: gW[0], y: gW[1] }, tip: { x: tW[0], y: tW[1] }, s: pose.s };
  }

  // ---- elephant ----
  function eleLife(p, t, seed) {
    const m = MOTION();
    mul(p, 'body', 'sy', 1 + 0.018 * Math.sin((t * TAU) / 1.5 + seed) * m);
    add(p, 'head', 'rot', 2.2 * Math.sin((t * TAU) / 2.1 + seed) * m);
    const flap = Math.sin((t * TAU) / 0.62 + seed);
    add(p, 'ear', 'rot', 6 * flap * m); mul(p, 'ear', 'sx', 1 + 0.05 * flap * m);
    add(p, 'tail', 'bend', 34 * Math.sin((t * TAU) / 0.55 + seed) * m);
    add(p, 'trunk', 'bend', 12 * Math.sin((t * TAU) / 1.3 + seed) * m);
    add(p, 'trunk', 'rot', 3 * Math.sin((t * TAU) / 1.7 + seed) * m);
    add(p, 'bell', 'rot', 7 * Math.sin((t * TAU) / 0.8 + seed) * m);
    const bl = blinkScale(t, seed + 3);
    if (bl < 1) mul(p, 'eyes', 'sy', bl);
  }
  function eleWaddle(p, t, rate, amt = 1) {
    const m = MOTION() * amt, ph = t * rate * TAU, a = Math.sin(ph);
    add(p, 'legNF', 'rot', 16 * a * m); add(p, 'legFB', 'rot', 16 * a * m);
    add(p, 'legNB', 'rot', -16 * a * m); add(p, 'legFF', 'rot', -16 * a * m);
    p.y -= Math.abs(Math.cos(ph)) * 4 * m;
    p.rot += 2.5 * a * m;
    add(p, 'head', 'rot', 3 * Math.cos(ph) * m);
    add(p, 'trunk', 'bend', 14 * Math.sin(ph + 1) * m);
    add(p, 'ear', 'rot', 6 * Math.sin(ph * 2) * m);
  }
  /** Bounce that lands exactly on the soundtrack's beats (T = timeline seconds). */
  function eleBeatBounce(p, T, h) {
    const m = MOTION(), b = T / SPB, f = b - Math.floor(b);
    const air = Math.sin(Math.PI * f);
    p.y -= h * air * m;
    const land = f < 0.16 ? 1 - f / 0.16 : 0;
    p.sy *= 1 - 0.13 * land * m; p.sx *= 1 + 0.11 * land * m;
    add(p, 'ear', 'rot', -12 * air * m);
    add(p, 'legNF', 'rot', -10 * air * m); add(p, 'legNB', 'rot', 10 * air * m);
    add(p, 'legFF', 'rot', -8 * air * m); add(p, 'legFB', 'rot', 8 * air * m);
    add(p, 'tail', 'bend', 30 * air * m);
    return { air, land };
  }
  function eleTrunkUp(p, a) { add(p, 'trunk', 'rot', -100 * a); add(p, 'trunk', 'bend', -48 * a); }

  // ════════════════════════════════════════════════════════════════════════════
  // 7. EFFECTS & DETERMINISTIC PARTICLES
  // ════════════════════════════════════════════════════════════════════════════
  function softGlow(x, y, r, hex, a) {
    if (r <= 0 || a <= 0) return;
    const ctx = view.ctx;
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, rgba(hex, a));
    g.addColorStop(0.42, rgba(hex, a * 0.42));
    g.addColorStop(1, rgba(hex, 0));
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill();
  }
  function star4(x, y, r, rot, fill, alpha = 1, edge = null, pinch = 0.3) {
    if (r <= 0.2 || alpha <= 0.01) return;
    const ctx = view.ctx;
    ctx.save();
    ctx.globalAlpha *= alpha;
    ctx.translate(x, y); ctx.rotate(rot);
    ctx.beginPath(); ctx.moveTo(r, 0);
    for (let i = 1; i <= 4; i++) {
      const a = (i * Math.PI) / 2, am = a - Math.PI / 4;
      ctx.quadraticCurveTo(Math.cos(am) * r * pinch, Math.sin(am) * r * pinch, Math.cos(a) * r, Math.sin(a) * r);
    }
    ctx.closePath();
    ctx.fillStyle = fill; ctx.fill();
    if (edge) { ctx.lineWidth = Math.max(1, r * 0.13); ctx.strokeStyle = edge; ctx.lineJoin = 'round'; ctx.stroke(); }
    ctx.restore();
  }
  function star5(x, y, r, rot, fill, alpha = 1) {
    if (r <= 0.2 || alpha <= 0.01) return;
    const ctx = view.ctx;
    ctx.save(); ctx.globalAlpha *= alpha; ctx.translate(x, y); ctx.rotate(rot);
    ctx.beginPath();
    for (let i = 0; i < 10; i++) {
      const rr = i % 2 ? r * 0.48 : r, a = -Math.PI / 2 + (i * Math.PI) / 5;
      if (i) ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr); else ctx.moveTo(Math.cos(a) * rr, Math.sin(a) * rr);
    }
    ctx.closePath(); ctx.fillStyle = fill; ctx.lineJoin = 'round'; ctx.fill();
    ctx.restore();
  }
  const EDGE_GOLD = '#E09337';
  /** Gold four-point glint with an ivory heart — the project's signature sparkle. */
  function glint(x, y, r, rot, alpha = 1) {
    star4(x, y, r, rot, P().goldAccent, alpha, EDGE_GOLD);
    if (r > 4) { const ctx = view.ctx; ctx.globalAlpha = alpha; ctx.fillStyle = '#FFFDF3'; ctx.beginPath(); ctx.arc(x, y, r * 0.16, 0, TAU); ctx.fill(); ctx.globalAlpha = 1; }
  }
  function dot(x, y, r, fill, alpha = 1) {
    const ctx = view.ctx; ctx.globalAlpha = alpha; ctx.fillStyle = fill;
    ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill(); ctx.globalAlpha = 1;
  }

  /** Deterministic particles: particle i is born at t0 + i/rate and is drawn from its own seeded RNG,
   *  so any frame can be rendered in isolation (scrubbing, export) with identical results. */
  function drawParticles(t, key, t0, t1, rate, maxLife, fn) {
    if (t < t0) return;
    const rr = rate * (config.reducedMotion ? 0.5 : 1);
    const from = Math.max(t0, t - maxLife), to = Math.min(t, t1);
    const i0 = Math.max(0, Math.ceil((from - t0) * rr)), i1 = Math.floor((to - t0) * rr + 1e-9);
    for (let i = i0; i <= i1; i++) {
      const ts = t0 + i / rr, age = t - ts;
      if (age >= 0 && age <= maxLife) fn(rng(key, i), age, ts, i);
    }
  }

  /** Sparkler head: warm halo, forked crackle rays that change every frame, bright core. */
  function drawSparklerHead(x, y, t, key, power = 1) {
    const ctx = view.ctx, pal = P();
    const r = rng(key, Math.floor(t * FPS + 0.0001));
    softGlow(x, y, 34 * power, pal.diyaFlame, 0.42);
    softGlow(x, y, 14 * power, pal.sparkleIvory, 0.95);
    ctx.lineCap = 'round';
    const n = config.reducedMotion ? 6 : 11;
    for (let i = 0; i < n; i++) {
      const a = r() * TAU, len = (8 + r() * 17) * power;
      const x2 = x + Math.cos(a) * len, y2 = y + Math.sin(a) * len;
      ctx.strokeStyle = i % 3 === 0 ? pal.cornerCoral : pal.goldAccent;
      ctx.lineWidth = 1.9; ctx.globalAlpha = 0.95;
      ctx.beginPath(); ctx.moveTo(x + Math.cos(a) * 4, y + Math.sin(a) * 4); ctx.lineTo(x2, y2);
      if (r() < 0.55) {
        const fa = a + (r() - 0.5) * 1.5;
        ctx.moveTo(x2 - Math.cos(a) * len * 0.3, y2 - Math.sin(a) * len * 0.3);
        ctx.lineTo(x2 - Math.cos(a) * len * 0.3 + Math.cos(fa) * len * 0.4, y2 - Math.sin(a) * len * 0.3 + Math.sin(fa) * len * 0.4);
      }
      ctx.stroke();
      if (r() < 0.6) { ctx.fillStyle = pal.goldAccent; ctx.beginPath(); ctx.arc(x2, y2, 1.5, 0, TAU); ctx.fill(); }
    }
    ctx.globalAlpha = 1;
    glint(x + (r() - 0.5) * 22, y + (r() - 0.5) * 22, (4 + r() * 3) * power, r() * 2, 0.95);
    dot(x, y, 3.4 * power, '#FFFDF2');
  }
  /** Glowing dotted streak along a sampled path. pts: [{x,y,a}] oldest → newest (a = opacity). */
  function drawSparkTrail(pts, key, width = 1) {
    if (pts.length < 2) return;
    const ctx = view.ctx, pal = P();
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    for (let pass = 0; pass < 2; pass++) {
      for (let i = 1; i < pts.length; i++) {
        const a = pts[i - 1], b = pts[i];
        const al = Math.min(a.a, b.a);
        if (al <= 0.01) continue;
        ctx.globalAlpha = pass === 0 ? al * 0.3 : al * 0.95;
        ctx.strokeStyle = pass === 0 ? pal.diyaFlame : pal.goldAccent;
        ctx.lineWidth = (pass === 0 ? 11 : 2.6) * width;
        ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
      }
    }
    for (let i = 0; i < pts.length; i += 2) {
      const q = pts[i];
      if (q.a <= 0.02) continue;
      dot(q.x, q.y, (1.2 + 1.6 * (i / pts.length)) * width, i % 4 === 0 ? pal.cornerCoral : '#FFFBEA', q.a);
    }
    const r = rng(key, 7);
    for (let k = 0; k < 4; k++) {
      const q = pts[Math.floor(r() * pts.length)];
      if (q && q.a > 0.1) glint(q.x + (r() - 0.5) * 10, q.y + (r() - 0.5) * 10, 3 + r() * 3, r() * 3, q.a);
    }
    ctx.globalAlpha = 1;
  }
  /** Spinner FX: rainbow speed rings in the ground plane, tangential gold dashes, warm glow. */
  function drawChakriFX(cx, cy, s, angAt, omegaAt, t, key, t0, t1) {
    const ctx = view.ctx, pal = P();
    const sp = clamp(omegaAt(t) / 24);
    if (sp > 0.02) {
      softGlow(cx, cy - 4 * s, 58 * s * (0.6 + sp * 0.6), pal.diyaFlame, 0.38 * sp);
      const ring = [pal.cornerCoral, pal.goldAccent, pal.turquoise, pal.girlDressPink, pal.indigo];
      const a0 = angAt(t);
      ctx.lineCap = 'round';
      for (let k = 0; k < 5; k++) {
        const R = (31 + k * 6) * s, st = a0 * (1 + k * 0.07) + k * 1.7, span = 0.7 + 1.5 * sp;
        ctx.strokeStyle = ring[k]; ctx.globalAlpha = 0.8 * sp; ctx.lineWidth = 3.2 * s;
        for (const off of [0, Math.PI]) {
          ctx.beginPath(); ctx.ellipse(cx, cy, R, R * 0.42, 0, st + off, st + off + span); ctx.stroke();
        }
      }
      ctx.globalAlpha = 1;
    }
    drawParticles(t, key, t0, t1, 64, 0.55, (r, age, ts) => {
      const w = clamp(omegaAt(ts) / 24);
      if (r() > w + 0.03) return;
      const life = 0.24 + r() * 0.3;
      if (age > life) return;
      const th = angAt(ts) + r() * TAU, R = 25 * s;
      const v = (110 + r() * 170) * s;
      const vx = -Math.sin(th) * v + Math.cos(th) * 55 * s, vy = Math.cos(th) * v + Math.sin(th) * 55 * s;
      const k = age / life;
      const X = cx + Math.cos(th) * R + vx * age, Y = cy + (Math.sin(th) * R + vy * age) * 0.42 - (70 * age - 90 * age * age) * s;
      const dir = Math.atan2(vy * 0.42 - 70 * s, vx);
      const len = 8 * s * (1 - k * 0.7);
      ctx.strokeStyle = r() < 0.3 ? pal.cornerCoral : pal.goldAccent;
      ctx.globalAlpha = 1 - k; ctx.lineWidth = 2.2 * s; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(X, Y); ctx.lineTo(X - Math.cos(dir) * len, Y - Math.sin(dir) * len); ctx.stroke();
    });
    ctx.globalAlpha = 1;
  }
  /** Flower-shaped firework: looping petals with dotted tips. */
  function drawFlowerBurst(x, y, age, life, R, petals, colors, rot) {
    if (age < 0 || age > life) return;
    const ctx = view.ctx, p = age / life;
    const g = E.outCubic(Math.min(1, p * 1.7)), fade = 1 - E.inQuad(seg(p, 0.4, 1));
    ctx.save();
    ctx.translate(x, y + 16 * p * p); ctx.rotate(rot + p * 0.3);
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    for (let i = 0; i < petals; i++) {
      const a = (i / petals) * TAU, len = R * g * (0.86 + 0.14 * Math.sin(i * 2.3)), wd = len * 0.2;
      const c = colors[i % colors.length];
      ctx.save(); ctx.rotate(a);
      ctx.globalAlpha = fade; ctx.strokeStyle = c; ctx.lineWidth = 2.8;
      ctx.beginPath(); ctx.moveTo(len * 0.22, 0);
      ctx.quadraticCurveTo(len * 0.62, -wd, len, 0); ctx.quadraticCurveTo(len * 0.62, wd, len * 0.22, 0);
      ctx.stroke();
      ctx.fillStyle = c; ctx.beginPath(); ctx.arc(len + 6, 0, 2.6 * fade + 0.6, 0, TAU); ctx.fill();
      ctx.restore();
    }
    ctx.restore();
    glint(x, y, 10 * (1 - p * 0.5), p * 2, fade);
  }
  function drawDustPuff(x, y, age, life, size, key) {
    if (age < 0 || age > life) return;
    const ctx = view.ctx, p = age / life, r = rng(key);
    for (let i = 0; i < 4; i++) {
      const side = i < 2 ? -1 : 1, off = (i % 2) * 0.5;
      const dx = side * (10 + off * 10 + p * 26) * size, dy = -(2 + off * 6 + p * 12) * size;
      const rad = (5 + off * 3 + p * 7 + r() * 2) * size;
      ctx.globalAlpha = (1 - p) * 0.9;
      ctx.fillStyle = '#F1E6D4'; ctx.strokeStyle = '#CDBBA4'; ctx.lineWidth = 1.6;
      ctx.beginPath(); ctx.arc(x + dx, y + dy, rad, 0, TAU); ctx.fill(); ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }
  /** A little breeze: wavy line ending in a curl, drawn on progressively. */
  function drawBreeze(x, y, len, prog, alpha, flip = -1) {
    if (alpha <= 0.01 || prog <= 0) return;
    const ctx = view.ctx, pts = [];
    const n = 28;
    for (let i = 0; i <= n; i++) {
      const u = i / n;
      if (u > prog) break;
      if (u < 0.75) pts.push([x + flip * u * len, y + Math.sin(u * 9) * 4]);
      else { const a = (u - 0.75) / 0.25 * TAU * 0.85; const cx = x + flip * 0.75 * len, cy = y - 9; pts.push([cx + flip * Math.sin(a) * 9, cy + Math.cos(a) * 9]); }
    }
    if (pts.length < 2) return;
    ctx.globalAlpha = alpha; ctx.strokeStyle = P().cornerTurquoise; ctx.lineWidth = 3; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.beginPath(); ctx.moveTo(pts[0][0], pts[0][1]);
    for (const q of pts.slice(1)) ctx.lineTo(q[0], q[1]);
    ctx.stroke(); ctx.globalAlpha = 1;
  }
  /** One of only two background firework accents: a tiny coral-gold streak and a soft pop. */
  function drawRocketAccent(t, t0, x0, y0, x1, y1) {
    const up = 0.42, pop = 0.4;
    if (t < t0 || t > t0 + up + pop) return;
    const ctx = view.ctx, pal = P();
    if (t < t0 + up) {
      const p = E.outQuad((t - t0) / up), pb = E.outQuad(Math.max(0, (t - t0 - 0.09) / up));
      const x = lerp(x0, x1, p), y = lerp(y0, y1, p), xb = lerp(x0, x1, pb), yb = lerp(y0, y1, pb);
      ctx.lineCap = 'round'; ctx.strokeStyle = pal.cornerCoral; ctx.lineWidth = 2.4; ctx.globalAlpha = 0.85;
      ctx.beginPath(); ctx.moveTo(xb, yb); ctx.lineTo(x, y); ctx.stroke();
      ctx.globalAlpha = 1; dot(x, y, 2.6, pal.goldAccent);
      return;
    }
    const p = (t - t0 - up) / pop;
    ctx.lineCap = 'round';
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * TAU + 0.2, r0 = 4 + 14 * E.outCubic(p), r1 = r0 + 7 * (1 - p);
      ctx.strokeStyle = i % 2 ? pal.cornerCoral : pal.goldAccent; ctx.lineWidth = 2; ctx.globalAlpha = 1 - p;
      ctx.beginPath(); ctx.moveTo(x1 + Math.cos(a) * r0, y1 + Math.sin(a) * r0); ctx.lineTo(x1 + Math.cos(a) * r1, y1 + Math.sin(a) * r1); ctx.stroke();
    }
    ctx.globalAlpha = 1;
    glint(x1, y1, 6 * (1 - p), p, 1 - p);
  }
  /** Turquoise sparkle-flower doodle (title decoration). */
  function sparkleFlower(x, y, r, rot, alpha = 1, color = null) {
    if (r <= 0.5 || alpha <= 0.01) return;
    const ctx = view.ctx;
    ctx.save(); ctx.globalAlpha *= alpha; ctx.translate(x, y); ctx.rotate(rot);
    ctx.strokeStyle = color || P().cornerTurquoise; ctx.lineCap = 'round'; ctx.lineWidth = Math.max(1.6, r * 0.13);
    ctx.beginPath();
    for (let i = 0; i < 8; i++) {
      const a = (i * Math.PI) / 4, l0 = r * 0.34, l1 = i % 2 ? r * 0.62 : r;
      ctx.moveTo(Math.cos(a) * l0, Math.sin(a) * l0); ctx.lineTo(Math.cos(a) * l1, Math.sin(a) * l1);
    }
    ctx.stroke();
    ctx.beginPath(); ctx.arc(0, 0, r * 0.18, 0, TAU); ctx.stroke();
    ctx.restore();
  }
  /** Short brush-like wavy underline whose width swells in the middle. */
  function brushWave(x0, x1, y, amp, color, prog, w = 5) {
    if (prog <= 0) return;
    const ctx = view.ctx, n = 36, top = [], bot = [];
    for (let i = 0; i <= n; i++) {
      const u = (i / n) * prog, x = lerp(x0, x1, u), yy = y + Math.sin(u * TAU * 1.6) * amp;
      const ww = w * Math.sin(Math.PI * clamp(u / Math.max(prog, 0.001) * 0.98 + 0.01)) * (0.6 + 0.4 * Math.sin(Math.PI * u));
      top.push([x, yy - ww / 2]); bot.push([x, yy + ww / 2]);
    }
    ctx.fillStyle = color; ctx.beginPath(); ctx.moveTo(top[0][0], top[0][1]);
    for (const q of top) ctx.lineTo(q[0], q[1]);
    for (let i = bot.length - 1; i >= 0; i--) ctx.lineTo(bot[i][0], bot[i][1]);
    ctx.closePath(); ctx.fill();
  }
  /** Path for a rounded flower-star (used by the reveal wipes and the bloom). */
  function flowerStarPath(ctx, x, y, R, lobes, rot, pinch = 0.62) {
    ctx.beginPath();
    for (let i = 0; i < lobes; i++) {
      const a0 = rot + (i / lobes) * TAU, a1 = rot + ((i + 1) / lobes) * TAU, am = (a0 + a1) / 2;
      const p0 = [x + Math.cos(a0) * R * pinch, y + Math.sin(a0) * R * pinch];
      if (i === 0) ctx.moveTo(p0[0], p0[1]);
      const c1 = [x + Math.cos(a0 + 0.15) * R * 1.08, y + Math.sin(a0 + 0.15) * R * 1.08];
      const c2 = [x + Math.cos(a1 - 0.15) * R * 1.08, y + Math.sin(a1 - 0.15) * R * 1.08];
      const p1 = [x + Math.cos(a1) * R * pinch, y + Math.sin(a1) * R * pinch];
      ctx.bezierCurveTo(c1[0], c1[1], (c1[0] + c2[0]) / 2 + Math.cos(am) * R * 0.12, (c1[1] + c2[1]) / 2 + Math.sin(am) * R * 0.12, x + Math.cos(am) * R, y + Math.sin(am) * R);
      ctx.bezierCurveTo((c1[0] + c2[0]) / 2 + Math.cos(am) * R * 0.12, (c1[1] + c2[1]) / 2 + Math.sin(am) * R * 0.12, c2[0], c2[1], p1[0], p1[1]);
    }
    ctx.closePath();
  }

  // ════════════════════════════════════════════════════════════════════════════
  // 8. BACKGROUND, FRAME DECOR, GREETING TITLE
  // ════════════════════════════════════════════════════════════════════════════
  const ROUND_STACK = '"Fredoka", "Baloo 2", "Arial Rounded MT Bold", "Trebuchet MS", system-ui, sans-serif';
  const FONT_HAPPY = '800 68px "Baloo 2", ' + ROUND_STACK;
  const FONT_DIWALI = '700 118px ' + ROUND_STACK;
  const FONT_FOOT = '700 19px ' + ROUND_STACK;
  const FONT_FOOT_SUB = '600 9px ' + ROUND_STACK;

  const grainCache = new WeakMap();
  function grainPattern(ctx) {
    let pat = grainCache.get(ctx);
    if (!pat) {
      const N = 160, c = document.createElement('canvas');
      c.width = c.height = N;
      const g = c.getContext('2d'), img = g.createImageData(N, N), r = rng('paper-grain');
      for (let i = 0; i < N * N; i++) {
        const v = r(), o = i * 4;
        if (v < 0.2) { img.data[o] = 122; img.data[o + 1] = 88; img.data[o + 2] = 70; img.data[o + 3] = 50 + Math.floor(r() * 130); }
        else if (v > 0.92) { img.data[o] = 255; img.data[o + 1] = 255; img.data[o + 2] = 250; img.data[o + 3] = 140; }
      }
      g.putImageData(img, 0, 0);
      pat = ctx.createPattern(c, 'repeat');
      grainCache.set(ctx, pat);
    }
    return pat;
  }
  function drawBackground() {
    const ctx = view.ctx;
    ctx.fillStyle = P().backgroundCream;
    ctx.fillRect(0, 0, W, H);
    if (config.grain) {
      ctx.globalAlpha = 0.045; ctx.fillStyle = grainPattern(ctx); ctx.fillRect(0, 0, W, H); ctx.globalAlpha = 1;
    }
  }
  function leaf(x, y, ang, len, wid, fill) {
    const ctx = view.ctx;
    ctx.save(); ctx.translate(x, y); ctx.rotate(ang);
    ctx.beginPath(); ctx.moveTo(0, 0);
    ctx.quadraticCurveTo(len * 0.5, -wid, len, 0); ctx.quadraticCurveTo(len * 0.5, wid, 0, 0);
    ctx.fillStyle = fill; ctx.fill(); ctx.restore();
  }
  /** Two small, asymmetric, hand-drawn folk flourishes in opposite corners (static). */
  function drawFolkFlourishes() {
    const ctx = view.ctx, pal = P();
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    // top-left: a thin turquoise branch with coral leaf dabs and two amber dots
    ctx.strokeStyle = pal.cornerTurquoise; ctx.lineWidth = 4;
    ctx.beginPath(); ctx.moveTo(-8, 104); ctx.bezierCurveTo(28, 100, 64, 80, 82, 50); ctx.bezierCurveTo(94, 30, 98, 10, 96, -14); ctx.stroke();
    ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(57, 78); ctx.bezierCurveTo(71, 90, 93, 92, 107, 82); ctx.bezierCurveTo(117, 74, 113, 62, 104, 64); ctx.bezierCurveTo(98, 66, 99, 74, 105, 73); ctx.stroke();
    leaf(31, 93, -2.55, 18, 7.5, pal.cornerCoral);
    leaf(76, 58, -2.25, 17, 7, pal.cornerCoral);
    leaf(94, 20, -1.9, 15, 6.5, pal.cornerCoral);
    dot(124, 38, 3.6, pal.goldAccent); dot(64, 118, 2.8, pal.goldAccent);
    // bottom-right: an open arc, a coral echo arc and a five-petal flower
    ctx.strokeStyle = pal.cornerTurquoise; ctx.lineWidth = 4;
    ctx.beginPath(); ctx.moveTo(598, 1292); ctx.bezierCurveTo(606, 1226, 652, 1176, 732, 1166); ctx.stroke();
    ctx.strokeStyle = pal.cornerCoral; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(641, 1292); ctx.bezierCurveTo(647, 1254, 677, 1226, 732, 1216); ctx.stroke();
    ctx.save(); ctx.translate(664, 1206);
    ctx.strokeStyle = pal.cornerCoral; ctx.lineWidth = 2.6;
    for (let i = 0; i < 5; i++) {
      ctx.save(); ctx.rotate(-0.4 + (i * TAU) / 5);
      ctx.beginPath(); ctx.moveTo(3, 0); ctx.quadraticCurveTo(9, -6, 14, 0); ctx.quadraticCurveTo(9, 6, 3, 0); ctx.stroke();
      ctx.restore();
    }
    ctx.restore();
    dot(664, 1206, 2.6, pal.goldAccent);
    dot(622, 1240, 3.2, pal.goldAccent); dot(706, 1142, 2.6, pal.cornerTurquoise);
  }
  function drawBase() { drawBackground(); drawFolkFlourishes(); }
  /** Faint hand-drawn sage contact line, broken into three gently wavering strokes. */
  function drawGround(y = GROUND, alpha = 1) {
    const ctx = view.ctx;
    ctx.strokeStyle = P().sageGround; ctx.lineWidth = 2; ctx.lineCap = 'round'; ctx.globalAlpha = alpha;
    for (const [a, b] of [[62, 248], [262, 476], [490, 656]]) {
      ctx.beginPath(); ctx.moveTo(a, y + 1); ctx.quadraticCurveTo((a + b) / 2, y - 1.8, b, y + 0.6); ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }
  function spacedText(str, cx, y, font, spacing) {
    const ctx = view.ctx;
    ctx.font = font; ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
    const chars = Array.from(str), ws = chars.map((c) => ctx.measureText(c).width);
    let x = cx - (ws.reduce((a, b) => a + b, 0) + spacing * (chars.length - 1)) / 2;
    chars.forEach((c, i) => { ctx.fillText(c, x, y); x += ws[i] + spacing; });
  }
  /** Discreet optional studio credit. */
  function drawFooter() {
    if (!config.showFooter) return;
    const ctx = view.ctx, pal = P();
    ctx.fillStyle = pal.footerInk;
    if (config.brand) spacedText(config.brand, 360, 1086, FONT_FOOT, 3);
    if (config.brandSub) spacedText(config.brandSub.toUpperCase(), 360, 1102, FONT_FOOT_SUB, 3);
    dot(360, 1062, 2.2, pal.footerInk, 0.8);
  }

  // ---- title lockup --------------------------------------------------------------
  // Offset two-line lockup: a smaller arched plum HAPPY, a big coral DIWALI on a lifted,
  // bouncy baseline with a cream rim + plum accent shadow; diya at left, turquoise
  // sparkle-flowers at right, a short brush wave beneath and seeded confetti stars.
  const LOCK = { yShift: 14, happyX: -44, happyY: -46, happyRot: 3, arch: 9, diwaliX: 16, diwaliY: 58, diwaliRot: 1 };
  const LIFT = [0, -7, 2, -5, 3, -9, 1, -4, 2, -6];
  const TILT = [-3, 3, -2, 4, -3, 5, -2, 3, -4, 2];
  const TITLE_STAR = { x: 214, y: -98, r: 13 };
  const TITLE_VARIANTS = {
    t1: { seed: 11, style: 'bounce', dx: -4, dy: 0, rot: 0 },
    t2: { seed: 23, style: 'diagonal', dx: 12, dy: -14, rot: -3.5 },
    t3: { seed: 37, style: 'stagger', dx: -14, dy: 10, rot: 1.5 },
    t4: { seed: 41, style: 'fireworks', dx: 6, dy: 8, rot: -1 },
    t5: { seed: 53, style: 'tilt', dx: -10, dy: -8, rot: 2 },
    t6: { seed: 67, style: 'pop', dx: 16, dy: 4, rot: -2 },
    burst: { seed: 71, style: 'starburst', dx: 0, dy: -6, rot: -1.5 },
    bloom: { seed: 83, style: 'bloom', dx: 8, dy: 12, rot: 1 },
    final: { seed: 97, style: 'final', dx: 0, dy: 0, rot: 0, noExit: true },
  };
  let fontsReady = false;
  const titleCache = { key: '', l1: null, l2: null };
  function layoutWord(ctx, text, font, tracking, maxW) {
    ctx.font = font;
    const chars = Array.from(text || ' ');
    const ws = chars.map((c) => ctx.measureText(c).width);
    const total = ws.reduce((a, b) => a + b, 0) + tracking * (chars.length - 1);
    const fit = total > maxW ? maxW / total : 1;
    let x = -total / 2;
    const out = chars.map((c, i) => { const o = { c, x: (x + ws[i] / 2) * fit, w: ws[i] * fit }; x += ws[i] + tracking; return o; });
    return { chars: out, width: total * fit, fit };
  }
  function titleLayout(ctx) {
    const key = config.line1 + '|' + config.line2 + '|' + fontsReady;
    if (titleCache.key !== key) {
      titleCache.key = key;
      titleCache.l1 = layoutWord(ctx, config.line1, FONT_HAPPY, 4, 420);
      titleCache.l2 = layoutWord(ctx, config.line2, FONT_DIWALI, 2, 540);
    }
    return titleCache;
  }
  function letterIn(lt, delay) {
    if (config.reducedMotion) return { y: 0, s: 1, a: E.outQuad(clamp((lt - delay) / 0.2)) };
    const p = clamp((lt - delay) / 0.26);
    const s = p < 0.55 ? lerp(0.92, 1.06, E.outQuad(p / 0.55)) : lerp(1.06, 1, E.inOutQuad((p - 0.55) / 0.45));
    return { y: 18 * (1 - titleIn(p)), s, a: clamp(p * 5) };
  }
  /** Lockup placement for appearance v at local time lt (matrix in logical canvas space). */
  function titleMatrix(v, lt, dur) {
    let x = TITLE_CENTER.x + v.dx, y = TITLE_CENTER.y + LOCK.yShift + v.dy, rot = v.rot, sc = 1, alpha = 1;
    if (!config.reducedMotion) {
      if (v.style === 'diagonal') { const p = E.outBack(seg(lt, 0, 0.3), 2); x += lerp(-70, 0, p); y += lerp(64, 0, p); rot += lerp(-9, 0, p); }
      else if (v.style === 'tilt') { const k = seg(lt, 0, 0.6); rot += -7 * Math.exp(-5 * k) * Math.cos(k * 15); }
      else if (v.style === 'bloom') sc *= lerp(0.55, 1, E.outBack(seg(lt, 0.06, 0.4), 1.6));
    } else if (!v.noExit) alpha *= E.outQuad(seg(lt, 0, 0.18));
    if (!v.noExit) {
      const ex = E.inQuad(seg(lt, dur - 0.15, dur));
      rot += 6 * ex; sc *= 1 - 0.1 * ex; alpha *= 1 - ex;
    }
    return { M: Mx.mul(Mx.tr(x, y), Mx.mul(Mx.rot(rot * DEG), Mx.sc(sc))), alpha };
  }
  function setTf(M) { const D = Mx.mul(view.base, M); view.ctx.setTransform(D[0], D[1], D[2], D[3], D[4], D[5]); }

  function drawDiwaliLetter(ctx, ch, alpha) {
    const pal = P();
    ctx.globalAlpha = alpha;
    ctx.fillStyle = pal.titleShadow; ctx.fillText(ch, 4, 5);
    ctx.lineJoin = 'round'; ctx.lineWidth = 4.5; ctx.strokeStyle = pal.titleOutline; ctx.strokeText(ch, 0, 0);
    ctx.fillStyle = pal.titleVermilion; ctx.fillText(ch, 0, 0);
  }
  /** The redesigned greeting. opts.alphaMul fades it; opts.hideStar detaches the gold star (loop return). */
  function drawNewGreetingTitle(lt, dur, v, opts = {}) {
    const ctx = view.ctx, pal = P(), L = titleLayout(ctx);
    const tm = titleMatrix(v, lt, dur);
    const M = opts.matrix || tm.M;
    const A = tm.alpha * (opts.alphaMul == null ? 1 : opts.alphaMul);
    if (A <= 0.002) return;
    const rm = config.reducedMotion;
    const wordGap = v.style === 'pop' ? 0.12 : 0.065;
    const stagger = v.style === 'stagger' ? 0.055 : v.style === 'pop' ? 0 : v.style === 'final' ? 0.03 : 0.022;
    const start = v.style === 'starburst' ? 0.06 : v.style === 'bloom' ? 0.1 : 0;
    setTf(M);
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';

    // ---- behind the letters
    if (v.style === 'bloom') {
      const p = E.outBack(seg(lt, 0, 0.34), 1.4), q = E.outCubic(seg(lt, 0.05, 0.45));
      ctx.globalAlpha = A * 0.22; ctx.fillStyle = pal.cornerTurquoise;
      flowerStarPath(ctx, 0, -6, 250 * p, 8, lt * 0.5); ctx.fill();
      ctx.globalAlpha = A * 0.9; ctx.strokeStyle = pal.cornerTurquoise; ctx.lineWidth = 4; ctx.stroke();
      ctx.globalAlpha = A * 0.3; ctx.fillStyle = pal.goldAccent;
      flowerStarPath(ctx, 0, -6, 165 * q, 8, Math.PI / 8 - lt * 0.4, 0.55); ctx.fill();
      ctx.globalAlpha = A; ctx.strokeStyle = pal.goldAccent; ctx.lineWidth = 3;
      for (let i = 0; i < 16; i++) {
        const a = (i / 16) * TAU + 0.1, r0 = 262 * p, r1 = r0 + 14 * q;
        ctx.beginPath(); ctx.moveTo(Math.cos(a) * r0, -6 + Math.sin(a) * r0 * 0.9); ctx.lineTo(Math.cos(a) * r1, -6 + Math.sin(a) * r1 * 0.9); ctx.stroke();
      }
    }
    if (v.style === 'fireworks') {
      const cols = [pal.cornerCoral, pal.goldAccent, pal.turquoise];
      const bursts = [[-214, -150, 0.04, 62], [222, -134, 0.26, 56], [12, -200, 0.48, 70], [-150, 140, 0.62, 44]];
      bursts.forEach(([bx, by, t0, R], i) => drawFlowerBurst(bx, by, lt - t0, 0.75, rm ? R * 0.7 : R, 8, cols.slice(i % 3).concat(cols.slice(0, i % 3)), i));
      setTf(M);
    }
    if (v.style === 'tilt') {
      const r = rng('soft', v.seed);
      for (let i = 0; i < 14; i++) {
        const x = (r() - 0.5) * 520, y0 = 60 + (r() - 0.5) * 260, sp = 20 + r() * 30, ph = r() * TAU;
        const y = y0 - sp * lt, al = 0.55 * E.outQuad(clamp(lt * 3 - r()));
        dot(x, y, 2 + r() * 2.5, i % 2 ? pal.cornerCoral : pal.goldAccent, al * A * (0.6 + 0.4 * Math.sin(lt * 6 + ph)));
      }
      setTf(M);
    }

    // ---- HAPPY (arched, plum)
    ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
    const l1 = L.l1, hw = Math.max(40, l1.width / 2);
    ctx.save();
    ctx.translate(LOCK.happyX, LOCK.happyY); ctx.rotate(LOCK.happyRot * DEG);
    l1.chars.forEach((o, i) => {
      const li = letterIn(lt, start + i * stagger);
      if (li.a <= 0) return;
      const u = o.x / hw, lift = -LOCK.arch * (1 - u * u), tilt = Math.atan((2 * LOCK.arch * o.x) / (hw * hw)) + TILT[(i + 3) % TILT.length] * 0.4 * DEG;
      ctx.save();
      ctx.translate(o.x, lift + li.y); ctx.rotate(tilt); ctx.scale(li.s * l1.fit, li.s * l1.fit);
      ctx.font = FONT_HAPPY; ctx.globalAlpha = A * li.a;
      ctx.fillStyle = pal.titleDeepPlum; ctx.fillText(o.c, 0, 0);
      ctx.restore();
    });
    ctx.restore();

    // ---- DIWALI (big, coral, lifted baseline)
    const l2 = L.l2;
    ctx.save();
    ctx.translate(LOCK.diwaliX, LOCK.diwaliY); ctx.rotate(LOCK.diwaliRot * DEG);
    l2.chars.forEach((o, i) => {
      const li = letterIn(lt, start + wordGap + i * stagger);
      if (li.a <= 0) return;
      ctx.save();
      ctx.translate(o.x, LIFT[i % LIFT.length] + li.y); ctx.rotate(TILT[i % TILT.length] * DEG); ctx.scale(li.s * l2.fit, li.s * l2.fit);
      ctx.font = FONT_DIWALI;
      drawDiwaliLetter(ctx, o.c, A * li.a);
      ctx.restore();
    });
    ctx.restore();
    ctx.globalAlpha = 1;

    // ---- embellishments
    const deco = (d) => (rm ? clamp((lt - d) / 0.2) : E.outBack(clamp((lt - d) / 0.24), 2.2));
    const half = l2.width / 2;
    // short wavy turquoise brush line under DIWALI
    const ulP = v.style === 'stagger' ? E.inOutQuad(seg(lt, 0.3, 0.62)) : E.outCubic(seg(lt, start + 0.12, start + 0.4));
    ctx.globalAlpha = A;
    brushWave(LOCK.diwaliX - half * 0.55, LOCK.diwaliX + half * 0.62, 98, v.style === 'stagger' ? 5.5 : 3.6, pal.cornerTurquoise, ulP, 6);
    // two turquoise sparkle-flower doodles at right
    const dA = deco(start + 0.16), dB = deco(start + 0.22);
    sparkleFlower(LOCK.diwaliX + half + 22, -50, 17 * dA, lt * 0.6, A);
    sparkleFlower(LOCK.diwaliX + half + 48, -12, 10 * dB, -lt * 0.8, A);
    // tilted clay diya with an almond flame at left
    const dd = deco(start + 0.1);
    if (dd > 0.01) {
      const pulse = v.style === 'pop' ? 1 + 0.35 * Math.max(0, Math.sin(lt * 18)) * (1 - seg(lt, 0.3, 0.55)) : 1;
      const dp = diyaPose(LOCK.diwaliX - half - 54, 70, 0.62 * dd, lt + v.seed, { lit: pulse, seed: v.seed, rot: -12 });
      dp.alpha = A;
      const an = rigAnchors(RIGS.diya, Object.assign({}, dp, { parts: dp.parts }));
      const fw = Mx.apply(M, an.flame.x, an.flame.y);
      resetTf(); softGlow(fw[0], fw[1], 34 * pulse, pal.diyaFlame, 0.4 * A);
      drawRig(RIGS.diya, dp, { parent: M });
      if (v.style === 'pop') {
        for (let k = 0; k < 3; k++) {
          const a = lt * 5 + (k * TAU) / 3, rr = 26 + 6 * Math.sin(lt * 9 + k);
          glint(fw[0] + Math.cos(a) * rr, fw[1] + Math.sin(a) * rr * 0.8, 5 + 2 * Math.sin(lt * 14 + k * 2), lt * 4 + k, A);
        }
      }
      setTf(M);
    }
    // seeded confetti stars, differently placed for every appearance
    const r = rng('confetti', v.seed);
    const n = v.style === 'final' ? 7 : 9;
    for (let i = 0; i < n; i++) {
      const a = r() * TAU, rr = 0.92 + r() * 0.3;
      const x = Math.cos(a) * 285 * rr, y = -8 + Math.sin(a) * 150 * rr;
      const size = 4.5 + r() * 6.5, col = r() < 0.5 ? pal.cornerCoral : pal.goldAccent, delay = start + 0.04 + r() * 0.3, ph = r() * TAU;
      const pop = rm ? clamp((lt - delay) / 0.2) : E.outBack(clamp((lt - delay) / 0.22), 2);
      const tw = 0.78 + 0.22 * Math.sin(lt * 9 + ph);
      if (Math.abs(x) > 340) continue;
      star4(x, y, size * pop * tw, ph + lt * 0.7, col, A, col === pal.goldAccent ? EDGE_GOLD : null);
    }
    // the gold title star (becomes the opening diya flame in the loop return)
    if (!opts.hideStar) {
      const sp = deco(start + 0.2), tw = 0.82 + 0.18 * Math.sin(lt * 11);
      glint(TITLE_STAR.x, TITLE_STAR.y, TITLE_STAR.r * sp * tw, lt * 1.4, A);
    }
    ctx.globalAlpha = 1;
    resetTf();
  }

  // ════════════════════════════════════════════════════════════════════════════
  // 9. SHOTS, TIMELINE, TRANSITIONS, renderFrame(t)
  // ════════════════════════════════════════════════════════════════════════════
  function kidPose(x, flip, T, seed, s = 1, gy = GROUND) { const p = newPose(x, gy, s, flip); kidLife(p, T, seed); return p; }
  function elePose(x, flip, T, seed, s = 1.08, gy = GROUND) { const p = newPose(x, gy, s, flip); eleLife(p, T, seed); return p; }
  function groundShadow(p, w, dx = 0) {
    const ctx = view.ctx, lift = Math.max(0, p.gy - p.y), k = 1 / (1 + lift / 70);
    ctx.fillStyle = rgba(mixHex(P().sageGround, P().softPeach, 0.35), 0.36 * k);
    const rx = Math.max(0.5, w * p.s * k * Math.max(0.35, Math.abs(p.sx == null ? 1 : p.sx)));
    ctx.beginPath(); ctx.ellipse(p.x + dx * p.s * (p.flip || 1), p.gy + 1, rx, Math.max(0.5, 6.5 * p.s * k), 0, 0, TAU); ctx.fill();
  }
  function drawKid(kind, p, opt) { groundShadow(p, kind === 'boy' ? 34 : 44); return drawRig(RIGS[kind], p, opt); }
  function drawOriginalKids(list) { list.forEach(([kind, p]) => drawKid(kind, p)); }
  function drawBabyElephant(p, opt) { groundShadow(p, 62, -8); return drawRig(RIGS.elephant, p, opt); }
  function diyaPose(x, y, s, T, o = {}) {
    const p = newPose(x, y, s, o.flip || 1);
    const sd = o.seed || 0, lit = o.lit == null ? 1 : o.lit, m = MOTION();
    const fl = 0.5 * Math.sin(T * 23 + sd) + 0.5 * Math.sin(T * 37 + sd * 2.1);
    set(p, 'flame', { sx: lit * (1 + 0.06 * fl * m), sy: lit * (1 + 0.09 * Math.sin(T * 19 + sd) * m), bend: (o.lean || 0) + 7 * fl * m, alpha: lit > 0.02 ? 1 : 0 });
    if (o.rot) p.rot = o.rot;
    return p;
  }
  function drawDiya(p, glow = 1) {
    const f = rigAnchors(RIGS.diya, p).flame, lit = p.parts.flame.sx || 0;
    if (glow > 0 && lit > 0.05) softGlow(f.x, f.y, 52 * p.s * Math.min(1.2, lit), P().diyaFlame, 0.42 * glow * Math.min(1, lit));
    drawRig(RIGS.diya, p);
    return f;
  }
  // spinner angular velocity: ease-in ramp from t0→t1 up to wMax, then steady
  function spinAngle(t, t0, t1, wMax) {
    if (t <= t0) return 0;
    const d = t1 - t0;
    if (t < t1) { const x = (t - t0) / d; return (wMax * d * x * x * x) / 3; }
    return (wMax * d) / 3 + wMax * (t - t1);
  }
  function spinOmega(t, t0, t1, wMax) {
    if (t <= t0) return 0;
    if (t < t1) { const x = (t - t0) / (t1 - t0); return wMax * x * x; }
    return wMax;
  }
  function drawChakri(x, y, s, ang) {
    const p = newPose(x, y, s, 1);
    set(p, 'ground', { sy: 0.42 }); set(p, 'wheel', { rot: ang / DEG });
    drawRig(RIGS.chakri, p);
  }
  /** Diyas, the chakri and their glow (named per the spec's architecture). */
  function drawDiyasAndSpinner(state, T) {
    (state.diyas || []).forEach((d) => drawDiya(d));
    if (state.chakri) {
      const c = state.chakri;
      drawChakriFX(c.x, c.y, c.s, c.angAt, c.omegaAt, c.t, c.key, c.t0, c.t1);
      drawChakri(c.x, c.y, c.s, c.angAt(c.t));
    }
  }
  /** Hand-held sparkler: stick, the holding hand redrawn on top, then the glowing head. */
  function drawSparklers(kind, pose, side, sp, T, key, power = 1, lit = 1) {
    const ang = Math.atan2(sp.tip.x - sp.grip.x, -(sp.tip.y - sp.grip.y));
    const sk = newPose(sp.grip.x, sp.grip.y, sp.s, 1);
    sk.rot = ang / DEG;
    drawRig(RIGS.sparkler, sk);
    drawRig(RIGS[kind], pose, { only: 'hand' + side });
    if (lit > 0.01) drawSparklerHead(sp.tip.x, sp.tip.y, T, key, power * lit);
  }
  const invInOutSine = (y) => Math.acos(1 - 2 * clamp(y)) / Math.PI;

  const SHOTS = {};

  // 0.00 – 0.65  Girl kneels at the diya; the opening star sparks the flame; the elephant peeks in.
  function drawOpeningStar(lt, fl) {
    if (lt < 0.06) { glint(fl.x, fl.y, 8, 0, 1); return; }
    const k = seg(lt, 0.06, 0.3), e = E.outCubic(k);
    const tw = k < 1 ? 1 + 0.45 * Math.sin(Math.PI * k) : 0.78 + 0.22 * Math.sin(lt * 26);
    glint(lerp(fl.x, fl.x + 19, e), lerp(fl.y, fl.y - 25, e), lerp(8, 6.5, k) * tw, (lt - 0.06) * 3, 1);
  }
  SHOTS.diyaWelcome = (lt, dur, T) => {
    drawGround();
    const ign = seg(lt, 0.06, 0.26);
    const lit = lt < 0.06 ? 0.3 : lerp(0.3, 1, E.outBack(ign, 2.4));
    const dp = diyaPose(398, GROUND + 2, 1.15, T, { lit, seed: 1 });
    const fl = rigAnchors(RIGS.diya, dp).flame;
    const g = kidPose(318, 1, T, 2.1);
    kidCrouch(g, 'girl', 1);
    add(g, 'torso', 'rot', 8 - 4 * E.outQuad(ign)); add(g, 'head', 'rot', 6);
    reachArmWorld(RIGS.girl, g, 'R', fl.x - 31 + 4 * ign, fl.y + 12);
    reachArmWorld(RIGS.girl, g, 'L', fl.x - 47, fl.y + 26);
    face(g, lt < 0.08 ? 'wide' : 'happy', lt < 0.08 ? 'o' : 'smile');
    const ein = E.outBack(seg(lt, 0.16, 0.52), 1.2);
    const e = elePose(lerp(830, 616, ein), -1, T, 4.2);
    eleWaddle(e, T, 2.4, seg(lt, 0.16, 0.42) * (1 - seg(lt, 0.46, 0.6)));
    face(e, lt < 0.46 ? 'wide' : 'open', 'smile');
    add(e, 'ear', 'rot', -10 * seg(lt, 0.4, 0.6)); add(e, 'head', 'rot', -5 * ein);
    drawKid('girl', g);
    softGlow(fl.x, fl.y, 76 * lit, P().diyaFlame, 0.3 * lit);
    drawDiya(dp);
    drawBabyElephant(e);
    if (ign > 0 && ign < 1) {
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * TAU + 0.3, rr = 10 + 34 * E.outCubic(ign);
        glint(fl.x + Math.cos(a) * rr, fl.y + Math.sin(a) * rr * 0.8, 4.5 * (1 - ign), a, 1 - ign);
      }
    }
    drawOpeningStar(lt, fl);
  };

  // Greeting title appearances (variant chosen per timeline entry)
  SHOTS.greetingTitle = (lt, dur, T, S) => drawNewGreetingTitle(lt, dur, TITLE_VARIANTS[S.v]);
  SHOTS.finalTitle = (lt, dur) => drawNewGreetingTitle(lt, dur, TITLE_VARIANTS.final);
  SHOTS.flowerStarTitle = (lt, dur) => drawNewGreetingTitle(lt, dur, TITLE_VARIANTS.bloom);

  // 1.75 – 2.75  Boy draws a sparkling circle; girl smiles; elephant bobs on the beat.
  SHOTS.sparklerPlay = (lt, dur, T) => {
    drawRocketAccent(lt, 0.2, 592, 560, 566, 404);
    drawGround();
    const g = kidPose(462, -1, T, 2.4);
    kidSway(g, T, SPB * 2, 4);
    reachArm(RIGS.girl, g, 'L', [-4, -101]); reachArm(RIGS.girl, g, 'R', [4, -101]);
    face(g, lt > 0.45 ? 'happy' : 'open', 'smile');
    const e = elePose(606, -1, T, 3.3);
    eleBeatBounce(e, T, 9);
    add(e, 'trunk', 'bend', 22 * Math.sin(T * TAU * 2.2)); face(e, 'happy', 'smile');
    const b = kidPose(288, 1, T, 1.3);
    const C = { x: 212, y: 706 }, R = 23, t0 = 0.14, t1 = 0.8;
    const pt = (uu) => { const a = Math.PI / 2 + TAU * uu; return { x: C.x + Math.cos(a) * R, y: C.y + Math.sin(a) * R }; };
    const u = E.inOutSine(seg(lt, t0, t1));
    let target = pt(u);
    if (lt < t0) { const k = E.outQuad(seg(lt, 0, t0)), p0 = pt(0); target = { x: lerp(p0.x + 34, p0.x, k), y: lerp(p0.y + 74, p0.y, k) }; }
    const sp = aimSparkler(RIGS.boy, b, 'L', target);
    face(b, lt > 0.82 ? 'happy' : 'open', lt > 0.82 ? 'laugh' : 'smile');
    add(b, 'head', 'rot', -5);
    drawKid('girl', g); drawBabyElephant(e); drawKid('boy', b);
    const pts = [], n = 54, fadeAll = 1 - 0.75 * seg(lt, 0.84, 1);
    for (let i = 0; i <= n; i++) {
      const uu = (i / n) * u, q = pt(uu), born = t0 + (t1 - t0) * invInOutSine(uu);
      pts.push({ x: q.x, y: q.y, a: clamp(1.15 - (lt - born) / 1.2) * fadeAll });
    }
    if (lt > t0) drawSparkTrail(pts, 'sp-circle');
    drawSparklers('boy', b, 'L', sp, T, 'boy-sp');
  };

  // 2.75 – 3.65  The chakri starts to whirl; both children do a tiny surprised hop.
  SHOTS.spinnerStarts = (lt, dur, T) => {
    drawGround();
    const cx = 334, cy = GROUND - 3, s = 1.2;
    const angAt = (x) => 0.6 + spinAngle(x, 0.12, 0.8, 24), omegaAt = (x) => spinOmega(x, 0.12, 0.8, 24);
    const e = elePose(650, -1, T, 3.9, 1.0);
    face(e, lt > 0.22 && lt < 0.6 ? 'wide' : 'happy', lt > 0.22 && lt < 0.6 ? 'o' : 'smile');
    add(e, 'ear', 'rot', -16 * seg(lt, 0.22, 0.3) * (1 - seg(lt, 0.55, 0.7)));
    const kids = [['boy', 180, 1, 1.7, 0.3], ['girl', 488, -1, 2.6, 0.34]].map(([kind, x, fl, sd, t0]) => {
      const p = kidPose(x, fl, T, sd);
      const hs = hopState(lt, t0, 0.26, 26);
      applyHop(p, hs);
      const surprised = lt > t0 - 0.06 && lt < t0 + 0.34;
      face(p, surprised ? 'wide' : 'happy', surprised ? 'o' : 'laugh');
      if (hs.air) armsUp(p, 0.45, 0);
      else if (lt > t0 + 0.34) armsUp(p, 0.85 * E.outBack(seg(lt, t0 + 0.34, t0 + 0.5)), 10 * Math.sin(T * 9));
      add(p, 'head', 'rot', 5 * fl);
      return [kind, p];
    });
    drawBabyElephant(e);
    drawOriginalKids(kids);
    drawDiyasAndSpinner({ chakri: { x: cx, y: cy, s, angAt, omegaAt, t: lt, key: 'chakri-a', t0: 0.12, t1: dur } }, T);
    if (lt < 0.16) glint(cx + 6, cy - 14, 4 + 2 * Math.sin(lt * 40), lt * 9, 1);
  };

  // 4.30 – 5.35  The baby elephant bounces on the beat and waves its curled trunk.
  SHOTS.elephantDance = (lt, dur, T) => {
    drawGround();
    const b = kidPose(198, 1, T, 1.1);
    kidSway(b, T, SPB * 2, 7, 5); waveArm(b, 'L', T, 1 / SPB); face(b, 'happy', 'laugh');
    const g = kidPose(526, -1, T, 2.2);
    kidSway(g, T + SPB, SPB * 2, 7, 5); waveArm(g, 'L', T + 0.21, 1 / SPB); face(g, 'happy', 'smile');
    const e = elePose(366, 1, T, 5.1, 1.14);
    const bb = eleBeatBounce(e, T, 24);
    add(e, 'trunk', 'rot', -32 * Math.sin((T * TAU) / (SPB * 2))); add(e, 'trunk', 'bend', -34 * Math.sin((T * TAU) / (SPB * 2) + 0.6));
    face(e, 'happy', 'open');
    drawOriginalKids([['boy', b], ['girl', g]]);
    drawBabyElephant(e);
    const beat = Math.floor(T / SPB), age = T - beat * SPB;
    drawDustPuff(366 - 30, GROUND, age, 0.32, 0.8, 'puffL' + beat);
    drawDustPuff(366 + 26, GROUND, age, 0.32, 0.8, 'puffR' + beat);
    if (bb.air > 0.85) glint(366 + 70, 700 - 20 * bb.air, 5, T * 4, 0.9);
  };

  // 5.35 – 5.85  A hand-drawn flower-star wipe blooms open to reveal the greeting.
  SHOTS.starburstTitle = (lt, dur, T, S) => {
    const ctx = view.ctx, v = TITLE_VARIANTS.burst;
    const p = config.reducedMotion ? 1 : E.inOutCubic(seg(lt, 0, 0.3));
    if (p >= 1) { drawNewGreetingTitle(lt, dur, v); return; }
    const prev = TIMELINE[S.index - 1];
    renderShotBody(prev, prev.dur - 0.001);
    const cx = 362, cy = 668, R = lerp(6, 960, p);
    ctx.save();
    flowerStarPath(ctx, cx, cy, R, 8, lt * 0.8); ctx.clip();
    drawBase(); drawNewGreetingTitle(lt, dur, v);
    ctx.restore(); resetTf();
    const edge = 1 - seg(R, 560, 900);
    ctx.lineJoin = 'round';
    ctx.globalAlpha = edge;
    ctx.strokeStyle = P().cornerTurquoise; ctx.lineWidth = 5;
    flowerStarPath(ctx, cx, cy, R, 8, lt * 0.8); ctx.stroke();
    ctx.globalAlpha = 1;
    for (let i = 0; i < 8; i++) {
      const a = lt * 0.8 + ((i + 0.5) / 8) * TAU;
      glint(cx + Math.cos(a) * R * 1.02, cy + Math.sin(a) * R * 1.02, 9, a, edge);
    }
  };

  // 5.85 – 7.05  The girl paints a soft gold loop; once it fades the boy hops through.
  SHOTS.sparklerTrail = (lt, dur, T) => {
    drawGround();
    const e = elePose(650, -1, T, 6.1, 1.0);
    face(e, lt > 0.95 ? 'happy' : 'open', lt > 0.95 ? 'open' : 'smile');
    add(e, 'head', 'rot', lt < 0.7 ? -4 : -4 + 8 * seg(lt, 0.75, 1));
    const g = kidPose(282, 1, T, 2.8, 0.94, GROUND - 22);
    const C = { x: 352, y: 682 }, rx = 26, ry = 21, t0 = 0.06, t1 = 0.6;
    const loopPt = (uu) => { const a = Math.PI * 0.8 + TAU * uu; return { x: C.x + Math.cos(a) * rx, y: C.y + Math.sin(a) * ry }; };
    const u = E.inOutSine(seg(lt, t0, t1));
    let target = loopPt(u);
    if (lt > t1) { const k = E.inOutQuad(seg(lt, t1, t1 + 0.2)), a = loopPt(1); target = { x: lerp(a.x, 344, k), y: lerp(a.y, 656, k) }; }
    const sp = aimSparkler(RIGS.girl, g, 'R', target);
    face(g, lt > 1.0 ? 'happy' : 'open', lt > 1.0 ? 'laugh' : 'smile');
    const hopT0 = 0.72, hopDur = 0.34;
    const hs = hopState(lt, hopT0, hopDur, 66);
    const bx = lerp(150, 478, E.inOutSine(seg(lt, hopT0 - 0.04, hopT0 + hopDur + 0.03)));
    const b = kidPose(bx, 1, T, 1.9);
    applyHop(b, hs);
    if (hs.air) { armsUp(b, 0.75, 0); add(b, 'legL', 'rot', 26 * Math.sin(Math.PI * hs.u)); add(b, 'legR', 'rot', -26 * Math.sin(Math.PI * hs.u)); }
    else if (lt > hopT0 + hopDur) armsUp(b, 0.8 * E.outBack(seg(lt, hopT0 + hopDur, hopT0 + hopDur + 0.15)));
    face(b, lt < hopT0 - 0.1 ? 'open' : lt < hopT0 + hopDur ? 'wide' : 'happy', lt < hopT0 + hopDur && lt > hopT0 - 0.1 ? 'o' : 'laugh');
    drawBabyElephant(e);
    drawKid('girl', g);
    const fade = 1 - seg(lt, 0.62, 0.78), pts = [], n = 56;
    for (let i = 0; i <= n; i++) {
      const uu = (i / n) * u, q = loopPt(uu), born = t0 + (t1 - t0) * invInOutSine(uu);
      pts.push({ x: q.x, y: q.y, a: clamp(1.2 - (lt - born) / 1.4) * fade });
    }
    if (lt > t0 && fade > 0) drawSparkTrail(pts, 'sp-loop', 1.1);
    drawSparklers('girl', g, 'R', sp, T, 'girl-sp', 0.94);
    drawKid('boy', b);
  };

  // 7.05 – 7.75  Close-up: three diyas light up in a row; delighted faces glow.
  SHOTS.diyaCloseup = (lt, dur, T) => {
    const gy = 884, ctx = view.ctx;
    drawGround(gy);
    const lights = [0.04, 0.15, 0.26], xs = [258, 360, 462];
    const kids = [['boy', 222, 1, 1.4], ['girl', 498, -1, 2.3]].map(([kind, x, fl, sd]) => {
      const p = kidPose(x, fl, T, sd, 1.5, gy);
      kidCrouch(p, kind, 1);
      add(p, 'torso', 'rot', 7); add(p, 'head', 'rot', 7);
      reachArm(RIGS[kind], p, 'L', [-10, -114]); reachArm(RIGS[kind], p, 'R', [10, -114]);
      const lit = lt > 0.3;
      face(p, lit ? 'happy' : 'wide', lit ? 'smile' : 'o');
      return [kind, p];
    });
    drawOriginalKids(kids);
    const diyas = xs.map((x, i) => {
      const k = seg(lt, lights[i], lights[i] + 0.16);
      return diyaPose(x, gy + 14, 1.42, T, { lit: lt < lights[i] ? 0 : E.outBack(k, 2.6), seed: 3 + i });
    });
    const warm = seg(lt, 0.05, 0.45);
    ctx.globalCompositeOperation = 'soft-light';
    softGlow(360, 760, 330, P().diyaFlame, 0.55 * warm);
    ctx.globalCompositeOperation = 'source-over';
    drawDiyasAndSpinner({ diyas }, T);
    lights.forEach((t0, i) => {
      const k = seg(lt, t0, t0 + 0.3);
      if (k > 0 && k < 1) for (let j = 0; j < 6; j++) {
        const a = (j / 6) * TAU + i, rr = 12 + 34 * E.outCubic(k);
        glint(xs[i] + 45 + Math.cos(a) * rr, gy - 44 + Math.sin(a) * rr * 0.8, 5 * (1 - k), a, 1 - k);
      }
    });
  };

  // 8.55 – 9.70  The chakri spins bright dashed circles while the kids shuffle side to side.
  SHOTS.spinnerDance = (lt, dur, T) => {
    drawGround();
    const cx = 306, cy = GROUND - 3, s = 1.18;
    const angAt = (x) => 1.3 + 25 * x, omegaAt = () => 25;
    const shuffle = (p, phase) => {
      const s2 = Math.tanh(3 * Math.sin((T * TAU) / (SPB * 2) + phase)) * MOTION();
      p.x += 16 * s2;
      const step = Math.abs(Math.cos((T * TAU) / (SPB * 2) + phase));
      add(p, 'legL', 'rot', 14 * (1 - step) * (s2 < 0 ? 1 : 0.2)); add(p, 'legR', 'rot', -14 * (1 - step) * (s2 > 0 ? 1 : 0.2));
      p.y -= 5 * (1 - step) * MOTION();
      add(p, 'torso', 'rot', -5 * s2);
      set(p, 'armL', { rot: 40 + 25 * s2, bend: 30 }); set(p, 'armR', { rot: -40 + 25 * s2, bend: -30 });
    };
    const b = kidPose(170, 1, T, 1.6); shuffle(b, 0); face(b, 'happy', 'laugh');
    const g = kidPose(440, -1, T, 2.9); shuffle(g, Math.PI / 2); face(g, 'happy', 'smile');
    const e = elePose(612, -1, T, 7.2, 1.02);
    add(e, 'head', 'rot', 6 * Math.sin((T * TAU) / SPB)); eleWaddle(e, T, 1 / (SPB * 2), 0.6); face(e, 'happy', 'open');
    drawBabyElephant(e);
    drawOriginalKids([['boy', b], ['girl', g]]);
    drawDiyasAndSpinner({ chakri: { x: cx, y: cy, s, angAt, omegaAt, t: lt, key: 'chakri-b', t0: 0, t1: dur } }, T);
  };

  // 9.70 – 10.65  A harmless sparkle startles the elephant: hop, squash-bounce landing, giggles.
  SHOTS.comedyHop = (lt, dur, T) => {
    drawGround();
    const hopT0 = 0.32, hopDur = 0.3;
    const ex = lerp(302, 372, E.outQuad(seg(lt, 0, 0.26)));
    const e = elePose(ex, 1, T, 8.4, 1.14);
    eleWaddle(e, T, 2.6, 1 - seg(lt, 0.2, 0.28));
    const hs = hopState(lt, hopT0, hopDur, 74);
    applyHop(e, hs);
    const startled = lt > 0.25 && lt < 0.8;
    if (startled) {
      face(e, 'wide', 'o');
      add(e, 'ear', 'rot', -22); eleTrunkUp(e, 0.7 * (hs.air ? 1 : seg(lt, 0.25, 0.32)));
      if (hs.air) { add(e, 'legNF', 'rot', -24); add(e, 'legFF', 'rot', -20); add(e, 'legNB', 'rot', 24); add(e, 'legFB', 'rot', 20); add(e, 'tail', 'bend', 40); }
    } else if (lt >= 0.8) { face(e, 'happy', 'open'); add(e, 'head', 'rot', 6 * Math.sin(lt * 30) * (1 - seg(lt, 0.8, 0.95))); }
    else face(e, 'open', 'smile');
    const kids = [['boy', 150, 1, 1.2], ['girl', 592, -1, 2.5]].map(([kind, x, fl, sd]) => {
      const p = kidPose(x, fl, T, sd);
      if (lt > 0.4) {
        face(p, 'happy', kind === 'boy' ? 'laugh' : 'giggle');
        if (kind === 'boy') { reachArm(RIGS.boy, p, 'R', [6, -133]); toFront(p, 'armR'); }
        else { reachArm(RIGS.girl, p, 'L', [-21, -139]); reachArm(RIGS.girl, p, 'R', [21, -139]); toFront(p, 'armL', 'armR'); }
        p.y -= Math.abs(Math.sin(lt * 26)) * 3 * MOTION();
      } else face(p, lt > 0.26 ? 'wide' : 'open', lt > 0.26 ? 'o' : 'smile');
      return [kind, p];
    });
    drawOriginalKids(kids);
    drawBabyElephant(e);
    const tipX = ex + 92 * 1.14, tipY = GROUND - 40 * 1.14;
    const sk = seg(lt, 0.2, 0.42);
    if (sk > 0 && sk < 1) {
      glint(tipX + 6, tipY - 16, 12 * Math.sin(Math.PI * sk) * 1.2, sk * 5, 1);
      for (let i = 0; i < 5; i++) { const a = (i / 5) * TAU, rr = 8 + 22 * sk; dot(tipX + 6 + Math.cos(a) * rr, tipY - 16 + Math.sin(a) * rr, 2 * (1 - sk), P().goldAccent, 1 - sk); }
    }
    const land = lt - (hopT0 + hopDur);
    drawDustPuff(ex - 34, GROUND, land, 0.4, 1, 'hopL');
    drawDustPuff(ex + 30, GROUND, land, 0.4, 1, 'hopR');
  };

  // 11.75 – 12.85  The boy shields the diya from a tiny breeze; the girl waves a sparkler behind.
  SHOTS.diyaAndSparkle = (lt, dur, T) => {
    drawGround();
    const gs = 0.82, ggy = GROUND - 30;
    const g = kidPose(578, -1, T, 3.1, gs, ggy);
    const fx = 626 + 20 * Math.sin(lt * 7.5), fy = 690 + 11 * Math.sin(lt * 15);
    const sp = aimSparkler(RIGS.girl, g, 'L', { x: fx, y: fy });
    face(g, 'happy', 'smile');
    drawGround(ggy, 0.35);
    drawKid('girl', g);
    const pts = [];
    for (let i = 0; i <= 24; i++) { const tt = lt - i * 0.02; pts.unshift({ x: 626 + 20 * Math.sin(tt * 7.5), y: 690 + 11 * Math.sin(tt * 15), a: 1 - i / 24 }); }
    drawSparkTrail(pts, 'girl-fig8', 0.8);
    drawSparklers('girl', g, 'L', sp, T, 'girl-sp2', 0.8);
    const gust = Math.sin(Math.PI * seg(lt, 0.26, 0.66)), shield = E.inOutQuad(seg(lt, 0.36, 0.5)) * (1 - seg(lt, 0.9, 1.1));
    const dp = diyaPose(316, GROUND + 2, 1.3, T, { lean: -40 * gust * (1 - 0.6 * shield), seed: 9 });
    const fl = rigAnchors(RIGS.diya, dp).flame;
    for (let i = 0; i < 3; i++) {
      const p = seg(lt, 0.18 + i * 0.06, 0.62 + i * 0.06), al = Math.sin(Math.PI * p);
      drawBreeze(712 - 300 * p, 770 + i * 15, 92, Math.min(1, p * 2.2), al * 0.85);
    }
    const b = kidPose(420, -1, T, 1.8, 1.16);
    kidCrouch(b, 'boy', 1);
    add(b, 'torso', 'rot', 9 * shield);
    if (shield > 0.01) reachArmWorld(RIGS.boy, b, 'R', lerp(fl.x + 40, fl.x + 15, shield), lerp(fl.y + 40, fl.y - 2, shield));
    face(b, lt > 0.3 && lt < 0.55 ? 'wide' : 'happy', lt > 0.3 && lt < 0.55 ? 'o' : 'smile');
    drawKid('boy', b);
    softGlow(fl.x, fl.y, 70, P().diyaFlame, 0.3);
    drawDiya(dp);
    drawRig(RIGS.boy, b, { only: 'handR' });
    const curl = seg(lt, 0.3, 0.7);
    if (curl > 0 && curl < 1) drawBreeze(fl.x + 30 - 20 * curl, fl.y - 6, 26, 1, Math.sin(Math.PI * curl) * 0.8);
  };

  // 12.85 – 13.65  The elephant raises its trunk and puffs out a trail of star confetti.
  SHOTS.elephantTrunk = (lt, dur, T) => {
    drawGround();
    const cheer = E.outBack(seg(lt, 0.3, 0.46));
    const kids = [['boy', 112, 1, 1.5], ['girl', 618, -1, 2.7]].map(([kind, x, fl, sd]) => {
      const p = kidPose(x, fl, T, sd);
      armsUp(p, 0.85 * cheer, 10 * Math.sin(T * 10 + sd));
      p.y -= 6 * Math.abs(Math.sin(T * 9 + sd)) * cheer * MOTION();
      face(p, cheer > 0.5 ? 'happy' : 'open', cheer > 0.5 ? 'laugh' : 'smile');
      return [kind, p];
    });
    const e = elePose(318, 1, T, 9.7, 1.3);
    const up = E.outBack(seg(lt, 0, 0.22), 1.5);
    eleTrunkUp(e, up);
    if (lt > 0.2) add(e, 'trunk', 'bend', 22 * Math.sin(lt * 40) * (1 - seg(lt, 0.6, 0.8)));
    add(e, 'ear', 'rot', 8 * Math.sin(lt * 24)); face(e, 'happy', 'open');
    drawOriginalKids(kids);
    const an = drawBabyElephant(e, { anchors: {} });
    const tip = an.trunkTip;
    const cols = [P().cornerCoral, P().goldAccent, P().turquoise, P().girlDressPink];
    drawParticles(lt, 'confetti-trunk', 0.2, 0.62, 46, 1.0, (r, age) => {
      const life = 0.6 + r() * 0.4;
      if (age > life) return;
      const vx = 50 + r() * 150, vy = -230 - r() * 120, k = age / life;
      const x = tip.x + vx * age, y = tip.y + vy * age + 330 * age * age;
      const sz = 4 + r() * 4, rot = r() * TAU + age * (r() - 0.5) * 12, c = cols[Math.floor(r() * cols.length)];
      if (r() < 0.5) star5(x, y, sz * 1.15, rot, c, 1 - k * k); else star4(x, y, sz * 1.25, rot, c, 1 - k * k, c === P().goldAccent ? EDGE_GOLD : null);
    });
    if (lt > 0.18 && lt < 0.66) glint(tip.x, tip.y, 6 + 2 * Math.sin(lt * 50), lt * 6, 0.9);
  };

  // 14.35 – 15.55  A short skipping parade, landing on every beat; sparkles drift above.
  SHOTS.miniParade = (lt, dur, T) => {
    drawRocketAccent(lt, 0.34, 150, 560, 172, 396);
    drawGround();
    const gx = lerp(196, 452, lt / dur);
    const rate = 1 / SPB;
    const b = kidPose(gx - 150, 1, T, 1.2);
    kidSkip(b, T, rate, 14); waveArm(b, 'R', T, 2.2); face(b, 'happy', 'laugh');
    const e = elePose(gx - 6, 1, T, 9.1);
    eleWaddle(e, T, rate / 2, 1); e.y -= 7 * Math.abs(Math.sin((Math.PI * T) / SPB)) * MOTION();
    eleTrunkUp(e, 0.55 + 0.1 * Math.sin(T * 8)); face(e, 'happy', 'open');
    const g = kidPose(gx + 170, 1, T, 2.2);
    kidSkip(g, T + SPB / 2, rate, 14);
    const tgt = { x: gx + 170 + 46, y: 628 + 8 * Math.sin(T * 9) };
    const sp = aimSparkler(RIGS.girl, g, 'R', tgt);
    face(g, 'happy', 'laugh');
    drawOriginalKids([['boy', b]]);
    drawBabyElephant(e);
    drawKid('girl', g);
    const pts = [];
    for (let i = 0; i <= 20; i++) {
      const tt = T - i * 0.02, gxx = lerp(196, 452, clamp((lt - i * 0.02) / dur));
      pts.unshift({ x: gxx + 216, y: 628 + 8 * Math.sin(tt * 9) + 10, a: 1 - i / 20 });
    }
    drawSparkTrail(pts, 'parade-trail', 0.7);
    drawSparklers('girl', g, 'R', sp, T, 'parade-sp');
    drawParticles(lt, 'drift', 0, dur, 14, 1.0, (r, age) => {
      const x = lerp(140, 640, r()) + Math.sin(age * 5 + r() * 6) * 8, y = 690 - r() * 90 - 46 * age;
      const k = age / 1.0;
      glint(x, y, (3 + r() * 4) * Math.sin(Math.PI * k), age * 3, 0.9);
    });
  };

  // 15.55 – 16.50  The chakri skitters through two colourful loops, slows, and settles.
  SHOTS.spinnerFinale = (lt, dur, T) => {
    drawGround();
    const cx = 392, cy = GROUND - 4, s = 1.1;
    const pathAt = (x) => { const ph = TAU * E.outQuad(seg(x, 0, 0.74)); return { x: cx + 78 * Math.sin(ph), y: cy + 13 * Math.sin(2 * ph) }; };
    const d0 = 0.55, d1 = 0.92, w0 = 26;
    const omegaAt = (x) => (x < d0 ? w0 : x < d1 ? w0 * (1 - (x - d0) / (d1 - d0)) : 0);
    const angAt = (x) => { if (x < d0) return w0 * x; const d = Math.min(x, d1) - d0; return w0 * d0 + w0 * (d - (d * d) / (2 * (d1 - d0))); };
    const pos = pathAt(lt);
    const settled = lt > 0.84;
    const cheer = E.outBack(seg(lt, 0.84, 0.98));
    const watch = (p, x, fl) => { const k = clamp((pos.x - x) / 220, -1, 1); add(p, 'head', 'rot', 9 * k * fl); };
    const e = elePose(84, 1, T, 10.3, 1.02); watch(e, 84, 1); face(e, settled ? 'happy' : 'open', settled ? 'open' : 'smile');
    if (settled) eleTrunkUp(e, 0.6 * cheer);
    const b = kidPose(254, 1, T, 1.9); watch(b, 254, 1);
    const g = kidPose(598, -1, T, 2.1); watch(g, 598, -1);
    [b, g].forEach((p) => { face(p, settled ? 'happy' : 'open', settled ? 'laugh' : 'o'); if (settled) armsUp(p, 0.9 * cheer, 8 * Math.sin(T * 10)); });
    drawBabyElephant(e);
    drawOriginalKids([['boy', b], ['girl', g]]);
    const ring = [P().cornerCoral, P().goldAccent, P().turquoise, P().girlDressPink, P().indigo];
    const ctx = view.ctx;
    ctx.lineCap = 'round';
    for (let i = 0; i < 46; i++) {
      const x = lt - i * 0.016;
      if (x < 0) break;
      const q = pathAt(x), q2 = pathAt(Math.max(0, x - 0.016)), a = (1 - i / 46) * clamp(omegaAt(x) / w0 + 0.2) * (1 - seg(lt, 0.8, 0.95));
      ctx.strokeStyle = ring[i % 5]; ctx.globalAlpha = a * 0.85; ctx.lineWidth = 4.5;
      ctx.beginPath(); ctx.moveTo(q2.x, q2.y + 3); ctx.lineTo(q.x, q.y + 3); ctx.stroke();
    }
    ctx.globalAlpha = 1;
    drawDiyasAndSpinner({ chakri: { x: pos.x, y: pos.y, s, angAt, omegaAt, t: lt, key: 'chakri-c', t0: 0, t1: d1 } }, T);
    drawDustPuff(pos.x, pos.y + 2, lt - 0.86, 0.5, 0.9, 'settle');
  };

  // 17.25 – 18.45  One playful pirouette, a dizzy wobble, then giggles; the girl claps.
  SHOTS.friendlyGiggle = (lt, dur, T) => {
    drawGround();
    const claps = [0.65, 0.8, 0.95, 1.1];
    const e = elePose(146, 1, T, 11.2);
    eleBeatBounce(e, T, 10); eleTrunkUp(e, 0.35 + 0.1 * Math.sin(T * 12)); face(e, 'happy', 'open');
    const g = kidPose(548, -1, T, 2.4);
    let near = 1;
    claps.forEach((c) => { near = Math.min(near, Math.abs(lt - c)); });
    const gap = lt > 0.5 && lt < 1.2 ? 4 + 14 * clamp(near / 0.075) : 14;
    reachArm(RIGS.girl, g, 'L', [-gap, -104]); reachArm(RIGS.girl, g, 'R', [gap, -104]);
    face(g, 'happy', 'laugh');
    g.y -= 3 * Math.abs(Math.sin(lt * 20)) * MOTION();
    const b = kidPose(348, 1, T, 1.4);
    const spin = seg(lt, 0.05, 0.5);
    if (spin > 0 && spin < 1) {
      const c = Math.cos(TAU * E.inOutSine(spin));
      b.sx *= config.reducedMotion ? 0.75 + 0.25 * c : Math.sign(c || 1) * Math.max(0.14, Math.abs(c));
      b.y -= 8 * Math.sin(Math.PI * spin);
      set(b, 'armL', { rot: 82, bend: 10 }); set(b, 'armR', { rot: -82, bend: -10 });
      face(b, 'happy', 'smile');
    } else if (lt >= 0.5 && lt < 0.92) {
      const k = seg(lt, 0.5, 0.92), wob = Math.sin(k * TAU * 1.5) * (1 - k * 0.5) * MOTION();
      b.rot += 7 * wob; add(b, 'head', 'rot', -8 * wob);
      set(b, 'armL', { rot: 40 + 10 * wob, bend: 20 }); set(b, 'armR', { rot: -40 + 10 * wob, bend: -20 });
      face(b, 'dizzy', 'wobble');
    } else if (lt >= 0.92) {
      face(b, 'happy', 'laugh');
      reachArm(RIGS.boy, b, 'R', [7, -132]); toFront(b, 'armR');
      add(b, 'torso', 'y', 2 * Math.sin(lt * 50) * MOTION());
    }
    drawBabyElephant(e);
    drawKid('boy', b);
    drawKid('girl', g);
    if (spin > 0.05 && spin < 0.95 && !config.reducedMotion) {
      const ctx = view.ctx, k = Math.sin(Math.PI * spin);
      ctx.lineCap = 'round';
      [[GROUND - 70, 52, P().cornerTurquoise], [GROUND - 120, 46, P().goldAccent], [GROUND - 165, 40, P().cornerCoral]].forEach(([y, r, col], i) => {
        const a0 = TAU * E.inOutSine(spin) * 1.5 + i;
        ctx.strokeStyle = col; ctx.globalAlpha = 0.85 * k; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.ellipse(348, y, r, r * 0.22, 0, a0, a0 + 2.2); ctx.stroke();
      });
      ctx.globalAlpha = 1;
    }
    if (lt >= 0.5 && lt < 0.95) {
      const k = seg(lt, 0.5, 0.95), hx = 348 + Math.sin(b.rot * DEG) * 200, hy = GROUND - 222;
      for (let i = 0; i < 3; i++) {
        const a = lt * 9 + (i * TAU) / 3;
        glint(hx + Math.cos(a) * 26, hy + Math.sin(a) * 8, 6 * Math.sin(Math.PI * k), a, 1);
      }
    }
    claps.forEach((c) => {
      const k = seg(lt, c, c + 0.22);
      if (k > 0 && k < 1) for (let i = 0; i < 4; i++) { const a = -Math.PI / 2 + (i - 1.5) * 0.5, rr = 16 + 18 * k; dot(548 + Math.cos(a) * rr, GROUND - 106 + Math.sin(a) * rr, 2.2 * (1 - k), P().goldAccent, 1 - k); }
    });
  };

  // 19.00 – 20.05  The kids cross two little sparklers into an abstract flower of light.
  SHOTS.sparkleBouquet = (lt, dur, T) => {
    drawGround();
    const e = elePose(612, -1, T, 12.4);
    eleBeatBounce(e, T, 14); add(e, 'trunk', 'rot', -24 * Math.sin((T * TAU) / (SPB * 2))); add(e, 'trunk', 'bend', -28 * Math.sin((T * TAU) / (SPB * 2) + 0.7));
    face(e, 'happy', 'open');
    const cross = { x: 362, y: 676 };
    const raise = E.inOutCubic(seg(lt, 0, 0.3));
    const b = kidPose(282, 1, T, 1.7), g = kidPose(440, -1, T, 2.2);
    const spB = aimSparkler(RIGS.boy, b, 'R', { x: lerp(330, cross.x + 12, raise), y: lerp(760, cross.y - 4, raise) });
    const spG = aimSparkler(RIGS.girl, g, 'R', { x: lerp(394, cross.x - 12, raise), y: lerp(760, cross.y - 4, raise) });
    face(b, lt > 0.35 ? 'happy' : 'open', 'smile'); face(g, lt > 0.35 ? 'happy' : 'open', 'laugh');
    add(b, 'head', 'rot', -6 * raise); add(g, 'head', 'rot', -6 * raise);
    drawBabyElephant(e);
    const bloom = E.outBack(seg(lt, 0.3, 0.75), 1.3), ctx = view.ctx, pal = P();
    if (bloom > 0) {
      softGlow(cross.x, cross.y, 120 * bloom, pal.diyaFlame, 0.28);
      ctx.save(); ctx.translate(cross.x, cross.y); ctx.rotate(lt * 0.9);
      ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      for (let i = 0; i < 10; i++) {
        const a = (i / 10) * TAU, len = (66 + 10 * Math.sin(i * 1.7)) * bloom, wd = len * 0.24;
        ctx.save(); ctx.rotate(a);
        ctx.strokeStyle = pal.diyaFlame; ctx.globalAlpha = 0.28; ctx.lineWidth = 7;
        ctx.beginPath(); ctx.moveTo(8, 0); ctx.quadraticCurveTo(len * 0.55, -wd, len, 0); ctx.quadraticCurveTo(len * 0.55, wd, 8, 0); ctx.stroke();
        ctx.strokeStyle = i % 2 ? pal.cornerCoral : pal.goldAccent; ctx.globalAlpha = 0.95; ctx.lineWidth = 2.6; ctx.stroke();
        ctx.restore();
      }
      ctx.restore(); ctx.globalAlpha = 1;
      for (let i = 0; i < 10; i++) {
        const a = (i / 10) * TAU + lt * 0.9;
        glint(cross.x + Math.cos(a) * 80 * bloom, cross.y + Math.sin(a) * 80 * bloom, 5 + 2 * Math.sin(lt * 12 + i), a, bloom);
      }
    }
    drawOriginalKids([['boy', b], ['girl', g]]);
    drawSparklers('boy', b, 'R', spB, T, 'bq-b');
    drawSparklers('girl', g, 'R', spG, T + 0.5, 'bq-g');
  };

  // 20.85 – 21.92  The title star glides down and becomes the opening diya flame (seamless loop).
  SHOTS.loopReturn = (lt, dur, T) => {
    const ctx = view.ctx, v = TITLE_VARIANTS.final;
    const fade = 1 - E.inOutQuad(seg(lt, 0.2, 0.56));
    const tmHold = titleMatrix(v, 5, 99);
    if (fade > 0) {
      const shrink = 1 - 0.1 * (1 - fade);
      const M = Mx.mul(tmHold.M, Mx.sc(shrink));
      drawNewGreetingTitle(5, 99, v, { alphaMul: fade, hideStar: true, matrix: M });
    }
    // the opening scene's flame, exactly as frame t = 0 draws it
    const fl0 = rigAnchors(RIGS.diya, diyaPose(398, GROUND + 2, 1.15, 0, { lit: 0.3, seed: 1 })).flame;
    const s0 = Mx.apply(tmHold.M, TITLE_STAR.x, TITLE_STAR.y);
    const k = E.inOutCubic(seg(lt, 0.12, 0.66));
    const cpx = (s0[0] + fl0.x) / 2 + 120, cpy = Math.min(s0[1], fl0.y) - 70;
    const sx = (1 - k) * (1 - k) * s0[0] + 2 * (1 - k) * k * cpx + k * k * fl0.x;
    const sy = (1 - k) * (1 - k) * s0[1] + 2 * (1 - k) * k * cpy + k * k * fl0.y;
    const iris = config.reducedMotion ? (lt > 0.7 ? 1 : 0) : E.inCubic(seg(lt, 0.5, 0.96));
    if (iris >= 1) { drawBase(); renderShotBody(TIMELINE[0], 0, 0); return; }
    if (iris > 0) {
      const R = iris >= 1 ? 2000 : lerp(0, 1500, iris);
      ctx.save(); ctx.beginPath(); ctx.arc(fl0.x, fl0.y, R, 0, TAU); ctx.clip();
      drawBase(); renderShotBody(TIMELINE[0], 0, 0);
      ctx.restore(); resetTf();
      if (iris < 1) {
        ctx.strokeStyle = P().goldAccent; ctx.lineWidth = 3; ctx.globalAlpha = 0.8;
        ctx.beginPath(); ctx.arc(fl0.x, fl0.y, R, 0, TAU); ctx.stroke(); ctx.globalAlpha = 1;
        for (let i = 0; i < 10; i++) { const a = (i / 10) * TAU + lt * 2; glint(fl0.x + Math.cos(a) * R, fl0.y + Math.sin(a) * R, 7, a, 1); }
      }
    }
    if (k < 1) {
      const tw = 1 + 0.25 * Math.sin(lt * 20) * (1 - k);
      glint(sx, sy, lerp(TITLE_STAR.r, 8, k) * tw, (1 - k) * 4, 1);
      if (k > 0) for (let i = 1; i <= 6; i++) {
        const kk = Math.max(0, k - i * 0.03), x = (1 - kk) * (1 - kk) * s0[0] + 2 * (1 - kk) * kk * cpx + kk * kk * fl0.x;
        const y = (1 - kk) * (1 - kk) * s0[1] + 2 * (1 - kk) * kk * cpy + kk * kk * fl0.y;
        dot(x, y, 2.4 - i * 0.3, P().goldAccent, 0.7 - i * 0.1);
      }
    } else if (iris < 1) glint(fl0.x, fl0.y, 8, 0, 1);
  };

  // ---- the authoritative 24-part sequence (spec seconds) ----
  const TIMELINE = [
    { start: 0.0, end: 0.65, shot: 'diyaWelcome' },
    { start: 0.65, end: 1.75, shot: 'greetingTitle', v: 't1' },
    { start: 1.75, end: 2.75, shot: 'sparklerPlay' },
    { start: 2.75, end: 3.65, shot: 'spinnerStarts', wipe: true },
    { start: 3.65, end: 4.3, shot: 'greetingTitle', v: 't2' },
    { start: 4.3, end: 5.35, shot: 'elephantDance' },
    { start: 5.35, end: 5.85, shot: 'starburstTitle' },
    { start: 5.85, end: 7.05, shot: 'sparklerTrail' },
    { start: 7.05, end: 7.75, shot: 'diyaCloseup', wipe: true },
    { start: 7.75, end: 8.55, shot: 'greetingTitle', v: 't3' },
    { start: 8.55, end: 9.7, shot: 'spinnerDance' },
    { start: 9.7, end: 10.65, shot: 'comedyHop', wipe: true },
    { start: 10.65, end: 11.75, shot: 'greetingTitle', v: 't4' },
    { start: 11.75, end: 12.85, shot: 'diyaAndSparkle' },
    { start: 12.85, end: 13.65, shot: 'elephantTrunk', wipe: true },
    { start: 13.65, end: 14.35, shot: 'greetingTitle', v: 't5' },
    { start: 14.35, end: 15.55, shot: 'miniParade' },
    { start: 15.55, end: 16.5, shot: 'spinnerFinale', wipe: true },
    { start: 16.5, end: 17.25, shot: 'flowerStarTitle' },
    { start: 17.25, end: 18.45, shot: 'friendlyGiggle' },
    { start: 18.45, end: 19.0, shot: 'greetingTitle', v: 't6' },
    { start: 19.0, end: 20.05, shot: 'sparkleBouquet' },
    { start: 20.05, end: 20.85, shot: 'finalTitle' },
    { start: 20.85, end: 21.92, shot: 'loopReturn' },
  ];
  TIMELINE.forEach((s, i) => { s.index = i; s.dur = s.end - s.start; });

  const WIPE = 0.24;
  function findSeg(t) {
    for (let i = 0; i < TIMELINE.length; i++) if (t < TIMELINE[i].end) return TIMELINE[i];
    return TIMELINE[TIMELINE.length - 1];
  }
  function renderShotBody(S, lt, T) {
    SHOTS[S.shot](lt, S.dur, T == null ? S.start + lt : T, S);
    resetTf();
  }
  /** Wavy sparkle-match cut: a wavering front sweeps across with a gold seam of glints. */
  function drawSparkleWipe(lt, prev, cur, T) {
    const ctx = view.ctx, p = E.inOutQuad(clamp(lt / WIPE));
    renderShotBody(prev, prev.dur - 0.001);
    const fx = (y) => lerp(-60, W + 60, p) + 18 * Math.sin(y / 64 + 1.3) + 8 * Math.sin(y / 23);
    ctx.save();
    ctx.beginPath(); ctx.moveTo(-30, -30);
    for (let y = -30; y <= H + 30; y += 16) ctx.lineTo(fx(y), y);
    ctx.lineTo(-30, H + 30); ctx.closePath(); ctx.clip();
    drawBase(); renderShotBody(cur, lt, T);
    ctx.restore(); resetTf();
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    for (const [off, col, w] of [[0, P().goldAccent, 4], [-9, P().cornerTurquoise, 2]]) {
      ctx.strokeStyle = col; ctx.lineWidth = w; ctx.globalAlpha = 0.9;
      ctx.beginPath(); ctx.moveTo(fx(-30) + off, -30);
      for (let y = -30; y <= H + 30; y += 16) ctx.lineTo(fx(y) + off, y);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
    const r = rng('wipe', cur.index);
    for (let i = 0; i < 10; i++) { const y = r() * H; glint(fx(y) + (r() - 0.5) * 16, y, 6 + r() * 7, r() * 3 + lt * 6, 1); }
  }
  /** Render the frame at timeline time t (seconds) into ctx at device scale k (canvas.width / 720). */
  function renderFrame(ctx, t, k) {
    setView(ctx, k);
    let tt = t % SPEC_DURATION;
    if (tt < 0) tt += SPEC_DURATION;
    const S = findSeg(tt), lt = tt - S.start;
    drawBase();
    try {
      if (S.wipe && lt < WIPE && !config.reducedMotion) drawSparkleWipe(lt, TIMELINE[S.index - 1], S, tt);
      else renderShotBody(S, lt, tt);
    } catch (e) {
      // never let one bad frame blank the preview or stop an export; report it once per shot
      ctx.restore && ctx.restore();
      if (!renderFrame.reported) renderFrame.reported = {};
      if (!renderFrame.reported[S.shot]) { renderFrame.reported[S.shot] = true; console.error('Frame error in ' + S.shot + ' at t=' + tt.toFixed(3), e); }
    }
    resetTf();
    drawFooter();
  }

  // ════════════════════════════════════════════════════════════════════════════
  // 10. ORIGINAL SOUNDTRACK — composed for this piece and synthesised with Web Audio.
  //     13 bars of 4/4 at ≈142 BPM fill the 21.92 s loop exactly. Music and SFX are rendered
  //     offline (deterministic), the reverb tail is wrapped onto the start so the loop is
  //     seamless, then each bus is peak-normalised (music −6 dBFS, SFX −11 dBFS = −5 dB).
  // ════════════════════════════════════════════════════════════════════════════
  const NOTE = (m) => 440 * Math.pow(2, (m - 69) / 12);

  function composeScore() {
    const ev = [];
    const N = (inst, beat, midi, dur, vel = 1, pan = 0) => ev.push({ inst, beat, midi, dur, vel, pan });
    const put = (inst, bar, motif, o = {}) => motif.forEach(([b, m, d, v = 1]) => N(inst, bar * 4 + b, m + (o.oct || 0), d, v * (o.vel || 1), o.pan || 0));
    const A4 = 69, B4 = 71, D5 = 74, E5 = 76, Fs5 = 78, A5 = 81, B5 = 83, D6 = 86, E6 = 88, Fs6 = 90, A6 = 93;
    // Hook: a rising three-note call (mallet) answered by a falling pentatonic line (flute).
    const call = [[0, A4, 0.5, 0.9], [0.5, B4, 0.5, 0.95], [1, D5, 1.1, 1.1], [2.5, D5, 0.45, 0.7], [3, E5, 0.5, 0.8], [3.5, Fs5, 0.5, 0.9]];
    const call2 = [[0, A4, 0.5, 0.9], [0.5, B4, 0.5, 0.95], [1, D5, 1, 1.1], [2.5, E5, 0.5, 0.8], [3, Fs5, 0.5, 0.9], [3.5, A5, 0.6, 1]];
    const answer = [[0, A5, 0.75, 1], [0.75, Fs5, 0.25, 0.8], [1, E5, 0.5, 0.9], [1.5, D5, 0.5, 0.85], [2, B4, 1, 0.9], [3, A4, 1, 0.8]];
    const answer2 = [[0, B5, 0.5, 1], [0.5, A5, 0.5, 0.9], [1, Fs5, 0.5, 0.9], [1.5, E5, 0.5, 0.85], [2, D5, 2, 1]];
    put('mallet', 0, call, { pan: -0.2 }); put('flute', 1, answer, { pan: 0.2 });
    put('mallet', 2, call2, { pan: -0.2 }); put('flute', 3, answer2, { pan: 0.2 });
    put('mallet', 4, call, { pan: -0.2, vel: 1.05 });
    put('bell', 4, [[1, D6, 1, 0.5], [3.5, A5, 0.5, 0.35]], { pan: 0.3 });
    // softer middle phrase under the elephant hop and the diya scene
    put('flute', 5, [[0, B4, 2, 0.8], [2, A4, 2, 0.72]], { pan: 0.15 });
    put('flute', 6, [[0, E5, 1.5, 0.8], [1.5, D5, 0.5, 0.7], [2, E5, 2, 0.78]], { pan: 0.15 });
    put('flute', 7, [[0, Fs5, 3, 0.85], [3, E5, 1, 0.7]], { pan: 0.15 });
    const arp = (bar, a, b) => { for (let i = 0; i < 8; i++) { const ch = i < 4 || !b ? a : b; N('mallet', bar * 4 + i * 0.5, ch[i % 4], 0.45, i % 2 ? 0.42 : 0.56, -0.25); } };
    arp(5, [67, 71, 74, 79]); arp(6, [64, 67, 71, 76], [69, 73, 76, 81]); arp(7, [71, 74, 78, 83], [69, 73, 76, 81]);
    // the hook returns, with a little skipping bell run for the parade
    put('mallet', 8, call, { pan: -0.2 }); put('flute', 9, answer, { pan: 0.2 }); put('mallet', 10, call2, { pan: -0.2 });
    put('bell', 9, [[2, D6, 0.3, 0.3], [2.25, E6, 0.3, 0.3], [2.5, Fs6, 0.3, 0.32], [2.75, A6, 0.5, 0.36]], { pan: 0.3 });
    // climactic chime flourish, then a stable landing that loops back to the downbeat
    put('flute', 11, answer2, { pan: 0.2 });
    put('bell', 11, [[2, D6, 1, 0.42], [2.5, E6, 1, 0.4], [3, Fs6, 1, 0.4], [3.5, A6, 1.5, 0.46]], { pan: -0.15 });
    put('mallet', 12, [[0, D5, 1.6, 1], [0, Fs5, 1.6, 0.7], [0, A5, 1.6, 0.5]]);
    put('bell', 12, [[0, D6, 2, 0.5], [1, A5, 1, 0.32], [1.5, Fs6, 1, 0.28]], { pan: 0.2 });

    const chords = ['D', 'A', 'Bm', ['A', 'D'], 'D', 'G', ['Em', 'A'], ['Bm', 'A'], 'D', 'A', 'Bm', ['G', 'A'], 'D'];
    const ROOT = { D: 38, Em: 40, G: 43, A: 45, Bm: 47 };
    const TRI = { D: [62, 66, 69], A: [61, 64, 69], Bm: [62, 66, 71], G: [62, 67, 71], Em: [64, 67, 71] };
    chords.forEach((c, bar) => {
      const b0 = bar * 4, soft = bar >= 5 && bar <= 7;
      if (bar < 2) { N('bass', b0, ROOT[c], 3.6, 0.45); return; }
      if (Array.isArray(c)) {
        N('bass', b0, ROOT[c[0]], 0.8, 0.95); N('bass', b0 + 2, ROOT[c[1]], soft ? 1.6 : 0.8, 0.9);
        if (!soft) { N('bass', b0 + 1.5, ROOT[c[0]] + 12, 0.3, 0.5); N('bass', b0 + 3.5, ROOT[c[1]] + 7, 0.4, 0.6); }
      } else if (soft) {
        N('bass', b0, ROOT[c], 1.7, 0.85); N('bass', b0 + 2, ROOT[c] + 7, 1.6, 0.7);
      } else {
        const r = ROOT[c];
        N('bass', b0, r, 0.8, 1); N('bass', b0 + 1.5, r + 12, 0.3, 0.5); N('bass', b0 + 2, r + 7, 0.7, 0.8);
        if (bar < 12) { N('bass', b0 + 3, r, 0.4, 0.6); N('bass', b0 + 3.5, r + 7, 0.4, 0.55); }
      }
      if (!soft) {
        [0.5, 1.5, 2.5, 3.5].forEach((b, i) => {
          const name = Array.isArray(c) ? c[b < 2 ? 0 : 1] : c, tri = TRI[name];
          N('pluck', b0 + b, tri[i % 3], 0.3, i % 2 ? 0.55 : 0.7, 0.35);
          N('pluck', b0 + b, tri[(i + 1) % 3] + 12, 0.3, 0.35, 0.35);
        });
      }
    });
    // percussion: dholak-style "dhum" (bass head), "ta" (treble slap), "na" (ghost), claps, shaker
    const D = (inst, beat, vel) => ev.push({ inst, beat, vel, midi: 0, dur: 0, pan: 0 });
    for (let bar = 0; bar < 13; bar++) {
      const b0 = bar * 4, soft = bar >= 5 && bar <= 7, drive = bar >= 8 && bar <= 10, light = bar <= 1;
      if (soft) {
        D('dhum', b0, 0.7); D('dhum', b0 + 2, 0.55); D('ta', b0 + 1.5, 0.4); D('ta', b0 + 3.5, 0.5); D('clap', b0 + 3, 0.3);
        for (let i = 0; i < 4; i++) D('shaker', b0 + i + 0.5, 0.35);
        continue;
      }
      const half = bar === 12 ? 2 : 4;
      D('dhum', b0, 1); D('dhum', b0 + 1.75, 0.5);
      if (half > 2) D('dhum', b0 + 2, 0.85);
      [[0.5, 0.7], [1.5, 0.55], [2.5, 0.7], [3.5, 0.85]].forEach(([b, v]) => { if (b < half) D('ta', b0 + b, v); });
      [[1, 0.3], [3, 0.32], [3.75, 0.28]].forEach(([b, v]) => { if (b < half) D('na', b0 + b, v); });
      D('clap', b0 + 1, light ? 0.4 : 0.55); if (half > 2) D('clap', b0 + 3, light ? 0.45 : 0.6);
      const step = drive ? 0.25 : 0.5;
      for (let x = 0; x < half; x += step) D('shaker', b0 + x, (x % 1 === 0.5 ? 0.7 : 0.45) * (drive && x % 0.5 ? 0.65 : 1));
    }
    D('ta', 23.5, 0.6); D('ta', 23.75, 0.72);           // little fill as the elephant hops
    D('ta', 27.5, 0.55); D('na', 27.75, 0.5);           // and into the diya scene
    for (let i = 0; i < 4; i++) D('ta', 31 + i * 0.25, 0.35 + i * 0.12);          // build into the hook return
    for (let i = 0; i < 8; i++) D('ta', 50 + i * 0.25, 0.3 + i * 0.075);          // turnaround roll
    D('dhum', 51, 0.7); D('dhum', 51.5, 0.82); D('clap', 51.5, 0.4);
    return ev;
  }

  // ---- synth helpers ----
  function perc(param, t, a, peak, decay) {
    param.setValueAtTime(0, t);
    param.linearRampToValueAtTime(peak, t + a);
    param.setTargetAtTime(0, t + a, decay / 4);
  }
  function osc(ac, type, f, t, stop) {
    const o = ac.createOscillator(); o.type = type; o.frequency.setValueAtTime(f, t); o.start(t); o.stop(stop); return o;
  }
  function amp(ac, v = 0) { const g = ac.createGain(); g.gain.value = v; return g; }
  function panTo(ac, pan, out) {
    if (!pan || !ac.createStereoPanner) return out;
    const p = ac.createStereoPanner(); p.pan.value = pan; p.connect(out); return p;
  }
  function filt(ac, type, f, q = 0.7) { const b = ac.createBiquadFilter(); b.type = type; b.frequency.value = f; b.Q.value = q; return b; }
  function noiseSrc(S, t, stop) {
    const n = S.ac.createBufferSource(); n.buffer = S.noise; n.loop = true;
    n.start(t, S.noiseOff()); n.stop(stop); return n;
  }
  function noiseHit(S, t, type, f, q, peak, decay, bus, attack = 0.001) {
    const g = amp(S.ac); perc(g.gain, t, attack, peak, decay);
    noiseSrc(S, t, t + decay * 2.4 + 0.05).connect(filt(S.ac, type, f, q)).connect(g).connect(bus);
  }
  function noiseSwell(S, t, dur, f0, f1, q, peak, bus) {
    const ac = S.ac, bp = filt(ac, 'bandpass', f0, q), g = amp(ac);
    bp.frequency.setValueAtTime(f0, t); bp.frequency.exponentialRampToValueAtTime(f1, t + dur);
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(peak, t + dur * 0.4); g.gain.linearRampToValueAtTime(0, t + dur);
    noiseSrc(S, t, t + dur + 0.05).connect(bp).connect(g).connect(bus);
  }

  // ---- instruments ----
  function iMallet(S, t, midi, len, vel, pan, bus = S.music) {
    const ac = S.ac, f = NOTE(midi), out = panTo(ac, pan, bus);
    const dec = Math.min(1.2, 0.32 + len * 0.6), stop = t + dec * 1.8 + 0.05;
    const g1 = amp(ac), g2 = amp(ac), g3 = amp(ac);
    perc(g1.gain, t, 0.004, 0.42 * vel, dec); perc(g2.gain, t, 0.002, 0.1 * vel, 0.07); perc(g3.gain, t, 0.003, 0.07 * vel, dec * 0.45);
    osc(ac, 'sine', f, t, stop).connect(g1).connect(out);
    osc(ac, 'sine', f * 4, t, t + 0.3).connect(g2).connect(out);
    osc(ac, 'triangle', f * 2, t, stop).connect(g3).connect(out);
    noiseHit(S, t, 'bandpass', 2600, 1.2, 0.035 * vel, 0.012, out);      // soft mallet strike
  }
  function iFlute(S, t, midi, len, vel, pan) {
    const ac = S.ac, f = NOTE(midi), out = panTo(ac, pan, S.music), end = t + len, stop = end + 0.45;
    const o = ac.createOscillator(), o2 = ac.createOscillator(), lfo = ac.createOscillator();
    o.type = 'triangle'; o2.type = 'sine'; lfo.frequency.value = 5.2;
    o.frequency.setValueAtTime(f * 0.982, t); o.frequency.exponentialRampToValueAtTime(f, t + 0.07);
    o2.frequency.setValueAtTime(f * 2 * 0.982, t); o2.frequency.exponentialRampToValueAtTime(f * 2, t + 0.07);
    const v1 = amp(ac), v2 = amp(ac);
    v1.gain.setValueAtTime(0, t); v1.gain.linearRampToValueAtTime(f * 0.007, t + Math.min(0.3, len));
    v2.gain.setValueAtTime(0, t); v2.gain.linearRampToValueAtTime(f * 0.014, t + Math.min(0.3, len));
    lfo.connect(v1).connect(o.frequency); lfo.connect(v2).connect(o2.frequency);
    const lp = filt(ac, 'lowpass', Math.min(5200, f * 5), 0.4), g = amp(ac), h = amp(ac, 0.22), pk = 0.25 * vel;
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(pk, t + 0.05);
    g.gain.setTargetAtTime(pk * 0.78, t + 0.05, 0.12); g.gain.setTargetAtTime(0, end, 0.06);
    o.connect(lp); o2.connect(h).connect(lp); lp.connect(g).connect(out);
    [o, o2, lfo].forEach((x) => { x.start(t); x.stop(stop); });
    const gn = amp(ac);
    gn.gain.setValueAtTime(0, t); gn.gain.linearRampToValueAtTime(0.055 * vel, t + 0.03);
    gn.gain.setTargetAtTime(0.012 * vel, t + 0.04, 0.05); gn.gain.setTargetAtTime(0, end, 0.05);
    noiseSrc(S, t, stop).connect(filt(ac, 'bandpass', f * 1.6, 1.4)).connect(gn).connect(out);
  }
  function iBell(S, t, midi, vel, pan, decMul = 1, bus = S.music) {
    const ac = S.ac, f = NOTE(midi), out = panTo(ac, pan, bus);
    for (const [ratio, a, dec] of [[1, 1, 1.5], [2, 0.42, 0.9], [2.76, 0.3, 0.65], [5.4, 0.13, 0.32], [8.93, 0.06, 0.18]]) {
      if (f * ratio > 9000) continue;          // keep the top end soft
      const g = amp(ac); perc(g.gain, t, 0.002, 0.12 * vel * a, dec * decMul);
      osc(ac, 'sine', f * ratio, t, t + dec * decMul * 1.6 + 0.05).connect(g).connect(out);
    }
  }
  function iBass(S, t, midi, len, vel) {
    const ac = S.ac, f = NOTE(midi), end = t + len, lp = filt(ac, 'lowpass', 620, 0.7), g = amp(ac), h = amp(ac, 0.4), pk = 0.27 * vel;
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(pk, t + 0.012);
    g.gain.setTargetAtTime(pk * 0.55, t + 0.012, 0.09); g.gain.setTargetAtTime(0, end, 0.05);
    osc(ac, 'sine', f, t, end + 0.4).connect(lp); osc(ac, 'triangle', f, t, end + 0.4).connect(h).connect(lp);
    lp.connect(g).connect(S.music);
  }
  function iPluck(S, t, midi, vel, pan) {
    const ac = S.ac, f = NOTE(midi), out = panTo(ac, pan, S.music), g = amp(ac), g2 = amp(ac);
    perc(g.gain, t, 0.003, 0.11 * vel, 0.32); perc(g2.gain, t, 0.002, 0.042 * vel, 0.06);
    osc(ac, 'sine', f, t, t + 0.7).connect(g).connect(out);
    osc(ac, 'sine', f * 3.01, t, t + 0.2).connect(g2).connect(out);
  }
  function iDhum(S, t, vel) {
    const ac = S.ac, o = ac.createOscillator(), g = amp(ac);
    o.type = 'sine';
    o.frequency.setValueAtTime(128, t); o.frequency.exponentialRampToValueAtTime(74, t + 0.14); o.frequency.linearRampToValueAtTime(81, t + 0.32);
    perc(g.gain, t, 0.003, 0.4 * vel, 0.38);
    o.connect(g).connect(S.music); o.start(t); o.stop(t + 0.6);
    noiseHit(S, t, 'lowpass', 1400, 0.7, 0.09 * vel, 0.03, S.music);
  }
  function iTa(S, t, vel) {
    const ac = S.ac, g = amp(ac), g2 = amp(ac);
    perc(g.gain, t, 0.002, 0.2 * vel, 0.13); perc(g2.gain, t, 0.002, 0.07 * vel, 0.07);
    osc(ac, 'triangle', 415, t, t + 0.3).connect(g).connect(S.music);
    osc(ac, 'sine', 838, t, t + 0.2).connect(g2).connect(S.music);
    noiseHit(S, t, 'bandpass', 3200, 0.9, 0.18 * vel, 0.03, S.music);
  }
  function iNa(S, t, vel) {
    const ac = S.ac, g = amp(ac);
    perc(g.gain, t, 0.002, 0.1 * vel, 0.06);
    osc(ac, 'sine', 560, t, t + 0.15).connect(g).connect(S.music);
    noiseHit(S, t, 'bandpass', 4200, 1.2, 0.05 * vel, 0.02, S.music);
  }
  function iClap(S, t, vel, bus = S.music) {
    [0, 0.011, 0.023].forEach((o) => noiseHit(S, t + o, 'bandpass', 1350, 0.75, 0.28 * vel, 0.012, bus));
    noiseHit(S, t + 0.03, 'bandpass', 1250, 0.7, 0.2 * vel, 0.1, bus);
  }
  function iShaker(S, t, vel) { noiseHit(S, t, 'bandpass', 6400, 0.8, 0.1 * vel, 0.045, S.music, 0.006); }

  // ---- sound effects (soft, cartoon-safe; no explosions) ----
  function sShimmer(S, t, vel = 1, base = 86) {
    [0, 2, 4, 7, 9].forEach((st, i) => iBell(S, t + i * 0.032, base + st, 0.42 * vel, i % 2 ? 0.3 : -0.3, 0.35, S.sfx));
    noiseSwell(S, t, 0.28, 6000, 9000, 2, 0.04 * vel, S.sfx);
  }
  function sSizzle(S, t, dur, vel, pan, key) {
    const ac = S.ac, r = rng('sizzle-' + key), out = panTo(ac, pan, S.sfx);
    const g = amp(ac);
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.03 * vel, t + 0.05);
    g.gain.setValueAtTime(0.03 * vel, t + dur - 0.08); g.gain.linearRampToValueAtTime(0, t + dur);
    noiseSrc(S, t, t + dur + 0.05).connect(filt(ac, 'highpass', 4200, 0.6)).connect(filt(ac, 'bandpass', 8000, 0.5)).connect(g).connect(out);
    const ticks = Math.floor(dur * 50);
    for (let i = 0; i < ticks; i++) noiseHit(S, t + r() * dur, 'highpass', 5000, 0.7, (0.03 + r() * 0.05) * vel, 0.006 + r() * 0.01, out);
    for (let i = 0; i < Math.floor(dur * 9); i++) {
      const tt = t + r() * dur, gg = amp(ac);
      perc(gg.gain, tt, 0.001, 0.025 * vel, 0.03);
      osc(ac, 'sine', 3500 + r() * 2500, tt, tt + 0.08).connect(gg).connect(out);
    }
  }
  function sWhirr(S, t, dur, vel, rate0, rate1) {
    const ac = S.ac, bp = filt(ac, 'bandpass', 850, 4), mod = amp(ac, 0.5), env = amp(ac), lfo = ac.createOscillator(), lg = amp(ac, 0.5);
    bp.frequency.setValueAtTime(850, t); bp.frequency.linearRampToValueAtTime(1300, t + dur);
    lfo.frequency.setValueAtTime(rate0, t); lfo.frequency.linearRampToValueAtTime(rate1, t + dur * 0.6);
    lfo.connect(lg).connect(mod.gain); lfo.start(t); lfo.stop(t + dur + 0.1);
    env.gain.setValueAtTime(0, t); env.gain.linearRampToValueAtTime(0.11 * vel, t + 0.12);
    env.gain.setValueAtTime(0.11 * vel, t + dur - 0.15); env.gain.linearRampToValueAtTime(0, t + dur);
    noiseSrc(S, t, t + dur + 0.05).connect(bp).connect(mod).connect(env).connect(S.sfx);
    const tone = osc(ac, 'triangle', 180, t, t + dur + 0.05), tg = amp(ac);
    tone.frequency.linearRampToValueAtTime(260, t + dur * 0.6);
    tg.gain.setValueAtTime(0, t); tg.gain.linearRampToValueAtTime(0.018 * vel, t + 0.15); tg.gain.linearRampToValueAtTime(0, t + dur);
    tone.connect(tg).connect(S.sfx);
  }
  function sWhirrDown(S, t, dur, vel) {
    const ac = S.ac, bp = filt(ac, 'bandpass', 1300, 4), mod = amp(ac, 0.5), env = amp(ac), lfo = ac.createOscillator(), lg = amp(ac, 0.5);
    bp.frequency.setValueAtTime(1300, t); bp.frequency.exponentialRampToValueAtTime(500, t + dur);
    lfo.frequency.setValueAtTime(14, t); lfo.frequency.setValueAtTime(14, t + dur * 0.55); lfo.frequency.linearRampToValueAtTime(2, t + dur);
    lfo.connect(lg).connect(mod.gain); lfo.start(t); lfo.stop(t + dur + 0.1);
    env.gain.setValueAtTime(0, t); env.gain.linearRampToValueAtTime(0.11 * vel, t + 0.08); env.gain.setValueAtTime(0.11 * vel, t + dur * 0.55); env.gain.linearRampToValueAtTime(0, t + dur);
    noiseSrc(S, t, t + dur + 0.05).connect(bp).connect(mod).connect(env).connect(S.sfx);
  }
  function sBoop(S, t, vel, up) {
    const ac = S.ac, o = osc(ac, 'sine', up ? 170 : 320, t, t + 0.3), g = amp(ac), lp = filt(ac, 'lowpass', 1100);
    o.frequency.exponentialRampToValueAtTime(up ? 340 : 150, t + 0.14);
    perc(g.gain, t, 0.006, 0.3 * vel, 0.18);
    o.connect(lp).connect(g).connect(S.sfx);
    [0.02, 0.07, 0.12].forEach((d, i) => iBell(S, t + d, [100, 103, 98][i], 0.22 * vel, 0.2, 0.25, S.sfx));
  }
  function sTitlePop(S, t, vel, notes) {
    notes.forEach((m, i) => iMallet(S, t + i * 0.055, m, 0.2, 0.75 * vel, i % 2 ? 0.2 : -0.2, S.sfx));
    iBell(S, t + 0.03, notes[notes.length - 1], 0.4 * vel, 0, 0.6, S.sfx);
  }
  function sStep(S, t, vel = 1) {
    noiseHit(S, t, 'lowpass', 700, 0.8, 0.11 * vel, 0.04, S.sfx);
    const g = amp(S.ac), o = osc(S.ac, 'sine', 150, t, t + 0.1);
    o.frequency.exponentialRampToValueAtTime(105, t + 0.06); perc(g.gain, t, 0.003, 0.07 * vel, 0.05);
    o.connect(g).connect(S.sfx);
  }
  function sWhoosh(S, t, dur, vel, f0, f1) { noiseSwell(S, t, dur, f0, f1, 1.1, 0.09 * vel, S.sfx); }
  function sPff(S, t, vel) {
    noiseHit(S, t, 'lowpass', 500, 0.7, 0.15 * vel, 0.14, S.sfx);
    const g = amp(S.ac); perc(g.gain, t, 0.004, 0.09 * vel, 0.12);
    osc(S.ac, 'sine', 95, t, t + 0.3).connect(g).connect(S.sfx);
    [0.05, 0.09, 0.14].forEach((d, i) => iBell(S, t + d, [93, 98, 95][i], 0.22 * vel, i - 1, 0.3, S.sfx));
  }
  function sToot(S, t, vel) {
    const ac = S.ac, o = osc(ac, 'sawtooth', 330, t, t + 0.5), lfo = osc(ac, 'sine', 7, t, t + 0.5), lg = amp(ac, 8), g = amp(ac), lp = filt(ac, 'lowpass', 1100, 5);
    o.frequency.linearRampToValueAtTime(415, t + 0.12);
    lfo.connect(lg).connect(o.frequency);
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.085 * vel, t + 0.03);
    g.gain.setValueAtTime(0.085 * vel, t + 0.24); g.gain.linearRampToValueAtTime(0, t + 0.34);
    o.connect(lp).connect(g).connect(S.sfx);
  }
  function sBoing(S, t, vel) {
    const ac = S.ac, o = osc(ac, 'sine', 300, t, t + 0.6), lfo = osc(ac, 'sine', 8, t, t + 0.6), lg = amp(ac, 25), g = amp(ac);
    o.frequency.linearRampToValueAtTime(190, t + 0.5); lfo.connect(lg).connect(o.frequency);
    perc(g.gain, t, 0.01, 0.12 * vel, 0.5);
    o.connect(g).connect(S.sfx);
  }
  function sWhistle(S, t, vel) {
    const ac = S.ac, o = osc(ac, 'sine', 820, t, t + 0.45), g = amp(ac);
    o.frequency.exponentialRampToValueAtTime(1500, t + 0.4);
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.025 * vel, t + 0.08); g.gain.linearRampToValueAtTime(0, t + 0.42);
    o.connect(g).connect(S.sfx);
  }
  function sGliss(S, t, dur, vel, notes) { notes.forEach((m, i) => iBell(S, t + (i * dur) / notes.length, m, 0.36 * vel, i % 2 ? 0.3 : -0.3, 0.45, S.sfx)); }
  function sChord(S, t, vel) {
    [74, 78, 81, 86].forEach((m, i) => iBell(S, t + i * 0.014, m, 0.45 * vel, (i - 1.5) * 0.2, 1.2, S.sfx));
    iMallet(S, t, 62, 1.2, 0.6 * vel, 0, S.sfx);
  }

  /** Every SFX cue in timeline seconds, synchronised with the visual events of the shots above. */
  function sfxCues() {
    const c = [], at = (time, fn) => c.push([time, fn]);
    at(0.06, (S, t) => sShimmer(S, t, 1, 86));
    at(0.31, (S, t) => sStep(S, t, 0.45)); at(0.45, (S, t) => sStep(S, t, 0.45));
    at(0.65, (S, t) => sTitlePop(S, t, 1, [86, 93]));
    at(1.89, (S, t) => sSizzle(S, t, 0.68, 1, -0.3, 'circle'));
    at(1.95, (S, t) => sWhistle(S, t, 0.8)); at(2.37, (S, t) => sPff(S, t, 0.35));
    at(2.87, (S, t) => sWhirr(S, t, 0.78, 1, 2, 14));
    at(3.31, (S, t) => sStep(S, t, 0.8)); at(3.36, (S, t) => sStep(S, t, 0.8));
    at(3.65, (S, t) => sTitlePop(S, t, 1, [88, 95]));
    [11, 12].forEach((b) => at(b * SPB, (S, t) => sBoop(S, t, 0.75, false)));
    at(5.35, (S, t) => { sWhoosh(S, t, 0.3, 0.8, 900, 4000); sTitlePop(S, t + 0.06, 0.8, [90, 97]); });
    at(5.91, (S, t) => sSizzle(S, t, 0.6, 0.9, -0.1, 'loop'));
    at(6.5, (S, t) => sBoop(S, t, 0.55, true)); at(6.89, (S, t) => sStep(S, t, 0.9));
    [[7.09, 81], [7.2, 83], [7.31, 86]].forEach(([tt, b]) => at(tt, (S, t) => sShimmer(S, t, 0.75, b)));
    at(7.75, (S, t) => sTitlePop(S, t, 1, [86, 90, 93]));
    at(8.6, (S, t) => sWhirr(S, t, 1.05, 0.9, 14, 14));
    [21, 22, 23].forEach((b) => at(b * SPB, (S, t) => sStep(S, t, 0.45)));
    at(9.91, (S, t) => iBell(S, t, 100, 0.5, 0.3, 0.6, S.sfx));
    at(10.0, (S, t) => sBoop(S, t, 0.9, true)); at(10.32, (S, t) => { sBoop(S, t, 0.8, false); sPff(S, t + 0.02, 0.4); });
    at(10.65, (S, t) => sTitlePop(S, t, 1, [86, 93]));
    [10.69, 10.91, 11.13, 11.27].forEach((tt, i) => at(tt, (S, t) => sPff(S, t, 0.55 - i * 0.05)));
    at(11.8, (S, t) => sSizzle(S, t, 1.0, 0.45, 0.4, 'bg'));
    at(11.95, (S, t) => sWhoosh(S, t, 0.55, 0.7, 500, 1500));
    at(12.98, (S, t) => sToot(S, t, 1));
    [13.08, 13.17, 13.26, 13.36, 13.45].forEach((tt, i) => at(tt, (S, t) => iBell(S, t, [93, 98, 95, 100, 97][i], 0.3, i % 2 ? 0.35 : -0.35, 0.3, S.sfx)));
    at(13.65, (S, t) => sTitlePop(S, t, 0.7, [83, 86]));
    [34.5, 35, 35.5, 36, 36.5].forEach((b) => at(b * SPB, (S, t) => sStep(S, t, 0.55)));
    [35, 36].forEach((b) => at(b * SPB + 0.02, (S, t) => iBell(S, t, 98, 0.18, 0, 0.25, S.sfx)));
    at(14.69, (S, t) => sWhistle(S, t, 0.7)); at(15.11, (S, t) => sPff(S, t, 0.3));
    at(15.6, (S, t) => sWhirrDown(S, t, 0.9, 1));
    at(16.41, (S, t) => sPff(S, t, 0.6));
    at(16.5, (S, t) => { sGliss(S, t, 0.28, 0.9, [86, 88, 90, 93, 95]); sTitlePop(S, t + 0.1, 0.6, [93]); });
    at(17.3, (S, t) => sWhoosh(S, t, 0.45, 0.8, 500, 2600));
    at(17.76, (S, t) => sBoing(S, t, 1));
    [17.9, 18.05, 18.2, 18.35].forEach((tt) => at(tt, (S, t) => iClap(S, t, 0.7, S.sfx)));
    at(18.45, (S, t) => { sTitlePop(S, t, 1, [86, 93]); iBell(S, t + 0.12, 98, 0.35, 0.3, 0.5, S.sfx); });
    at(19.02, (S, t) => { sSizzle(S, t, 1.0, 0.7, -0.35, 'bq-b'); sSizzle(S, t + 0.05, 0.95, 0.7, 0.35, 'bq-g'); });
    at(19.32, (S, t) => sGliss(S, t, 0.4, 0.7, [81, 86, 88, 90, 93]));
    at(20.05, (S, t) => { sChord(S, t, 1); sTitlePop(S, t, 0.6, [93]); });
    at(21.0, (S, t) => sGliss(S, t, 0.62, 0.8, [93, 90, 88, 86, 83, 81, 78]));
    at(21.46, (S, t) => sShimmer(S, t, 0.55, 81));
    return c;
  }

  function makeNoiseBuffer(ac, seconds) {
    const len = Math.floor(ac.sampleRate * seconds), buf = ac.createBuffer(1, len, ac.sampleRate), d = buf.getChannelData(0), r = rng('noise');
    for (let i = 0; i < len; i++) d[i] = r() * 2 - 1;
    return buf;
  }
  function makeImpulse(ac, seconds, decay) {
    const len = Math.floor(ac.sampleRate * seconds), buf = ac.createBuffer(2, len, ac.sampleRate);
    for (let c = 0; c < 2; c++) {
      const d = buf.getChannelData(c), r = rng('reverb', c);
      for (let i = 0; i < len; i++) d[i] = (r() * 2 - 1) * Math.pow(1 - i / len, decay);
    }
    return buf;
  }
  function makeSynth(ac, wet) {
    const S = { ac, noise: makeNoiseBuffer(ac, 3) };
    const r = rng('noise-offsets');
    S.noiseOff = () => r() * 2.5;
    const bus = amp(ac, 1), comp = ac.createDynamicsCompressor(), lp = filt(ac, 'lowpass', 11500, 0.5);
    comp.threshold.value = -16; comp.knee.value = 8; comp.ratio.value = 3; comp.attack.value = 0.004; comp.release.value = 0.2;
    const rev = ac.createConvolver(), send = amp(ac, wet);
    rev.buffer = makeImpulse(ac, 1.6, 3.2);
    bus.connect(comp); bus.connect(rev); rev.connect(send).connect(comp);
    comp.connect(lp).connect(ac.destination);
    S.music = bus; S.sfx = bus;
    return S;
  }
  /** Schedules the whole score (which = 'music') or every SFX cue (which = 'sfx') into S, time-scaled. */
  function scheduleOriginalMusicAndSFX(S, timeScale, which) {
    if (which === 'music') {
      const spb = SPB * timeScale;
      for (const e of composeScore()) {
        const t = e.beat * spb, len = e.dur * spb;
        switch (e.inst) {
          case 'mallet': iMallet(S, t, e.midi, len, e.vel, e.pan); break;
          case 'flute': iFlute(S, t, e.midi, len, e.vel, e.pan); break;
          case 'bell': iBell(S, t, e.midi, e.vel, e.pan); break;
          case 'bass': iBass(S, t, e.midi, len, e.vel); break;
          case 'pluck': iPluck(S, t, e.midi, e.vel, e.pan); break;
          case 'dhum': iDhum(S, t, e.vel); break;
          case 'ta': iTa(S, t, e.vel); break;
          case 'na': iNa(S, t, e.vel); break;
          case 'clap': iClap(S, t, e.vel); break;
          case 'shaker': iShaker(S, t, e.vel); break;
          default: break;
        }
      }
    } else {
      for (const [time, fn] of sfxCues()) fn(S, time * timeScale);
    }
  }
  /** Wrap the reverb tail onto the start (seamless loop) and peak-normalise. */
  function foldLoop(buf, N, peakDb) {
    const channels = [];
    let peak = 1e-9;
    for (let c = 0; c < buf.numberOfChannels; c++) {
      const src = buf.getChannelData(c), dst = new Float32Array(N);
      dst.set(src.subarray(0, N));
      for (let i = N; i < src.length; i++) dst[i - N] += src[i];
      for (let i = 0; i < N; i++) { const a = Math.abs(dst[i]); if (a > peak) peak = a; }
      channels.push(dst);
    }
    const g = Math.pow(10, peakDb / 20) / peak;
    channels.forEach((d) => { for (let i = 0; i < N; i++) d[i] *= g; });
    return { channels, sampleRate: buf.sampleRate, length: N };
  }
  /** Offline-render the soundtrack for a loop of loopSec real seconds → { music, sfx } sample data. */
  async function renderSoundtrack(loopSec, sampleRate = 48000) {
    const OAC = window.OfflineAudioContext || window.webkitOfflineAudioContext;
    if (!OAC) throw new Error('Web Audio offline rendering is not supported in this browser.');
    const ts = loopSec / SPEC_DURATION, N = Math.round(loopSec * sampleRate), tail = 2.5;
    const one = async (which) => {
      const ac = new OAC(2, Math.ceil((loopSec + tail) * sampleRate), sampleRate);
      const S = makeSynth(ac, which === 'music' ? 0.16 : 0.22);
      scheduleOriginalMusicAndSFX(S, ts, which);
      const buf = await ac.startRendering();
      return foldLoop(buf, N, which === 'music' ? -6 : -11);
    };
    const [music, sfx] = await Promise.all([one('music'), one('sfx')]);
    return { music, sfx, loopSec, sampleRate };
  }
  function toAudioBuffer(ac, d) {
    const b = ac.createBuffer(d.channels.length, d.length, d.sampleRate);
    d.channels.forEach((ch, i) => b.copyToChannel(ch, i));
    return b;
  }

  // ════════════════════════════════════════════════════════════════════════════
  // 11. PLAYER, UI, RECORDER, BOOT
  // ════════════════════════════════════════════════════════════════════════════
  const $ = (id) => document.getElementById(id);
  const STORE_KEY = 'diwali-spark-parade:v1';
  const ASSET_FILES = ['kids-original.svg', 'baby-elephant.svg', 'diya.svg', 'sparkler-and-chakri.svg'];
  const loopSec = () => config.duration / config.speed;          // real seconds per loop in the preview
  const realPerSpec = () => loopSec() / SPEC_DURATION;

  // ---- live audio: plays the offline-rendered loop; its clock drives the picture ----
  const audio = {
    ac: null, master: null, musicGain: null, sfxGain: null,
    data: null, key: '', pending: null, pendingKey: '', buffers: null, bufKey: '',
    sources: [], playing: false, anchor: 0, startOffset: 0, startedAt: 0, wanted: false,
    ensure() {
      if (!this.ac) {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return null;
        this.ac = new AC({ latencyHint: 'interactive' });
        this.master = this.ac.createGain(); this.master.connect(this.ac.destination);
        this.musicGain = this.ac.createGain(); this.sfxGain = this.ac.createGain();
        this.musicGain.connect(this.master); this.sfxGain.connect(this.master);
        this.applyVolume();
      }
      if (this.ac.state === 'suspended') this.ac.resume();
      return this.ac;
    },
    prepare(sec) {
      const key = sec.toFixed(4);
      if (this.data && this.key === key) return Promise.resolve(this.data);
      if (this.pending && this.pendingKey === key) return this.pending;
      this.pendingKey = key;
      this.pending = renderSoundtrack(sec).then((d) => {
        if (this.pendingKey === key) { this.data = d; this.key = key; this.buffers = null; }
        return d;
      });
      return this.pending;
    },
    start(offsetReal) {
      this.stop();
      if (!this.ac || !this.data) return false;
      if (!this.buffers || this.bufKey !== this.key) {
        this.buffers = { music: toAudioBuffer(this.ac, this.data.music), sfx: toAudioBuffer(this.ac, this.data.sfx) };
        this.bufKey = this.key;
      }
      const L = this.data.loopSec, when = this.ac.currentTime + 0.05, off = ((offsetReal % L) + L) % L;
      for (const [buf, gain] of [[this.buffers.music, this.musicGain], [this.buffers.sfx, this.sfxGain]]) {
        const s = this.ac.createBufferSource();
        s.buffer = buf; s.loop = true; s.loopStart = 0; s.loopEnd = buf.duration;
        s.connect(gain); s.start(when, off);
        this.sources.push(s);
      }
      this.anchor = when - off; this.startOffset = off; this.startedAt = when; this.playing = true;
      return true;
    },
    stop() {
      this.sources.forEach((s) => { try { s.stop(); } catch (e) { /* already stopped */ } s.disconnect(); });
      this.sources = []; this.playing = false;
    },
    position() {
      const L = this.data.loopSec, lat = this.ac.outputLatency || this.ac.baseLatency || 0, now = this.ac.currentTime - lat;
      if (now < this.startedAt) return this.startOffset;
      return (((now - this.anchor) % L) + L) % L;
    },
    applyVolume() {
      if (!this.ac) return;
      const now = this.ac.currentTime;
      this.master.gain.setTargetAtTime(config.muted || !this.wanted ? 0 : config.volume, now, 0.03);
      this.sfxGain.gain.setTargetAtTime(config.sfx ? 1 : 0, now, 0.03);
    },
  };

  // ---- player: 30 fps, frame-quantised, driven by the audio clock when sound is on ----
  const player = { playing: false, t: 0, lastNow: 0, lastFrame: -1, dirty: true, canvas: null, ctx: null };
  const exporter = { active: false, canvas: null };
  const audioDrives = () => player.playing && audio.playing && audio.data && audio.key === loopSec().toFixed(4);
  function drawPreview(t) { renderFrame(player.ctx, t, player.canvas.width / W); }
  function frameLoop(now) {
    requestAnimationFrame(frameLoop);
    if (exporter.active) { player.lastNow = now; return; }
    if (player.playing) {
      if (audioDrives()) player.t = audio.position() / realPerSpec();
      else player.t = (player.t + Math.min(0.1, Math.max(0, (now - player.lastNow) / 1000)) / realPerSpec()) % SPEC_DURATION;
    }
    player.lastNow = now;
    const frame = Math.floor(player.t * realPerSpec() * FPS + 1e-6);
    if (frame !== player.lastFrame || player.dirty) {
      player.lastFrame = frame; player.dirty = false;
      const tq = player.playing ? Math.min(SPEC_DURATION - 1e-4, frame / FPS / realPerSpec()) : player.t;
      drawPreview(tq);
      updateTimeUI(tq);
    }
  }
  function fitCanvas() {
    const c = player.canvas, r = c.getBoundingClientRect();
    if (!r.width) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
    const w = Math.max(180, Math.round(r.width * dpr)), h = Math.round((w * H) / W);
    if (c.width !== w || c.height !== h) { c.width = w; c.height = h; player.dirty = true; }
  }
  function startAudioAtCurrent() {
    if (!audio.ac || !audio.wanted) return;
    const sec = loopSec();
    audio.prepare(sec).then(() => {
      if (player.playing && audio.key === sec.toFixed(4) && !audio.playing) audio.start(player.t * realPerSpec());
    }).catch(showAudioError);
  }
  function setPlaying(on) {
    if (on === player.playing) return;
    player.playing = on;
    if (on) { player.lastNow = performance.now(); startAudioAtCurrent(); }
    else audio.stop();
    updatePlayUI();
  }
  function seek(t) {
    player.t = clamp(t, 0, SPEC_DURATION - 1e-4);
    player.dirty = true;
    if (player.playing && audio.playing) audio.start(player.t * realPerSpec());
  }
  function enableSound() {
    const ac = audio.ensure();
    if (!ac) { setStatus('Web Audio is not available in this browser, so the preview stays silent.'); return; }
    audio.wanted = true; config.muted = false;
    audio.applyVolume(); updateMuteUI(); hidePill();
    if (player.playing) startAudioAtCurrent();
    save();
  }
  function toggleMute() {
    if (config.muted || !audio.wanted) enableSound();
    else { config.muted = true; audio.applyVolume(); updateMuteUI(); save(); }
  }
  function onTimingChange() {
    audio.stop();
    player.dirty = true;
    if (audio.wanted) startAudioAtCurrent();
    updateTimeUI(player.t);
  }
  function showAudioError(e) { setStatus('Could not compose the soundtrack: ' + (e && e.message ? e.message : e)); }

  // ---- export: real-time capture of a dedicated 720×1280 canvas + the soundtrack ----
  /** MediaRecorder writes WebM without a Duration, so players can't show length or seek well.
   *  This writes Segment ▸ Info ▸ Duration (float64, in TimecodeScale units = ms by default). */
  function fixWebmDuration(bytes, durationMs) {
    const vint = (pos) => {
      const b = bytes[pos];
      let len = 1, mask = 0x80;
      while (len <= 8 && !(b & mask)) { len++; mask >>= 1; }
      let val = b & (mask - 1);
      for (let i = 1; i < len; i++) val = val * 256 + bytes[pos + i];
      return { len, val };
    };
    const find = (id, from, to) => {
      for (let i = from; i < to - id.length; i++) if (id.every((v, k) => bytes[i + k] === v)) return i;
      return -1;
    };
    const INFO = [0x15, 0x49, 0xa9, 0x66], DURATION = [0x44, 0x89];
    const at = find(INFO, 0, Math.min(bytes.length, 4096));
    if (at < 0) return bytes;
    const size = vint(at + 4), start = at + 4 + size.len, end = start + size.val;
    const f64 = new Uint8Array(8);
    new DataView(f64.buffer).setFloat64(0, durationMs);
    for (let i = start; i < end;) {
      const isDur = bytes[i] === DURATION[0] && bytes[i + 1] === DURATION[1];
      const idLen = vint(i).len, sz = vint(i + idLen);
      if (isDur) {
        const out = bytes.slice();
        if (sz.val === 8) out.set(f64, i + idLen + sz.len);
        else if (sz.val === 4) new DataView(out.buffer).setFloat32(i + idLen + sz.len, durationMs);
        return out;
      }
      i += idLen + sz.len + sz.val;
    }
    const el = new Uint8Array([0x44, 0x89, 0x88, ...f64]);           // Duration, size 8
    const newSize = size.val + el.length;
    const sizeBytes = new Uint8Array(8);                                // 8-byte EBML size field
    sizeBytes[0] = 0x01;
    for (let i = 7, v = newSize; i >= 1; i--) { sizeBytes[i] = v & 0xff; v = Math.floor(v / 256); }
    const out = new Uint8Array(bytes.length - size.len + 8 + el.length);
    let o = 0;
    out.set(bytes.subarray(0, at + 4), o); o += at + 4;
    out.set(sizeBytes, o); o += 8;
    out.set(bytes.subarray(start, end), o); o += end - start;
    out.set(el, o); o += el.length;
    out.set(bytes.subarray(end), o);
    return out;
  }
  /** Records exactly one loop as WebM (VP9/VP8 + Opus) at 30 fps. Returns a Blob. */
  async function recordVideo(onProgress) {
    if (exporter.active) throw new Error('Already recording.');
    if (typeof MediaRecorder === 'undefined' || !HTMLCanvasElement.prototype.captureStream) {
      throw new Error('This browser cannot record canvas video (MediaRecorder / captureStream missing). Try a recent Chrome, Edge or Firefox.');
    }
    const ac = audio.ensure();
    if (!ac) throw new Error('Web Audio is not available, so the soundtrack cannot be recorded.');
    exporter.active = true;
    const wasPlaying = player.playing;
    setPlaying(false);
    try {
      const sec = config.duration;
      onProgress(0, 'Composing the soundtrack…');
      const data = audio.key === sec.toFixed(4) && audio.data ? audio.data : await renderSoundtrack(sec);
      if (!exporter.canvas) {
        exporter.canvas = document.createElement('canvas');
        exporter.canvas.className = 'export-canvas';
        exporter.canvas.setAttribute('aria-hidden', 'true');
        document.body.appendChild(exporter.canvas);
      }
      const cv = exporter.canvas;
      cv.width = W; cv.height = H;
      const cctx = cv.getContext('2d', { alpha: false });
      renderFrame(cctx, 0, 1);
      renderFrame(cctx, 0, 1);         // second pass so frame 0 matches the loop's last frame exactly
      let vstream = cv.captureStream(0);
      let vtrack = vstream.getVideoTracks()[0];
      const manual = !!vtrack && typeof vtrack.requestFrame === 'function';
      if (!manual) { vstream = cv.captureStream(FPS); vtrack = vstream.getVideoTracks()[0]; }
      const dest = ac.createMediaStreamDestination();
      const stream = new MediaStream([vtrack, ...dest.stream.getAudioTracks()]);
      const mime = ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm'].find((m) => MediaRecorder.isTypeSupported(m)) || '';
      const rec = new MediaRecorder(stream, mime ? { mimeType: mime, videoBitsPerSecond: 8000000, audioBitsPerSecond: 192000 } : {});
      const chunks = [];
      rec.ondataavailable = (e) => { if (e.data && e.data.size) chunks.push(e.data); };
      const stopped = new Promise((res) => { rec.onstop = res; });
      const srcs = [];
      [[data.music, 1], [data.sfx, config.sfx ? 1 : 0]].forEach(([d, gv]) => {
        const s = ac.createBufferSource(), g = ac.createGain();
        s.buffer = toAudioBuffer(ac, d); g.gain.value = gv;
        s.connect(g); g.connect(dest);
        if (audio.wanted && !config.muted) g.connect(audio.master);      // monitor while recording
        srcs.push(s);
      });
      const startAt = ac.currentTime + 0.2;
      srcs.forEach((s) => s.start(startAt));
      await new Promise((res) => {                       // begin capture ~1 frame before the downbeat
        const poll = () => (ac.currentTime >= startAt - 0.03 ? res() : setTimeout(poll, 2));
        poll();
      });
      rec.start(500);
      if (manual) vtrack.requestFrame();
      const total = Math.round(sec * FPS);
      let last = 0;
      onProgress(0, 'Recording… keep this tab visible');
      await new Promise((resolve) => {
        let timer = 0;
        const step = () => {
          const el = ac.currentTime - startAt;
          const f = Math.min(total - 1, Math.floor(el * FPS));
          if (el >= 0 && f > last) {
            renderFrame(cctx, (f / FPS) * (SPEC_DURATION / sec), 1);
            if (manual) vtrack.requestFrame();
            last = f;
            onProgress(clamp(el / sec));
          }
          if (el >= sec + 0.1) { clearInterval(timer); resolve(); return; }
          requestAnimationFrame(step);
        };
        timer = setInterval(() => { if (document.hidden) step(); }, 16);
        requestAnimationFrame(step);
      });
      rec.stop();
      await stopped;
      srcs.forEach((s) => { try { s.stop(); } catch (e) { /* ended */ } s.disconnect(); });
      vstream.getTracks().forEach((tr) => tr.stop());
      dest.stream.getTracks().forEach((tr) => tr.stop());
      const raw = new Uint8Array(await new Blob(chunks).arrayBuffer());
      let fixed = raw;
      try { fixed = fixWebmDuration(raw, (sec + 0.03) * 1000); } catch (e) { /* keep the raw file */ }
      return new Blob([fixed], { type: 'video/webm' });
    } finally {
      exporter.active = false;
      player.dirty = true;
      if (wasPlaying) setPlaying(true);
    }
  }

  // ---- UI ----
  const SHOT_LABEL = (s) => s.replace(/([A-Z])/g, ' $1').replace(/^./, (c) => c.toUpperCase());
  const fmt = (x) => x.toFixed(2);
  let lastUiUpdate = 0;
  function updateTimeUI(t) {
    const now = performance.now();
    if (player.playing && now - lastUiUpdate < 90) return;
    lastUiUpdate = now;
    const scrub = $('scrub');
    if (scrub && document.activeElement !== scrub) scrub.value = String(t);
    const k = config.duration / SPEC_DURATION;
    if ($('timeNow')) $('timeNow').textContent = fmt(t * k);
    if ($('timeTotal')) $('timeTotal').textContent = fmt(config.duration);
    if ($('shotName')) $('shotName').textContent = SHOT_LABEL(findSeg(t).shot);
  }
  function updatePlayUI() {
    const b = $('playBtn');
    if (!b) return;
    b.dataset.state = player.playing ? 'playing' : 'paused';
    b.setAttribute('aria-label', player.playing ? 'Pause' : 'Play');
    b.title = player.playing ? 'Pause (Space)' : 'Play (Space)';
  }
  function updateMuteUI() {
    const b = $('muteBtn'), on = audio.wanted && !config.muted;
    if (!b) return;
    b.dataset.state = on ? 'on' : 'muted';
    b.setAttribute('aria-pressed', on ? 'false' : 'true');
    b.setAttribute('aria-label', on ? 'Mute sound' : 'Turn sound on');
    b.title = on ? 'Mute (M)' : 'Sound on (M)';
  }
  function hidePill() { const p = $('soundPill'); if (p) p.hidden = true; }
  function setStatus(msg) { const s = $('exportStatus'); if (s) s.textContent = msg; }
  function updateCaption() {
    const c = $('caption');
    if (c) c.textContent = `${titleCase(config.line1)} ${titleCase(config.line2)}! Wishing your home light, laughter and a sky full of little sparkles.`;
    const cv = player.canvas;
    if (cv) cv.setAttribute('aria-label', `Animated greeting reading “${config.line1} ${config.line2}”: two children and a baby elephant light diyas, wave sparklers, skip in a little parade and watch a colourful chakri spin.`);
  }
  const titleCase = (s) => String(s || '').toLowerCase().replace(/(^|\s)\S/g, (c) => c.toUpperCase());
  const COLOR_FIELDS = ['backgroundCream', 'titleDeepPlum', 'titleVermilion', 'titleShadow', 'cornerTurquoise', 'cornerCoral', 'goldAccent'];
  function applyPreset(name) {
    const pr = PRESETS[name] || PRESETS.original;
    config.preset = name;
    config.palette = Object.assign({}, DEFAULT_PALETTE, pr.colors);
    syncColorInputs();
    document.documentElement.style.setProperty('--stage-bg', config.palette.backgroundCream);
    player.dirty = true;
  }
  function syncColorInputs() {
    document.querySelectorAll('input[data-token]').forEach((el) => { el.value = config.palette[el.dataset.token].toLowerCase(); });
  }
  function save() {
    try {
      const { line1, line2, brand, brandSub, showFooter, duration, speed, volume, sfx, reducedMotion, grain, preset, palette } = config;
      localStorage.setItem(STORE_KEY, JSON.stringify({ line1, line2, brand, brandSub, showFooter, duration, speed, volume, sfx, reducedMotion, grain, preset, palette }));
    } catch (e) { /* storage unavailable: settings simply aren't remembered */ }
  }
  function restore() {
    try {
      const raw = localStorage.getItem(STORE_KEY);
      if (!raw) return;
      const s = JSON.parse(raw);
      ['line1', 'line2', 'brand', 'brandSub'].forEach((k) => { if (typeof s[k] === 'string') config[k] = s[k]; });
      ['showFooter', 'sfx', 'reducedMotion', 'grain'].forEach((k) => { if (typeof s[k] === 'boolean') config[k] = s[k]; });
      if (s.duration >= 8 && s.duration <= 60) config.duration = s.duration;
      if ([0.5, 0.75, 1, 1.5].includes(s.speed)) config.speed = s.speed;
      if (s.volume >= 0 && s.volume <= 1) config.volume = s.volume;
      if (PRESETS[s.preset]) config.preset = s.preset;
      if (s.palette && typeof s.palette === 'object') {
        config.palette = Object.assign({}, DEFAULT_PALETTE);
        Object.keys(DEFAULT_PALETTE).forEach((k) => { if (/^#[0-9a-f]{6}$/i.test(s.palette[k] || '')) config.palette[k] = s.palette[k]; });
      }
    } catch (e) { /* ignore corrupt or blocked storage */ }
  }
  function syncUI() {
    const v = (id, val) => { const el = $(id); if (el) el.value = val; };
    const c = (id, val) => { const el = $(id); if (el) el.checked = val; };
    v('line1', config.line1); v('line2', config.line2); v('brand', config.brand); v('brandSub', config.brandSub);
    c('showFooter', config.showFooter); c('reduced', config.reducedMotion); c('sfx', config.sfx); c('grain', config.grain);
    v('preset', config.preset); v('duration', String(config.duration)); v('speed', String(config.speed)); v('volume', String(config.volume));
    const scrub = $('scrub'); if (scrub) scrub.max = String(SPEC_DURATION);
    syncColorInputs(); updateCaption(); updatePlayUI(); updateMuteUI(); updateTimeUI(player.t);
    document.documentElement.style.setProperty('--stage-bg', config.palette.backgroundCream);
  }
  function bindUI() {
    const on = (id, ev, fn) => { const el = $(id); if (el) el.addEventListener(ev, fn); };
    on('playBtn', 'click', () => setPlaying(!player.playing));
    on('restartBtn', 'click', () => { seek(0); if (!player.playing) setPlaying(true); });
    on('scrub', 'input', (e) => seek(parseFloat(e.target.value)));
    on('muteBtn', 'click', toggleMute);
    on('soundPill', 'click', enableSound);
    on('volume', 'input', (e) => { config.volume = parseFloat(e.target.value); if (config.volume > 0 && config.muted) config.muted = false; if (!audio.wanted) enableSound(); audio.applyVolume(); updateMuteUI(); save(); });
    on('speed', 'change', (e) => { config.speed = parseFloat(e.target.value); onTimingChange(); save(); });
    on('reduced', 'change', (e) => { config.reducedMotion = e.target.checked; player.dirty = true; save(); });
    on('sfx', 'change', (e) => { config.sfx = e.target.checked; audio.applyVolume(); save(); });
    on('grain', 'change', (e) => { config.grain = e.target.checked; player.dirty = true; save(); });
    on('showFooter', 'change', (e) => { config.showFooter = e.target.checked; player.dirty = true; save(); });
    const text = (id, key, upper, max) => on(id, 'input', (e) => {
      let val = e.target.value.slice(0, max);
      if (upper) val = val.toUpperCase();
      config[key] = val; player.dirty = true; updateCaption(); save();
    });
    text('line1', 'line1', true, 14); text('line2', 'line2', true, 12); text('brand', 'brand', false, 28); text('brandSub', 'brandSub', false, 28);
    on('preset', 'change', (e) => { applyPreset(e.target.value); save(); });
    document.querySelectorAll('input[data-token]').forEach((el) => el.addEventListener('input', () => {
      config.palette[el.dataset.token] = el.value;
      if (el.dataset.token === 'backgroundCream') document.documentElement.style.setProperty('--stage-bg', el.value);
      player.dirty = true; save();
    }));
    on('duration', 'change', (e) => {
      const d = clamp(parseFloat(e.target.value) || SPEC_DURATION, 8, 60);
      config.duration = d; e.target.value = String(d); onTimingChange(); save();
      const btn = $('exportBtn'); if (btn) btn.textContent = `Record WebM (${d.toFixed(1)} s)`;
    });
    on('resetBtn', 'click', () => {
      Object.assign(config, { line1: 'HAPPY', line2: 'DIWALI', brand: 'Your Studio', brandSub: 'Festive Motion', showFooter: true, duration: SPEC_DURATION, speed: 1, sfx: true, grain: true });
      applyPreset('original'); syncUI(); onTimingChange(); save();
      const btn = $('exportBtn'); if (btn) btn.textContent = `Record WebM (${SPEC_DURATION.toFixed(1)} s)`;
    });
    on('exportBtn', 'click', async () => {
      const btn = $('exportBtn'), prog = $('exportProg'), bar = $('exportBar'), label = $('exportLabel'), link = $('downloadLink');
      btn.disabled = true; prog.hidden = false; link.hidden = true; setStatus('');
      try {
        const blob = await recordVideo((p, msg) => {
          bar.style.width = (p * 100).toFixed(1) + '%';
          label.textContent = msg || `${Math.round(p * 100)}%`;
        });
        if (link.href && link.href.startsWith('blob:')) URL.revokeObjectURL(link.href);
        link.href = URL.createObjectURL(blob);
        link.download = 'diwali-spark-parade.webm';
        link.hidden = false;
        label.textContent = `Done · ${(blob.size / 1048576).toFixed(1)} MB`;
        bar.style.width = '100%';
        setStatus('Saved as WebM. Use the FFmpeg command below for an MP4.');
        link.click();
      } catch (e) {
        setStatus(e && e.message ? e.message : String(e));
        prog.hidden = true;
      } finally {
        btn.disabled = false;
      }
    });
    on('copyCmd', 'click', async () => {
      const txt = $('ffmpegCmd').textContent;
      try { await navigator.clipboard.writeText(txt); $('copyCmd').textContent = 'Copied'; }
      catch (e) { const r = document.createRange(); r.selectNodeContents($('ffmpegCmd')); const sel = getSelection(); sel.removeAllRanges(); sel.addRange(r); }
      setTimeout(() => { $('copyCmd').textContent = 'Copy command'; }, 1600);
    });
    window.addEventListener('keydown', (e) => {
      const tag = (e.target && e.target.tagName) || '';
      if (/INPUT|SELECT|TEXTAREA|BUTTON/.test(tag) && e.key !== 'Escape') { if (!(tag === 'INPUT' && e.target.type === 'range')) return; }
      if (e.key === ' ' || e.key === 'k') { e.preventDefault(); setPlaying(!player.playing); }
      else if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
        if (tag === 'INPUT') return;
        e.preventDefault(); setPlaying(false);
        const step = (e.shiftKey ? 1 : 1 / FPS) / realPerSpec() * (e.key === 'ArrowRight' ? 1 : -1);
        seek((player.t + step + SPEC_DURATION) % SPEC_DURATION);
      } else if (e.key === 'r' || e.key === 'R') { seek(0); }
      else if (e.key === 'm' || e.key === 'M') toggleMute();
    });
  }

  // ---- asset loading ----
  async function loadAllRigs() {
    const bundle = window.DIWALI_SVG_BUNDLE || {};
    const canFetch = /^https?:$/.test(location.protocol);
    const texts = await Promise.all(ASSET_FILES.map(async (f) => {
      if (canFetch) {
        try { const r = await fetch('assets/' + f, { cache: 'no-cache' }); if (r.ok) return await r.text(); } catch (e) { /* fall back to the bundle */ }
      }
      if (bundle[f]) return bundle[f];
      throw new Error('Missing asset assets/' + f);
    }));
    const rigs = {};
    texts.forEach((t, i) => Object.assign(rigs, loadRigs(t, ASSET_FILES[i])));
    ['boy', 'girl', 'elephant', 'diya', 'sparkler', 'chakri'].forEach((n) => { if (!rigs[n]) throw new Error('Rig "' + n + '" not found in the SVG assets'); });
    return rigs;
  }
  const FONT_FILES = [['Fredoka', 600, 'fredoka-latin-600-normal.woff2'], ['Fredoka', 700, 'fredoka-latin-700-normal.woff2'],
    ['Baloo 2', 700, 'baloo-2-latin-700-normal.woff2'], ['Baloo 2', 800, 'baloo-2-latin-800-normal.woff2']];
  /** Registers the OFL title fonts: from assets/fonts over http(s), from the offline bundle on file://. */
  async function loadFonts() {
    if (!window.FontFace || !document.fonts) return;
    const bundle = window.DIWALI_FONT_BUNDLE || {}, served = /^https?:$/.test(location.protocol);
    const b64 = (str) => { const bin = atob(str), u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); return u.buffer; };
    const all = Promise.all(FONT_FILES.map(async ([family, weight, file]) => {
      let src = null;
      if (served) src = `url("assets/fonts/${file}") format("woff2")`;
      else if (bundle[file]) src = b64(bundle[file]);
      if (!src) return;
      try { document.fonts.add(await new FontFace(family, src, { weight: String(weight), style: 'normal', display: 'swap' }).load()); }
      catch (e) { if (served && bundle[file]) { try { document.fonts.add(await new FontFace(family, b64(bundle[file]), { weight: String(weight) }).load()); } catch (e2) { /* system font fallback */ } } }
    }));
    await Promise.race([all, new Promise((r) => setTimeout(r, 3000))]).catch(() => {});
  }

  // ---- developer rig sheet (?sheet) ----
  function drawRigSheet(ctx, k) {
    setView(ctx, k);
    drawBase();
    const T = 1.3, lab = (s, x, y) => { ctx.fillStyle = P().footerInk; ctx.font = '600 13px ' + ROUND_STACK; ctx.textAlign = 'center'; ctx.fillText(s, x, y); };
    const rows = [300, 600, 900];
    const a = kidPose(130, 1, T, 1); drawKid('boy', withY(a, rows[0])); lab('boy idle', 130, rows[0] + 24);
    const b = kidPose(360, 1, T, 2); armsUp(b, 1); face(b, 'happy', 'laugh'); drawKid('girl', withY(b, rows[0])); lab('girl cheer', 360, rows[0] + 24);
    const c = elePose(570, 1, T, 3); drawBabyElephant(withY(c, rows[0])); lab('elephant idle', 570, rows[0] + 24);
    const d = kidPose(130, 1, T, 1); kidCrouch(d, 'boy', 1); withY(d, rows[1]); reachArmWorld(RIGS.boy, d, 'R', 190, rows[1] - 60); face(d, 'wide', 'o'); drawKid('boy', d); lab('boy crouch + reach', 130, rows[1] + 24);
    const e = kidPose(360, 1, T, 2); withY(e, rows[1]); reachArm(RIGS.girl, e, 'L', [-6, -102]); reachArm(RIGS.girl, e, 'R', [6, -102]); face(e, 'happy', 'giggle'); drawKid('girl', e); lab('girl clap', 360, rows[1] + 24);
    const f = elePose(570, 1, T, 3); eleTrunkUp(f, 1); face(f, 'happy', 'open'); withY(f, rows[1]); drawBabyElephant(f); lab('trunk up', 570, rows[1] + 24);
    const g = kidPose(130, 1, T, 1); withY(g, rows[2]); const sp = aimSparkler(RIGS.boy, g, 'L', { x: 70, y: rows[2] - 170 }); drawKid('boy', g); drawSparklers('boy', g, 'L', sp, T, 'sheet'); lab('boy sparkler', 130, rows[2] + 24);
    const h = kidPose(360, -1, T, 2); kidCrouch(h, 'girl', 1); withY(h, rows[2]); face(h, 'dizzy', 'wobble'); drawKid('girl', h); lab('girl crouch (flipped)', 360, rows[2] + 24);
    drawDiya(diyaPose(540, rows[2] + 2, 1.2, T, { seed: 2 })); drawChakri(640, rows[2] - 4, 1.2, 0.5); lab('diya · chakri', 590, rows[2] + 24);
    resetTf();
  }
  function withY(p, y) { p.y += y - p.gy; p.gy = y; return p; }

  // ---- public hooks (used by tools/render-video.mjs and the self-test) ----
  let offscreen = null;
  /** Render timeline time t into an offscreen canvas of (720·k)×(1280·k) and return it. */
  function renderAt(t, k = 1) {
    if (!offscreen) offscreen = document.createElement('canvas');
    const w = Math.round(W * k), h = Math.round(H * k);
    const ctx = offscreen.getContext('2d', { alpha: false });
    if (offscreen.width !== w || offscreen.height !== h || !offscreen.warm) {
      offscreen.width = w; offscreen.height = h;
      renderFrame(ctx, t, w / W);      // warm-up: a pattern's first draw can differ by ±2/255
      offscreen.warm = true;
    }
    renderFrame(ctx, t, w / W);
    return offscreen;
  }
  function selfTest() {
    const gaps = [];
    TIMELINE.forEach((s, i) => { if (i && Math.abs(s.start - TIMELINE[i - 1].end) > 1e-9) gaps.push(i); });
    return {
      segments: TIMELINE.length,
      contiguous: gaps.length === 0 && TIMELINE[0].start === 0,
      end: TIMELINE[TIMELINE.length - 1].end,
      framesPerLoop: Math.round(config.duration * FPS),
      beatsPerLoop: BEATS, bpm: +(60 / SPB).toFixed(2),
      wipes: TIMELINE.filter((s) => s.wipe).length,
      titleAppearances: TIMELINE.filter((s) => /Title/i.test(s.shot)).length,
      rigs: RIGS ? Object.keys(RIGS) : [],
      shotsImplemented: TIMELINE.every((s) => typeof SHOTS[s.shot] === 'function'),
    };
  }
  window.DiwaliParade = {
    version: '1.0.0', config, timeline: TIMELINE, palette: DEFAULT_PALETTE, presets: PRESETS,
    renderAt, renderFrame: (ctx, t, k = 1) => renderFrame(ctx, t, k), renderSoundtrack, selfTest,
    play: () => setPlaying(true), pause: () => setPlaying(false), seek, enableSound,
    recordVideo: () => recordVideo(() => {}),
    get ready() { return !!RIGS; },
  };

  // ---- boot ----
  async function boot() {
    player.canvas = $('scene');
    if (!player.canvas) return;
    player.ctx = player.canvas.getContext('2d', { alpha: false });
    const q = new URLSearchParams(location.search);
    restore();
    if (q.has('reset')) { config.palette = Object.assign({}, DEFAULT_PALETTE); config.preset = 'original'; }
    if (q.has('reduced')) config.reducedMotion = q.get('reduced') !== '0';
    fitCanvas();
    if (window.ResizeObserver) new ResizeObserver(fitCanvas).observe(player.canvas);
    window.addEventListener('resize', fitCanvas);
    try {
      RIGS = await loadAllRigs();
    } catch (e) {
      const lt = $('loaderText');
      if (lt) lt.textContent = 'Could not load the artwork: ' + e.message;
      throw e;
    }
    await loadFonts();
    fontsReady = true;
    bindUI();
    syncUI();
    const loader = $('loader');
    if (loader) loader.hidden = true;
    document.body.classList.add('is-ready');
    if (q.has('sheet')) { drawRigSheet(player.ctx, player.canvas.width / W); return; }
    player.t = clamp(parseFloat(q.get('t')) || 0, 0, SPEC_DURATION - 1e-4);
    player.dirty = true;
    const pill = $('soundPill');
    if (pill) pill.hidden = false;
    if (!q.has('paused') && !reducedByOS) setPlaying(true);
    updatePlayUI();
    requestAnimationFrame(frameLoop);
    if (!q.has('nosound')) setTimeout(() => { audio.prepare(loopSec()).catch(() => {}); }, 600);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
