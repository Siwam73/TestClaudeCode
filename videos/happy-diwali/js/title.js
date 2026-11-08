/* title.js — the rocket's grand finale: a comic explosion that reveals the
 * "Happy Diwali" title, then fireworks + sparkles while it holds. */
(function () {
  'use strict';
  const DL = window.DL;
  const { T, kf, E, clamp, lerp, prog, TAU, fillStroke, circle, ellipse, star4, noise1 } = DL;

  const C = { x: 360, y: 640 }; // explosion / title centre
  DL.TITLE = C;

  const PAL = ['#F7B500', '#F57C00', '#E53935', '#FFD54A'];

  // ------------------------------------------------------------ explosion
  const puffs = Array.from({ length: 15 }, (_, i) => ({
    a: (i / 15) * TAU + (DL.r01(i, 11) - 0.5) * 0.3,
    r: 36 + DL.r01(i, 12) * 16,
    spin: (DL.r01(i, 13) - 0.5) * 2,
    out: 0.85 + DL.r01(i, 14) * 0.4,
  }));
  const confetti = Array.from({ length: 70 }, (_, i) => ({
    a: DL.r01(i, 21) * TAU,
    v: 260 + DL.r01(i, 22) * 420,
    life: 0.7 + DL.r01(i, 23) * 0.9,
    kind: Math.floor(DL.r01(i, 24) * 3),
    col: PAL[Math.floor(DL.r01(i, 25) * 4)],
    rot: DL.r01(i, 26) * TAU,
    spin: (DL.r01(i, 27) - 0.5) * 14,
    s: 0.7 + DL.r01(i, 28) * 0.8,
  }));

  function drawPuff(ctx, x, y, r, a) {
    if (r <= 0.5 || a <= 0) return;
    ctx.save();
    ctx.globalAlpha *= a;
    circle(ctx, x, y, r);
    ctx.fillStyle = '#FFF4DD';
    ctx.fill();
    ctx.save();
    circle(ctx, x, y, r);
    ctx.clip();
    circle(ctx, x + r * 0.5, y + r * 0.62, r * 0.74);
    ctx.fillStyle = '#FBDDB8';
    ctx.fill();
    circle(ctx, x + r * 0.72, y + r * 0.84, r * 0.56);
    ctx.fillStyle = '#F6BE86';
    ctx.fill();
    ctx.restore();
    circle(ctx, x, y, r);
    ctx.strokeStyle = '#BF6A2C';
    ctx.lineWidth = 2.8;
    ctx.stroke();
    ctx.restore();
  }

  function jagged(ctx, x, y, rOut, rIn, n, rot) {
    ctx.beginPath();
    for (let i = 0; i < n * 2; i++) {
      const rr = i % 2 === 0 ? rOut * (0.85 + 0.15 * DL.r01(i, 31)) : rIn;
      const a = rot + (i / (n * 2)) * TAU;
      const px = x + Math.cos(a) * rr, py = y + Math.sin(a) * rr;
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.closePath();
  }

  function drawExplosion(ctx, tau) {
    const { x, y } = C;
    // flash
    if (tau < 0.2) {
      const k = tau / 0.2;
      const g = ctx.createRadialGradient(x, y, 0, x, y, 60 + k * 220);
      g.addColorStop(0, `rgba(255,255,235,${0.95 * (1 - k)})`);
      g.addColorStop(1, 'rgba(255,240,200,0)');
      ctx.fillStyle = g;
      circle(ctx, x, y, 60 + k * 220);
      ctx.fill();
    }
    // cloud ring
    const D = kf(tau, [[0, 12], [0.14, 92, 'outBack'], [0.42, 112, 'outQuad'], [1.25, 330, 'outCubic']]);
    const sc = kf(tau, [[0, 0.3], [0.14, 1, 'outBack'], [0.5, 1.05], [1.25, 0.25, 'inQuad']]);
    const fade = 1 - prog(tau, 0.75, 1.25);
    if (tau < 0.5) {
      // solid middle of the cloud before it breaks apart
      const r = kf(tau, [[0, 10], [0.14, 105, 'outBack'], [0.36, 112], [0.5, 40, 'inQuad']]);
      drawPuff(ctx, x, y, r, 1);
    }
    for (const p of puffs) {
      const d = D * p.out;
      const px = x + Math.cos(p.a + p.spin * 0.05 * tau) * d;
      const py = y + Math.sin(p.a + p.spin * 0.05 * tau) * d * 0.92;
      drawPuff(ctx, px, py, p.r * sc, fade);
    }
    // fiery core
    if (tau < 0.62) {
      const k = kf(tau, [[0.02, 0.2], [0.16, 1, 'outBack'], [0.4, 1.05], [0.62, 0, 'inQuad']]);
      jagged(ctx, x, y, 118 * k, 78 * k, 16, tau * 0.6);
      ctx.fillStyle = '#F7941D';
      ctx.fill();
      jagged(ctx, x, y, 88 * k, 56 * k, 14, -tau * 0.8 + 0.2);
      ctx.fillStyle = '#FFC93C';
      ctx.fill();
      const g = ctx.createRadialGradient(x, y, 0, x, y, 70 * k + 1);
      g.addColorStop(0, 'rgba(255,250,220,0.95)');
      g.addColorStop(1, 'rgba(255,220,120,0)');
      ctx.fillStyle = g;
      circle(ctx, x, y, 70 * k + 1);
      ctx.fill();
    }
    // rays
    if (tau > 0.36 && tau < 1.05) {
      const k = prog(tau, 0.36, 1.05);
      ctx.save();
      ctx.lineCap = 'round';
      for (let i = 0; i < 26; i++) {
        const a = (i / 26) * TAU + DL.r01(i, 41) * 0.2;
        const r0 = 120 + E.outCubic(k) * 120 + DL.r01(i, 42) * 30;
        const len = (40 + DL.r01(i, 43) * 40) * (1 - k);
        ctx.strokeStyle = i % 3 === 0 ? '#E53935' : i % 2 ? '#F7B500' : '#F57C00';
        ctx.lineWidth = 5 * (1 - k) + 1;
        ctx.beginPath();
        ctx.moveTo(x + Math.cos(a) * r0, y + Math.sin(a) * r0);
        ctx.lineTo(x + Math.cos(a) * (r0 + len), y + Math.sin(a) * (r0 + len));
        ctx.stroke();
      }
      ctx.restore();
    }
    // confetti
    for (const c of confetti) {
      const tt = tau - 0.08;
      if (tt <= 0 || tt > c.life) continue;
      const drag = (1 - Math.exp(-2.2 * tt)) / 2.2;
      const px = x + Math.cos(c.a) * (50 + c.v * drag);
      const py = y + Math.sin(c.a) * (50 + c.v * drag) + 240 * tt * tt;
      const a = 1 - prog(tt, c.life * 0.6, c.life);
      ctx.save();
      ctx.globalAlpha *= a;
      ctx.translate(px, py);
      ctx.rotate(c.rot + c.spin * tt);
      ctx.fillStyle = c.col;
      ctx.strokeStyle = c.col;
      if (c.kind === 0) ctx.fillRect(-4 * c.s, -2 * c.s, 8 * c.s, 4 * c.s);
      else if (c.kind === 1) {
        circle(ctx, 0, 0, 3 * c.s);
        ctx.fill();
      } else {
        ctx.lineWidth = 2.2;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(-6 * c.s, 0);
        ctx.quadraticCurveTo(-3 * c.s, -4 * c.s, 0, 0);
        ctx.quadraticCurveTo(3 * c.s, 4 * c.s, 6 * c.s, 0);
        ctx.stroke();
      }
      ctx.restore();
    }
  }

  // ------------------------------------------------------------ title art
  const BURSTS = [
    { x: 38, y: -168, n: 13, a0: -168, a1: -12, r0: 14, r1: 54, d: 0.0 },
    { x: -212, y: -12, n: 9, a0: -215, a1: -40, r0: 10, r1: 36, d: 0.12 },
    { x: 206, y: -66, n: 9, a0: -150, a1: 25, r0: 10, r1: 36, d: 0.2 },
  ];
  const STARS = [
    { x: -128, y: -128, r: 19, d: 0.05 },
    { x: -222, y: 66, r: 11, d: 0.18 },
    { x: 222, y: 46, r: 12, d: 0.25 },
    { x: 140, y: -170, r: 8, d: 0.3 },
    { x: -60, y: -190, r: 6, d: 0.34 },
  ];

  function drawBurst(ctx, b, k, t) {
    if (k <= 0) return;
    ctx.save();
    ctx.translate(b.x, b.y);
    ctx.lineCap = 'round';
    for (let i = 0; i < b.n; i++) {
      const u = i / (b.n - 1);
      const a = ((b.a0 + (b.a1 - b.a0) * u) * Math.PI) / 180;
      const long = i % 2 === 0;
      const r0 = b.r0 * (long ? 1 : 1.3);
      const r1 = (long ? b.r1 : b.r1 * 0.7) * (1 + 0.04 * Math.sin(t * 5 + i));
      const rr = lerp(r0, r1, E.outBack(k));
      ctx.strokeStyle = i % 3 === 0 ? '#E53935' : long ? '#F7B500' : '#F57C00';
      ctx.lineWidth = long ? 4.2 : 3.4;
      ctx.beginPath();
      ctx.moveTo(Math.cos(a) * r0, Math.sin(a) * r0);
      ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
      ctx.stroke();
      if (long && k > 0.6) {
        circle(ctx, Math.cos(a) * (rr + 7), Math.sin(a) * (rr + 7), 2.2);
        ctx.fillStyle = '#F7B500';
        ctx.fill();
      }
    }
    ctx.restore();
  }

  function drawSwirl(ctx, x, y, s, k) {
    if (k <= 0) return;
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(s * E.outBack(k), s * E.outBack(k));
    ctx.strokeStyle = '#E8892B';
    ctx.lineWidth = 2.2;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.arc(0, 0, 8, Math.PI * 0.9, Math.PI * 2.4);
    ctx.arc(9, -3, 6, Math.PI * 1.1, Math.PI * 2.5);
    ctx.stroke();
    ctx.restore();
  }

  /** "Happy Diwali" lettering. scale/alpha animate the pop; k = decoration progress. */
  function drawTitle(ctx, t, scale, decor, underline) {
    ctx.save();
    ctx.translate(C.x, C.y);
    ctx.scale(scale, scale);

    // decorations behind the words
    BURSTS.forEach((b) => drawBurst(ctx, b, prog(decor, b.d, b.d + 0.45), t));
    drawSwirl(ctx, 214, 6, 1.1, prog(decor, 0.3, 0.6));
    drawSwirl(ctx, -196, -70, 0.9, prog(decor, 0.35, 0.65));

    // underline swoosh (drawn on)
    if (underline > 0) {
      ctx.save();
      ctx.lineCap = 'round';
      ctx.strokeStyle = '#F5B400';
      const L1 = 360;
      ctx.setLineDash([L1, L1]);
      ctx.lineDashOffset = L1 * (1 - E.outCubic(underline));
      ctx.lineWidth = 7.5;
      ctx.beginPath();
      ctx.moveTo(-168, 84);
      ctx.quadraticCurveTo(-10, 56, 172, 66);
      ctx.stroke();
      const L2 = 200;
      ctx.setLineDash([L2, L2]);
      ctx.lineDashOffset = L2 * (1 - E.outCubic(prog(underline, 0.35, 1)));
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.moveTo(-56, 100);
      ctx.quadraticCurveTo(30, 88, 112, 92);
      ctx.stroke();
      ctx.restore();
    }

    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineJoin = 'round';

    // "Diwali"
    ctx.save();
    ctx.translate(-4, 14);
    ctx.rotate(-0.06);
    ctx.font = '110px Mogra';
    // 3D extrusion
    for (let i = 7; i >= 1; i--) {
      ctx.fillStyle = '#E07A00';
      ctx.strokeStyle = '#E07A00';
      ctx.lineWidth = 15;
      ctx.strokeText('Diwali', i * 0.5, i);
      ctx.fillText('Diwali', i * 0.5, i);
    }
    ctx.strokeStyle = '#FFC21A';
    ctx.lineWidth = 15;
    ctx.strokeText('Diwali', 0, 0);
    const g = ctx.createLinearGradient(0, -50, 0, 45);
    g.addColorStop(0, '#EF3B2D');
    g.addColorStop(1, '#B3121B');
    ctx.fillStyle = g;
    ctx.fillText('Diwali', 0, 0);
    // glossy highlight
    ctx.save();
    ctx.globalCompositeOperation = 'source-atop';
    ctx.fillStyle = 'rgba(255,255,255,0.16)';
    ctx.fillRect(-200, -60, 400, 34);
    ctx.restore();
    ctx.restore();

    // "Happy"
    ctx.save();
    ctx.translate(30, -76);
    ctx.rotate(-0.09);
    ctx.font = '68px Galada';
    ctx.strokeStyle = '#FFF8E6';
    ctx.lineWidth = 9;
    ctx.strokeText('Happy', 0, 0);
    ctx.fillStyle = '#3B3A1E';
    ctx.fillText('Happy', 0, 0);
    ctx.restore();

    // twinkling stars on top
    STARS.forEach((s, i) => {
      const k = E.outBack(prog(decor, s.d, s.d + 0.35));
      if (k <= 0) return;
      const tw = 0.82 + 0.22 * Math.sin(t * 4.2 + i * 1.7);
      star4(ctx, s.x, s.y, s.r * k * tw, 0);
      ctx.fillStyle = '#F7B500';
      ctx.fill();
    });
    ctx.restore();
  }

  // ------------------------------------------------------------ hold-time fireworks
  const FIREWORKS = [
    { t: 15.75, x: 150, y: 300, col: '#FFC94A', r: 78 },
    { t: 16.35, x: 585, y: 270, col: '#FF5C8A', r: 84 },
    { t: 17.05, x: 360, y: 215, col: '#22D3EE', r: 70 },
    { t: 17.8, x: 120, y: 470, col: '#FF8A1F', r: 60 },
    { t: 18.45, x: 610, y: 450, col: '#FFC94A', r: 64 },
    { t: 19.15, x: 225, y: 210, col: '#7BD389', r: 72 },
    { t: 19.85, x: 505, y: 200, col: '#FF5C8A', r: 76 },
    { t: 20.6, x: 360, y: 300, col: '#FFC94A', r: 66 },
  ];
  DL.FIREWORKS = FIREWORKS;
  function drawFirework(ctx, f, t) {
    const rise = 0.42;
    const tau = t - f.t;
    if (tau < 0 || tau > rise + 1.3) return;
    ctx.save();
    ctx.lineCap = 'round';
    if (tau < rise) {
      const k = E.outQuad(tau / rise);
      const y = f.y + 170 * (1 - k);
      ctx.strokeStyle = 'rgba(240,170,60,0.7)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(f.x, y + 26);
      ctx.lineTo(f.x, y);
      ctx.stroke();
      circle(ctx, f.x, y, 2.6);
      ctx.fillStyle = '#FFE9A8';
      ctx.fill();
    } else {
      const b = tau - rise;
      const n = 26;
      const fadeOut = 1 - prog(b, 0.55, 1.3);
      if (b < 0.12) {
        const g = ctx.createRadialGradient(f.x, f.y, 0, f.x, f.y, 40);
        g.addColorStop(0, `rgba(255,255,230,${0.9 * (1 - b / 0.12)})`);
        g.addColorStop(1, 'rgba(255,255,230,0)');
        ctx.fillStyle = g;
        circle(ctx, f.x, f.y, 40);
        ctx.fill();
      }
      for (let i = 0; i < n; i++) {
        const a = (i / n) * TAU + DL.r01(i, f.t * 100) * 0.12;
        const sp = f.r * (0.85 + 0.25 * DL.r01(i, f.t * 100 + 1));
        const d = sp * (1 - Math.exp(-3.2 * b)) * 1.05;
        const sag = 34 * b * b;
        const x2 = f.x + Math.cos(a) * d, y2 = f.y + Math.sin(a) * d + sag;
        const d1 = Math.max(0, d - 14 - 10 * (1 - b));
        const x1 = f.x + Math.cos(a) * d1, y1 = f.y + Math.sin(a) * d1 + sag * 0.8;
        ctx.globalAlpha = fadeOut;
        ctx.strokeStyle = f.col;
        ctx.lineWidth = 2.6 * (1 - b * 0.5);
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.stroke();
        if (i % 2 === 0) {
          const tw = 0.5 + 0.5 * Math.sin(t * 40 + i);
          circle(ctx, x2, y2, 1.8 + tw);
          ctx.fillStyle = '#FFF6D6';
          ctx.fill();
        }
      }
    }
    ctx.restore();
  }

  const DUST = Array.from({ length: 34 }, (_, i) => ({
    x: 120 + DL.r01(i, 51) * 480,
    y0: 760 - DL.r01(i, 52) * 120,
    sp: 18 + DL.r01(i, 53) * 26,
    ph: DL.r01(i, 54) * 10,
    r: 1.4 + DL.r01(i, 55) * 1.8,
  }));
  function drawSparkleDust(ctx, t, a) {
    if (a <= 0) return;
    ctx.save();
    for (const d of DUST) {
      const life = 4.5;
      const u = ((t + d.ph) % life) / life;
      const y = d.y0 - u * d.sp * life;
      const x = d.x + Math.sin((t + d.ph) * 1.3) * 10;
      const tw = 0.5 + 0.5 * Math.sin(t * 6 + d.ph * 3);
      ctx.globalAlpha = a * Math.sin(Math.PI * u) * (0.4 + 0.6 * tw);
      star4(ctx, x, y, d.r * 2.6, 0, 0.2);
      ctx.fillStyle = '#F2B01E';
      ctx.fill();
    }
    ctx.restore();
  }

  // ------------------------------------------------------------ entry point
  DL.drawCelebration = function (ctx, t) {
    const tau = t - T.boom;
    // fireworks sit behind everything else
    FIREWORKS.forEach((f) => drawFirework(ctx, f, t));
    drawSparkleDust(ctx, t, prog(tau, 1.2, 2.2));
    if (tau < 1.4) drawExplosion(ctx, tau);
    // title pop
    const scale = kf(tau, [[0.04, 0.0], [0.07, 0.25], [0.3, 1.13, 'outBack'], [0.48, 0.96, 'inOutQuad'], [0.64, 1.0, 'inOutQuad']]);
    if (scale <= 0) return;
    const breathe = 1 + 0.012 * Math.sin((t - T.boom) * 2.2) * prog(tau, 0.8, 1.4);
    const decor = prog(tau, 0.5, 1.6);
    const underline = prog(tau, 0.42, 0.85);
    drawTitle(ctx, t, scale * breathe, decor, underline);
  };
})();
