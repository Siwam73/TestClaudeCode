/* props.js — the glass bottle, the Diwali rocket (with flame, smoke, sparks)
 * and a few small helpers for deterministic particle emission. */
(function () {
  'use strict';
  const DL = window.DL;
  const { TAU, clamp, lerp, rng, hash, noise1, fillStroke, ellipse, circle, OUTLINE } = DL;

  /** Deterministic emitter: calls fn(te, age, i) for every particle emitted at
   *  a fixed rate in [t0, t1] that is still alive at time t. */
  DL.emit = function (t, t0, t1, rate, life, fn) {
    const dt = 1 / rate;
    const iStart = Math.max(0, Math.ceil((t - life - t0) / dt - 1e-9));
    const iEnd = Math.floor((Math.min(t, t1) - t0) / dt + 1e-9);
    for (let i = iStart; i <= iEnd; i++) {
      const te = t0 + i * dt;
      const age = t - te;
      if (age < 0 || age > life) continue;
      fn(te, age, i);
    }
  };
  /** Stable pseudo-random in [0,1) from an index and a salt. */
  DL.r01 = (i, salt = 0) => (hash(i * 7919 + salt * 104729) + 1) / 2;

  // ------------------------------------------------------------------ bottle
  const BOTTLE = new Path2D(
    'M -15,-2 Q -15,0 -12,0 L 12,0 Q 15,0 15,-2 L 15,-38 C 15,-46 6,-48 5.5,-55 L 5.5,-69 L 6.5,-70 L 6.5,-74 L -6.5,-74 L -6.5,-70 L -5.5,-69 L -5.5,-55 C -6,-48 -15,-46 -15,-38 Z'
  );
  DL.BOTTLE_H = 74;

  /** Glass bottle; (x, y) is the centre of its base. Tips around its base-left corner. */
  DL.drawBottle = function (ctx, x, y, tip = 0, drawInside) {
    ctx.save();
    ctx.translate(x - 15, y);
    ctx.rotate(-tip);
    ctx.translate(15, 0);
    if (drawInside) drawInside(ctx);
    ctx.fillStyle = 'rgba(128,146,84,0.5)';
    ctx.fill(BOTTLE);
    // inner tint + highlight
    ctx.save();
    ctx.clip(BOTTLE);
    ctx.fillStyle = 'rgba(80,98,48,0.25)';
    ctx.fillRect(5, -80, 14, 82);
    ctx.strokeStyle = 'rgba(255,255,240,0.75)';
    ctx.lineCap = 'round';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(-9, -8);
    ctx.lineTo(-9, -34);
    ctx.stroke();
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.moveTo(-3, -60);
    ctx.lineTo(-3, -68);
    ctx.stroke();
    ctx.restore();
    ctx.lineJoin = 'round';
    ctx.strokeStyle = '#4C5832';
    ctx.lineWidth = 2.2;
    ctx.stroke(BOTTLE);
    // lip ring
    ctx.strokeStyle = '#4C5832';
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.moveTo(-6.5, -70);
    ctx.lineTo(6.5, -70);
    ctx.stroke();
    ctx.restore();
  };

  // ------------------------------------------------------------------ rocket
  /** Rocket in local space points along +x. (x, y) = body centre, a = heading.
   *  o.flame 0..1, o.fuse 0..1 remaining fuse, o.t time (for flicker). */
  DL.drawRocket = function (ctx, x, y, a, o = {}) {
    const t = o.t || 0;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(a);
    if (o.flame > 0) drawFlame(ctx, t, o.flame);
    // stick
    ctx.lineCap = 'round';
    ctx.strokeStyle = '#6B4A22';
    ctx.lineWidth = 4.6;
    ctx.beginPath();
    ctx.moveTo(-12, 8.5);
    ctx.lineTo(-84, 8.5);
    ctx.stroke();
    ctx.strokeStyle = '#D29B57';
    ctx.lineWidth = 2.4;
    ctx.stroke();
    // body
    ctx.save();
    DL.rrect(ctx, -17, -6.8, 34, 13.6, 2.5);
    ctx.fillStyle = '#D9302C';
    ctx.fill();
    ctx.clip();
    ctx.fillStyle = '#F7C744';
    for (let i = -4; i <= 4; i++) {
      ctx.beginPath();
      ctx.moveTo(i * 9 - 3, -8);
      ctx.lineTo(i * 9 + 2, -8);
      ctx.lineTo(i * 9 + 8, 8);
      ctx.lineTo(i * 9 + 3, 8);
      ctx.closePath();
      ctx.fill();
    }
    ctx.fillStyle = 'rgba(255,255,255,0.28)';
    ctx.fillRect(-17, -6.8, 34, 3.2);
    ctx.fillStyle = 'rgba(80,0,0,0.18)';
    ctx.fillRect(-17, 3, 34, 4);
    ctx.restore();
    DL.rrect(ctx, -17, -6.8, 34, 13.6, 2.5);
    ctx.strokeStyle = '#5A1E12';
    ctx.lineWidth = 2;
    ctx.stroke();
    // nose cone
    ctx.beginPath();
    ctx.moveTo(16, -8.5);
    ctx.quadraticCurveTo(26, -6, 33, 0);
    ctx.quadraticCurveTo(26, 6, 16, 8.5);
    ctx.closePath();
    fillStroke(ctx, '#C62828', 2, '#5A1E12');
    ctx.fillStyle = 'rgba(255,255,255,0.3)';
    ctx.beginPath();
    ctx.moveTo(18, -6);
    ctx.quadraticCurveTo(25, -4.5, 29, -1.5);
    ctx.lineTo(19, -2.5);
    ctx.closePath();
    ctx.fill();
    // tail cap
    ctx.fillStyle = '#7A2A1A';
    ctx.fillRect(-19, -5, 3, 10);
    // fuse
    if (o.fuse > 0) {
      const L = 11 * o.fuse;
      ctx.strokeStyle = '#3D2B1F';
      ctx.lineWidth = 1.8;
      ctx.beginPath();
      ctx.moveTo(-19, 0);
      ctx.quadraticCurveTo(-19 - L * 0.5, 4, -19 - L, 2 + Math.sin(L) * 1.5);
      ctx.stroke();
      if (o.burning) {
        const fx = -19 - L, fy = 2 + Math.sin(L) * 1.5;
        drawSparkle(ctx, fx, fy, t, 1.5);
      }
    }
    ctx.restore();
  };

  function drawFlame(ctx, t, k) {
    const f1 = noise1(t * 22, 3), f2 = noise1(t * 31, 9);
    const len = (30 + f1 * 9) * k;
    const wid = 8.5 + f2 * 1.6;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const g = ctx.createRadialGradient(-22, 0, 0, -22, 0, 34 * k + 6);
    g.addColorStop(0, 'rgba(255,200,90,0.55)');
    g.addColorStop(1, 'rgba(255,120,40,0)');
    ctx.fillStyle = g;
    circle(ctx, -22, 0, 34 * k + 6);
    ctx.fill();
    ctx.restore();
    const layer = (L, w, col) => {
      ctx.beginPath();
      ctx.moveTo(-17, -w);
      ctx.bezierCurveTo(-17 - L * 0.35, -w * 1.15, -17 - L * 0.8, -w * 0.4, -17 - L, f2 * 1.5);
      ctx.bezierCurveTo(-17 - L * 0.8, w * 0.4, -17 - L * 0.35, w * 1.15, -17, w);
      ctx.closePath();
      ctx.fillStyle = col;
      ctx.fill();
    };
    layer(len, wid, '#FF6A1A');
    layer(len * 0.72, wid * 0.72, '#FFB12E');
    layer(len * 0.42, wid * 0.45, '#FFF2B8');
  }

  /** Tiny crackling spark cluster (fuse, sparkler). */
  function drawSparkle(ctx, x, y, t, s) {
    ctx.save();
    ctx.translate(x, y);
    ctx.globalCompositeOperation = 'lighter';
    const g = ctx.createRadialGradient(0, 0, 0, 0, 0, 12 * s);
    g.addColorStop(0, 'rgba(255,230,140,0.9)');
    g.addColorStop(1, 'rgba(255,150,40,0)');
    ctx.fillStyle = g;
    circle(ctx, 0, 0, 12 * s);
    ctx.fill();
    const fr = Math.floor(t * 30);
    ctx.strokeStyle = '#FFE38A';
    ctx.lineWidth = 1.4;
    ctx.lineCap = 'round';
    for (let i = 0; i < 10; i++) {
      const a = DL.r01(fr * 13 + i, 5) * TAU;
      const r1 = (4 + DL.r01(fr * 13 + i, 6) * 11) * s;
      ctx.beginPath();
      ctx.moveTo(Math.cos(a) * 2, Math.sin(a) * 2);
      ctx.lineTo(Math.cos(a) * r1, Math.sin(a) * r1);
      ctx.stroke();
    }
    ctx.restore();
  }
  DL.drawSparkle = drawSparkle;

  /** Soft smoke puff. */
  DL.drawPuff = function (ctx, x, y, r, a, col = '216,210,192') {
    if (a <= 0 || r <= 0) return;
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, `rgba(${col},${0.75 * a})`);
    g.addColorStop(0.6, `rgba(${col},${0.45 * a})`);
    g.addColorStop(1, `rgba(${col},0)`);
    ctx.fillStyle = g;
    circle(ctx, x, y, r);
    ctx.fill();
  };

  /** Cartoon dust cloud: little outlined puffs. */
  DL.drawDust = function (ctx, x, y, age, life, seed, size = 1) {
    const k = clamp(age / life);
    const a = 1 - k;
    if (a <= 0) return;
    ctx.save();
    ctx.globalAlpha *= a * 0.9;
    for (let i = 0; i < 3; i++) {
      const ox = (i - 1) * 7 * size - k * 10 * size;
      const oy = -k * 8 * size - (i === 1 ? 3 : 0);
      const r = (4 + DL.r01(seed * 3 + i, 2) * 3) * size * (0.6 + k * 0.9);
      circle(ctx, x + ox, y + oy, r);
      fillStroke(ctx, '#EDE3C8', 1.3, '#BCAF88');
    }
    ctx.restore();
  };
})();
