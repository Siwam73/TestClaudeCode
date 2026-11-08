/* endcard.js — the brand outro: the small badge opens into a full-screen
 * The Dev Loop card with the call to action
 * "Please follow · Link in the bio to read our stories". */
(function () {
  'use strict';
  const DL = window.DL;
  const { T, W, H, kf, E, clamp, lerp, prog, TAU, circle, ellipse, star4, rrect, noise1, fillStroke } = DL;

  const NAVY = '#0A0E1A';
  const CYAN = '#22D3EE';
  const LOGO = { x: 360, y: 405, r: 158 };
  const BTN = { x: 360, y: 812, w: 292, h: 82 };

  // ---------------------------------------------------------------- background
  let bgCache = null;
  function background(scale) {
    const w = Math.round(W * scale), h = Math.round(H * scale);
    if (bgCache && bgCache.width === w && bgCache.height === h) return bgCache;
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    const x = c.getContext('2d');
    x.scale(scale, scale);
    x.fillStyle = NAVY;
    x.fillRect(0, 0, W, H);
    const g = x.createRadialGradient(LOGO.x, LOGO.y + 80, 20, LOGO.x, LOGO.y + 80, 760);
    g.addColorStop(0, 'rgba(34,90,140,0.42)');
    g.addColorStop(0.5, 'rgba(20,40,80,0.18)');
    g.addColorStop(1, 'rgba(10,14,26,0)');
    x.fillStyle = g;
    x.fillRect(0, 0, W, H);
    // dev-flavoured dot grid, fading toward the edges
    for (let gy = 18; gy < H; gy += 36) {
      for (let gx = 18; gx < W; gx += 36) {
        const d = Math.hypot(gx - 360, gy - 560) / 760;
        const a = 0.13 * clamp(1 - d);
        if (a < 0.01) continue;
        x.fillStyle = `rgba(140,180,230,${a})`;
        x.beginPath();
        x.arc(gx, gy, 1.2, 0, TAU);
        x.fill();
      }
    }
    // warm floor glow for the diyas
    const fg = x.createRadialGradient(360, 1190, 10, 360, 1190, 360);
    fg.addColorStop(0, 'rgba(255,170,60,0.16)');
    fg.addColorStop(1, 'rgba(255,170,60,0)');
    x.fillStyle = fg;
    x.fillRect(0, 800, W, H - 800);
    bgCache = c;
    return c;
  }

  // ---------------------------------------------------------------- string lights
  const BULB_COLS = ['#FFC94A', '#FF8A1F', CYAN, '#FF5C8A'];
  function stringLights(ctx, t, k) {
    if (k <= 0) return;
    const drop = (1 - E.outBack(k)) * -120;
    const strands = [
      { x0: -40, x1: 360, y0: 46, sag: 62, n: 9, off: 0 },
      { x0: 360, x1: 760, y0: 46, sag: 62, n: 9, off: 2 },
    ];
    ctx.save();
    ctx.translate(0, drop);
    for (const s of strands) {
      const yAt = (x) => {
        const u = (x - s.x0) / (s.x1 - s.x0);
        return s.y0 + s.sag * 4 * u * (1 - u);
      };
      ctx.strokeStyle = '#3A4766';
      ctx.lineWidth = 2;
      ctx.beginPath();
      for (let i = 0; i <= 40; i++) {
        const x = lerp(s.x0, s.x1, i / 40);
        if (i === 0) ctx.moveTo(x, yAt(x));
        else ctx.lineTo(x, yAt(x));
      }
      ctx.stroke();
      // hook where the two strands meet
      circle(ctx, 360, s.y0, 3.2);
      ctx.fillStyle = '#56627E';
      ctx.fill();
      for (let i = 1; i < s.n; i++) {
        const x = lerp(s.x0, s.x1, i / s.n);
        const y = yAt(x) + 4;
        const col = BULB_COLS[(i + s.off) % 4];
        const tw = 0.65 + 0.35 * Math.sin(t * 3.1 + i * 1.9 + s.off);
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        const g = ctx.createRadialGradient(x, y + 8, 0, x, y + 8, 24);
        g.addColorStop(0, hexA(col, 0.55 * tw));
        g.addColorStop(1, hexA(col, 0));
        ctx.fillStyle = g;
        circle(ctx, x, y + 8, 24);
        ctx.fill();
        ctx.restore();
        ctx.fillStyle = '#56627E';
        ctx.fillRect(x - 3, y - 3, 6, 5);
        ellipse(ctx, x, y + 8, 5.6, 7.6);
        ctx.fillStyle = col;
        ctx.globalAlpha = 0.75 + 0.25 * tw;
        ctx.fill();
        ctx.globalAlpha = 1;
        ellipse(ctx, x - 1.6, y + 5.5, 1.6, 2.6);
        ctx.fillStyle = 'rgba(255,255,255,0.75)';
        ctx.fill();
      }
    }
    ctx.restore();
  }
  function hexA(hex, a) {
    const n = parseInt(hex.slice(1), 16);
    return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
  }

  // ---------------------------------------------------------------- diyas
  function diya(ctx, x, y, s, t, seed, k) {
    if (k <= 0) return;
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(s * E.outBack(k), s * E.outBack(k));
    // glow
    const fl = 0.85 + 0.15 * noise1(t * 9, seed);
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const g = ctx.createRadialGradient(0, -26, 0, 0, -26, 70);
    g.addColorStop(0, `rgba(255,190,90,${0.5 * fl})`);
    g.addColorStop(1, 'rgba(255,140,40,0)');
    ctx.fillStyle = g;
    circle(ctx, 0, -26, 70);
    ctx.fill();
    ctx.restore();
    // flame
    const sway = noise1(t * 4, seed + 3) * 3;
    const hgt = 26 * fl;
    ctx.beginPath();
    ctx.moveTo(-7, -10);
    ctx.bezierCurveTo(-8, -18, sway - 3, -hgt + 4, sway, -10 - hgt);
    ctx.bezierCurveTo(sway + 3, -hgt + 4, 8, -18, 7, -10);
    ctx.quadraticCurveTo(0, -4, -7, -10);
    const fg = ctx.createLinearGradient(0, -10 - hgt, 0, -6);
    fg.addColorStop(0, '#FFF2B0');
    fg.addColorStop(0.5, '#FFB52E');
    fg.addColorStop(1, '#FF6A1A');
    ctx.fillStyle = fg;
    ctx.fill();
    // clay lamp
    ctx.beginPath();
    ctx.moveTo(-30, -10);
    ctx.quadraticCurveTo(-28, 10, 0, 12);
    ctx.quadraticCurveTo(28, 10, 30, -10);
    ctx.quadraticCurveTo(38, -14, 40, -18);
    ctx.quadraticCurveTo(30, -10, 0, -8);
    ctx.quadraticCurveTo(-24, -9, -30, -10);
    ctx.closePath();
    const cg = ctx.createLinearGradient(0, -14, 0, 12);
    cg.addColorStop(0, '#E87A3C');
    cg.addColorStop(1, '#A8380F');
    ctx.fillStyle = cg;
    ctx.fill();
    ctx.strokeStyle = '#5E1E06';
    ctx.lineWidth = 1.6;
    ctx.stroke();
    ctx.fillStyle = '#FFD27A';
    for (let i = -2; i <= 2; i++) {
      circle(ctx, i * 9, 1 - Math.abs(i) * 0.8, 1.7);
      ctx.fill();
    }
    ctx.restore();
  }

  // ---------------------------------------------------------------- logo + loop dot
  /** Point on the logo's infinity (fitted to the artwork: a Gerono lemniscate). */
  function loopPoint(L, th) {
    const u = 0.4995 + 0.219 * Math.cos(th);
    const v = 0.5545 + 0.057 * Math.sin(2 * th);
    return [L.x - L.r + 2 * L.r * u, L.y - L.r + 2 * L.r * v];
  }

  function drawLoopComet(ctx, L, t) {
    const t0 = T.dotLoop, t1 = T.dotLoop + 1.7;
    if (t < t0) return;
    const k = E.inOutSine ? E.inOutSine(prog(t, t0, t1)) : E.sine(prog(t, t0, t1));
    const head = Math.PI / 2 + k * TAU * 2;
    const fadeTail = 1 - prog(t, t1 - 0.05, t1 + 0.5);
    const trail = 2.4 * fadeTail;
    ctx.save();
    ctx.lineCap = 'round';
    const N = 48;
    for (let i = 0; i < N; i++) {
      const a0 = head - trail * (1 - i / N), a1 = head - trail * (1 - (i + 1) / N);
      if (a0 < Math.PI / 2) continue;
      const p0 = loopPoint(L, a0), p1 = loopPoint(L, a1);
      const w = i / N;
      ctx.strokeStyle = hexA(CYAN, 0.85 * w * fadeTail);
      ctx.lineWidth = L.r * 0.05 * (0.4 + 0.6 * w);
      ctx.beginPath();
      ctx.moveTo(p0[0], p0[1]);
      ctx.lineTo(p1[0], p1[1]);
      ctx.stroke();
    }
    const hp = loopPoint(L, head);
    const settle = prog(t, t1 - 0.1, t1 + 0.6);
    const pr = L.r * 0.038 * (1 + 0.5 * (1 - settle));
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const g = ctx.createRadialGradient(hp[0], hp[1], 0, hp[0], hp[1], pr * 5);
    g.addColorStop(0, hexA(CYAN, 0.9 * (1 - settle * 0.7)));
    g.addColorStop(1, hexA(CYAN, 0));
    ctx.fillStyle = g;
    circle(ctx, hp[0], hp[1], pr * 5);
    ctx.fill();
    ctx.restore();
    circle(ctx, hp[0], hp[1], pr);
    ctx.fillStyle = '#B9F4FF';
    ctx.globalAlpha = 1 - settle;
    ctx.fill();
    ctx.restore();
  }

  function drawLogoBlock(ctx, t) {
    const b = DL.BADGE;
    const fly = E.inOutCubic(prog(t, T.wipe, T.logoPop + 0.3));
    const x = lerp(b.x, LOGO.x, fly);
    const y = lerp(b.y, LOGO.y, fly) - Math.sin(Math.PI * fly) * 40;
    let r = lerp(b.r, LOGO.r, fly);
    r *= kf(t, [[T.logoPop + 0.25, 1], [T.logoPop + 0.4, 1.07, 'outQuad'], [T.logoPop + 0.6, 1, 'inOutQuad']]);
    const L = { x, y, r };
    const rot = (1 - fly) * -0.35;

    // glow ring + arrival ripple
    if (fly > 0.6) {
      const ga = prog(t, T.logoPop + 0.1, T.logoPop + 0.6) * (0.55 + 0.25 * Math.sin(t * 2.6));
      ctx.save();
      ctx.strokeStyle = hexA(CYAN, ga);
      ctx.lineWidth = 3;
      ctx.shadowColor = CYAN;
      ctx.shadowBlur = 26;
      circle(ctx, x, y, r + 12);
      ctx.stroke();
      ctx.restore();
      const rp = prog(t, T.logoPop + 0.3, T.logoPop + 1.2);
      if (rp > 0 && rp < 1) {
        ctx.strokeStyle = hexA(CYAN, 0.7 * (1 - rp));
        ctx.lineWidth = 4 * (1 - rp) + 1;
        circle(ctx, x, y, r + 12 + E.outCubic(rp) * 110);
        ctx.stroke();
      }
    }
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(rot);
    DL.drawLogo(ctx, 0, 0, r, { shadow: false });
    ctx.restore();
    if (fly >= 1) drawLoopComet(ctx, L, t);

    // sparkles around the logo
    const sk = prog(t, T.logoPop + 0.3, T.logoPop + 0.9);
    if (sk > 0) {
      const S = [[-205, -95, 14], [196, -128, 11], [212, 70, 15], [-190, 112, 9], [-120, -190, 8], [130, 190, 8]];
      S.forEach(([dx, dy, rr], i) => {
        const tw = 0.7 + 0.3 * Math.sin(t * 3.6 + i * 2.1);
        star4(ctx, LOGO.x + dx, LOGO.y + dy, rr * E.outBack(prog(sk, i * 0.08, i * 0.08 + 0.5)) * tw, 0);
        ctx.fillStyle = i % 2 ? '#FFC94A' : '#FFE6A3';
        ctx.fill();
      });
    }
  }

  // ---------------------------------------------------------------- CTA
  function textIn(t, t0) {
    const k = E.outCubic(prog(t, t0, t0 + 0.45));
    return { a: k, dy: (1 - k) * 26 };
  }

  function drawFollow(ctx, t) {
    const a = textIn(t, T.follow);
    if (a.a <= 0) return;
    ctx.save();
    ctx.globalAlpha = a.a;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = '800 62px Poppins';
    ctx.fillStyle = '#FFFFFF';
    ctx.fillText('Please follow', 360, 690 + a.dy);
    ctx.restore();
  }

  function drawButton(ctx, t) {
    const k = prog(t, T.button, T.button + 0.4);
    if (k <= 0) return;
    const tapped = t >= T.tap + 0.06;
    const press = kf(t, [[T.tap - 0.04, 1], [T.tap + 0.04, 0.92, 'outQuad'], [T.tap + 0.22, 1.04, 'outQuad'], [T.tap + 0.38, 1, 'inOutQuad']]);
    const s = E.outBack(k) * press;
    ctx.save();
    ctx.translate(BTN.x, BTN.y);
    ctx.scale(s, s);
    rrect(ctx, -BTN.w / 2, -BTN.h / 2, BTN.w, BTN.h, BTN.h / 2);
    if (!tapped) {
      ctx.save();
      ctx.shadowColor = hexA(CYAN, 0.6);
      ctx.shadowBlur = 24;
      ctx.fillStyle = CYAN;
      ctx.fill();
      ctx.restore();
    } else {
      ctx.fillStyle = 'rgba(34,211,238,0.12)';
      ctx.fill();
      ctx.strokeStyle = CYAN;
      ctx.lineWidth = 3;
      ctx.stroke();
    }
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'left';
    ctx.font = '700 34px Poppins';
    const label = tapped ? 'Following' : 'Follow';
    const tw = ctx.measureText(label).width;
    const iconW = 30;
    const x0 = -(tw + iconW + 12) / 2;
    ctx.strokeStyle = tapped ? CYAN : NAVY;
    ctx.fillStyle = tapped ? CYAN : NAVY;
    ctx.lineWidth = 5;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    if (tapped) {
      // check mark
      ctx.moveTo(x0 + 3, 1);
      ctx.lineTo(x0 + 12, 10);
      ctx.lineTo(x0 + 28, -9);
    } else {
      // plus
      ctx.moveTo(x0 + 15, -12);
      ctx.lineTo(x0 + 15, 12);
      ctx.moveTo(x0 + 3, 0);
      ctx.lineTo(x0 + 27, 0);
    }
    ctx.stroke();
    ctx.fillText(label, x0 + iconW + 12, 2);
    ctx.restore();

    // tap ripple + confetti sparkle
    const rp = prog(t, T.tap, T.tap + 0.55);
    if (rp > 0 && rp < 1) {
      ctx.save();
      ctx.strokeStyle = hexA(CYAN, 0.8 * (1 - rp));
      ctx.lineWidth = 3;
      rrect(ctx, BTN.x - BTN.w / 2 - rp * 26, BTN.y - BTN.h / 2 - rp * 26, BTN.w + rp * 52, BTN.h + rp * 52, BTN.h / 2 + rp * 26);
      ctx.stroke();
      for (let i = 0; i < 10; i++) {
        const ang = (i / 10) * TAU + 0.3;
        const d = 60 + E.outCubic(rp) * 120;
        star4(ctx, BTN.x + Math.cos(ang) * d * 1.6, BTN.y + Math.sin(ang) * d * 0.7, 7 * (1 - rp), 0);
        ctx.fillStyle = i % 2 ? '#FFC94A' : CYAN;
        ctx.fill();
      }
      ctx.restore();
    }
  }

  /** Pointing-hand cursor that glides in and taps the button. */
  function drawHand(ctx, t) {
    const t0 = T.tap - 0.5, t1 = T.tap + 0.75;
    if (t < t0 || t > t1) return;
    const inK = E.outCubic(prog(t, t0, T.tap - 0.08));
    const outK = E.inCubic(prog(t, T.tap + 0.35, t1));
    const tx = BTN.x + 70, ty = BTN.y + 18;
    const x = lerp(tx + 150, tx, inK) + outK * 170;
    const y = lerp(ty + 230, ty, inK) + outK * 240;
    const press = kf(t, [[T.tap - 0.06, 1], [T.tap + 0.02, 0.86], [T.tap + 0.16, 1]]);
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(-0.35);
    ctx.scale(1.25 * press, 1.25 * press);
    // shapes drawn twice: navy outline pass, then white fill pass (clean union outline)
    const shapes = (c) => {
      rrect(c, -6, -2, 13, 34, 6.5); c.fill();         // index finger
      rrect(c, -9, 18, 38, 34, 12); c.fill();          // palm
      rrect(c, 6, 14, 10, 18, 5); c.fill();            // middle knuckle
      rrect(c, 15, 16, 10, 16, 5); c.fill();           // ring knuckle
      rrect(c, 23, 19, 9, 14, 4.5); c.fill();          // pinky knuckle
      ellipse(c, -11, 32, 6, 10, -0.5); c.fill();      // thumb
    };
    ctx.translate(0, -2);
    ctx.fillStyle = NAVY;
    ctx.save();
    ctx.translate(0, 0);
    for (const [ox, oy] of [[-2.6, 0], [2.6, 0], [0, -2.6], [0, 2.6], [-1.9, -1.9], [1.9, 1.9], [-1.9, 1.9], [1.9, -1.9]]) {
      ctx.save();
      ctx.translate(ox, oy);
      shapes(ctx);
      ctx.restore();
    }
    ctx.restore();
    ctx.fillStyle = '#FFFFFF';
    shapes(ctx);
    ctx.restore();
  }

  function linkIcon(ctx, x, y, s, col) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(-Math.PI / 4);
    ctx.strokeStyle = col;
    ctx.lineWidth = 4.2;
    rrect(ctx, -17 * s, -7 * s, 20 * s, 14 * s, 7 * s);
    ctx.stroke();
    rrect(ctx, -3 * s, -7 * s, 20 * s, 14 * s, 7 * s);
    ctx.stroke();
    ctx.restore();
  }

  function drawLink(ctx, t) {
    const a1 = textIn(t, T.link), a2 = textIn(t, T.link + 0.18);
    ctx.save();
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    if (a1.a > 0) {
      ctx.globalAlpha = a1.a;
      ctx.font = '700 42px Poppins';
      const label = 'Link in the bio';
      const tw = ctx.measureText(label).width;
      const total = tw + 52;
      const x0 = 360 - total / 2;
      const y = 932 + a1.dy;
      linkIcon(ctx, x0 + 18, y, 1.05, CYAN);
      ctx.fillStyle = CYAN;
      ctx.fillText(label, x0 + 52, y + 2);
      // bouncing pointer to the profile/bio
      const bob = Math.sin((t - T.link) * 6) * 4;
      ctx.globalAlpha = a1.a * 0.9;
      ctx.strokeStyle = CYAN;
      ctx.lineWidth = 3.4;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.beginPath();
      const ax = x0 + total + 22, ay = y + 2 + bob;
      ctx.moveTo(ax - 9, ay - 6);
      ctx.lineTo(ax, ay + 4);
      ctx.lineTo(ax + 9, ay - 6);
      ctx.stroke();
    }
    if (a2.a > 0) {
      ctx.globalAlpha = a2.a;
      ctx.textAlign = 'center';
      ctx.font = '500 32px Poppins';
      ctx.fillStyle = '#D5E2F2';
      ctx.fillText('to read our stories', 360, 990 + a2.dy);
    }
    ctx.restore();
  }

  // ---------------------------------------------------------------- entry point
  DL.drawEndCard = function (ctx, t, scale) {
    const b = DL.BADGE;
    const wipe = E.inOutCubic(prog(t, T.wipe, T.wipeEnd));
    const R = lerp(b.r, 1140, wipe);
    ctx.save();
    if (wipe < 1) {
      circle(ctx, b.x, b.y, R);
      ctx.clip();
    }
    ctx.drawImage(background(scale), 0, 0, W, H);
    stringLights(ctx, t, prog(t, T.wipeEnd - 0.1, T.wipeEnd + 0.5));
    const dk = prog(t, T.link + 0.3, T.link + 0.9);
    diya(ctx, 250, 1132, 0.9, t, 1, prog(dk, 0, 0.6));
    diya(ctx, 360, 1122, 1.05, t, 2, prog(dk, 0.2, 0.8));
    diya(ctx, 470, 1132, 0.9, t, 3, prog(dk, 0.4, 1));
    drawFollow(ctx, t);
    drawButton(ctx, t);
    drawLink(ctx, t);
    ctx.restore();
    // the logo flies above the wipe edge
    drawLogoBlock(ctx, t);
    drawHand(ctx, t);
    // closing fade of the sparkle so the last frame is calm
  };
})();
