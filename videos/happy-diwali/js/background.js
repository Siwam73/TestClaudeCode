/* background.js — asset loading, paper background, corner blobs, ground and
 * the brand badge (The Dev Loop logo) that sits at the bottom of every scene. */
(function () {
  'use strict';
  const DL = window.DL;
  const { W, H, GROUND, ellipse, circle, rng, kf, E, prog, clamp } = DL;

  DL.COLORS = {
    paper: '#FAF7EA',
    blob: '#9DA168',
    blobDark: '#93985F',
    blobLight: '#A6AB73',
    ground: '#686A4A',
    navy: '#0A0E1A',
    navy2: '#111A2E',
    cyan: '#22D3EE',
  };

  /** Load embedded fonts + logo. Resolves when everything is ready to draw. */
  DL.loadAssets = async function () {
    const A = window.DL_ASSETS;
    const loads = A.fonts.map((f) => {
      const ff = new FontFace(f.family, f.src, { weight: f.weight });
      document.fonts.add(ff);
      return ff.load();
    });
    const img = new Image();
    img.src = A.logo;
    await img.decode();
    DL.logo = img;
    await Promise.all(loads);
  };

  // ---------- paper texture (generated once per output scale) ----------
  let paperCache = null;
  function paperTexture(scale) {
    const w = Math.round(W * scale), h = Math.round(H * scale);
    if (paperCache && paperCache.width === w && paperCache.height === h) return paperCache;
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    const x = c.getContext('2d');
    const r = rng(7);
    // soft low-frequency mottling (compresses well in video)
    for (let i = 0; i < 90; i++) {
      const cx = r() * w, cy = r() * h, rad = (60 + r() * 180) * scale;
      const g = x.createRadialGradient(cx, cy, 0, cx, cy, rad);
      const warm = r() < 0.5;
      g.addColorStop(0, warm ? 'rgba(214,200,150,0.05)' : 'rgba(255,255,255,0.08)');
      g.addColorStop(1, 'rgba(255,255,255,0)');
      x.fillStyle = g;
      x.fillRect(cx - rad, cy - rad, rad * 2, rad * 2);
    }
    // faint fibres
    x.lineCap = 'round';
    for (let i = 0; i < 260; i++) {
      const cx = r() * w, cy = r() * h, len = (6 + r() * 22) * scale, a = r() * Math.PI;
      x.strokeStyle = `rgba(150,140,100,${0.03 + r() * 0.04})`;
      x.lineWidth = (0.6 + r() * 0.8) * scale;
      x.beginPath();
      x.moveTo(cx, cy);
      x.quadraticCurveTo(cx + Math.cos(a) * len * 0.5 + (r() - 0.5) * 6 * scale, cy + Math.sin(a) * len * 0.5, cx + Math.cos(a) * len, cy + Math.sin(a) * len);
      x.stroke();
    }
    // vignette
    const vg = x.createRadialGradient(w / 2, h * 0.46, h * 0.12, w / 2, h * 0.5, h * 0.78);
    vg.addColorStop(0, 'rgba(255,255,248,0)');
    vg.addColorStop(1, 'rgba(206,196,150,0.16)');
    x.fillStyle = vg;
    x.fillRect(0, 0, w, h);
    paperCache = c;
    return c;
  }

  DL.drawBackground = function (ctx, t, scale) {
    ctx.fillStyle = DL.COLORS.paper;
    ctx.fillRect(0, 0, W, H);
    ctx.drawImage(paperTexture(scale), 0, 0, W, H);
    drawBlobs(ctx, t);
  };

  // ---------- olive corner blobs ----------
  function blobShape(ctx, circles) {
    ctx.beginPath();
    for (const [x, y, r] of circles) {
      ctx.moveTo(x + r, y);
      ctx.arc(x, y, r, 0, Math.PI * 2);
    }
  }
  function drawBlob(ctx, circles, dots, gx, gy, t, seed) {
    const breathe = 1 + Math.sin(t * 1.3 + seed) * 0.008;
    ctx.save();
    ctx.translate(gx, gy);
    ctx.scale(breathe, breathe);
    ctx.translate(-gx, -gy);
    const g = ctx.createRadialGradient(gx, gy, 10, gx, gy, 170);
    g.addColorStop(0, DL.COLORS.blobDark);
    g.addColorStop(1, DL.COLORS.blobLight);
    blobShape(ctx, circles);
    ctx.fillStyle = g;
    ctx.fill('nonzero');
    // watercolour edge: slightly darker rim
    ctx.save();
    blobShape(ctx, circles);
    ctx.clip('nonzero');
    ctx.globalAlpha = 0.18;
    ctx.strokeStyle = '#7E8550';
    ctx.lineWidth = 6;
    for (const [x, y, r] of circles) {
      circle(ctx, x, y, r);
      ctx.stroke();
    }
    ctx.restore();
    ctx.fillStyle = DL.COLORS.blob;
    for (const [x, y, rx, ry, rot] of dots) {
      ellipse(ctx, x, y, rx, ry, rot);
      ctx.fill();
    }
    ctx.restore();
  }
  function drawBlobs(ctx, t) {
    drawBlob(
      ctx,
      [[672, 18, 60], [618, 6, 34], [706, 84, 46], [646, 60, 30], [700, 126, 20]],
      [[552, 64, 7, 10.5, -0.4], [571, 89, 5, 7, -0.4]],
      720, 0, t, 0
    );
    drawBlob(
      ctx,
      [[34, 1266, 60], [90, 1282, 38], [12, 1204, 40], [58, 1230, 28], [-6, 1170, 22]],
      [[132, 1222, 7, 10.5, 0.5], [114, 1247, 5, 7, 0.5]],
      0, 1280, t, 2
    );
  }

  // ---------- ground (world space; the camera scrolls it during the chase) ----------
  const groundBits = (() => {
    const r = rng(42);
    const out = [];
    let x = 760;
    while (x < 9000) {
      x += 90 + r() * 150;
      const kind = r() < 0.45 ? 'tuft' : r() < 0.7 ? 'pebble' : 'dash';
      out.push({ x, kind, s: 0.7 + r() * 0.6, k: r() });
    }
    return out;
  })();

  DL.drawGround = function (ctx, camX, alpha, startX = 95) {
    if (alpha <= 0) return;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.strokeStyle = DL.COLORS.ground;
    ctx.lineCap = 'round';
    ctx.lineWidth = 1.9;
    const x0 = Math.max(-10, startX - camX);
    ctx.beginPath();
    ctx.moveTo(x0, GROUND);
    ctx.lineTo(W + 10, GROUND);
    ctx.stroke();
    for (const b of groundBits) {
      const x = b.x - camX;
      if (x < -30 || x > W + 30) continue;
      if (b.kind === 'tuft') {
        ctx.strokeStyle = '#7F8657';
        ctx.lineWidth = 1.6;
        ctx.beginPath();
        for (let i = -1; i <= 1; i++) {
          ctx.moveTo(x + i * 3 * b.s, GROUND);
          ctx.quadraticCurveTo(x + i * 4 * b.s, GROUND - 5 * b.s, x + i * 6 * b.s, GROUND - (8 - Math.abs(i) * 2) * b.s);
        }
        ctx.stroke();
      } else if (b.kind === 'pebble') {
        ellipse(ctx, x, GROUND - 2 * b.s, 5 * b.s, 3 * b.s);
        ctx.fillStyle = '#C9C09A';
        ctx.fill();
        ctx.strokeStyle = '#8D8A66';
        ctx.lineWidth = 1.2;
        ctx.stroke();
      } else {
        ctx.strokeStyle = 'rgba(104,106,74,0.55)';
        ctx.lineWidth = 1.4;
        ctx.beginPath();
        ctx.moveTo(x, GROUND + 7);
        ctx.lineTo(x + 14 * b.s, GROUND + 7);
        ctx.stroke();
      }
    }
    ctx.restore();
  };

  // ---------- brand badge ----------
  DL.BADGE = { x: 360, y: 1040, r: 44 };

  /** Draw The Dev Loop logo as a round badge. */
  DL.drawLogo = function (ctx, x, y, r, opts = {}) {
    const img = DL.logo;
    if (!img) return;
    ctx.save();
    if (opts.shadow !== false) {
      ctx.shadowColor = 'rgba(40,40,20,0.22)';
      ctx.shadowBlur = r * 0.35;
      ctx.shadowOffsetY = r * 0.08;
    }
    // the PNG is a circle on a transparent square; draw it edge to edge
    ctx.drawImage(img, x - r, y - r, r * 2, r * 2);
    ctx.restore();
  };

  DL.drawBadge = function (ctx, t) {
    const T = DL.T;
    if (t >= T.wipe) return; // the end card takes the logo from here
    const b = DL.BADGE;
    // gentle intro pop, then a pulse right before it opens into the end card
    const intro = 1;
    const pulse = kf(t, [[T.wipe - 0.35, 1], [T.wipe - 0.12, 1.16, 'outQuad'], [T.wipe, 1.0, 'inQuad']]);
    const s = intro * pulse;
    if (s <= 0) return;
    DL.drawLogo(ctx, b.x, b.y, b.r * s);
  };
})();
