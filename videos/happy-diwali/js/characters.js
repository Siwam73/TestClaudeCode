/* characters.js — original chibi characters drawn as small 2D rigs:
 *   • the boy  (navy kurta with a "{ }" print — a tiny dev)
 *   • the girl (lehenga, braid, marigold; she lights the rocket)
 *   • the peacock (fans its tail, panics, runs)
 * Every pose is plain data, so the timeline can keyframe anything. */
(function () {
  'use strict';
  const DL = window.DL;
  const { TAU, clamp, lerp, ik, limb, fillStroke, ellipse, circle, OUTLINE, E } = DL;

  const STYLE = {
    boy: {
      kind: 'boy',
      skin: '#C68456', skinDark: '#A96B41', blush: '#EE8D78',
      hair: '#2A1C15', hairHi: '#5A3E2E',
      top: '#22355E', topDark: '#17264A', trim: '#E9B949', print: '#3FE0F5',
      leg: '#F3EBDA', legDark: '#D8CCB2', shoe: '#8C4A27',
    },
    girl: {
      kind: 'girl',
      skin: '#D39765', skinDark: '#B87A4B', blush: '#F28C82',
      hair: '#2A1A13', hairHi: '#5A3A2C',
      top: '#C2185B', topDark: '#96124A', trim: '#F2B53A',
      skirt: '#F6A623', skirtDark: '#DE870C', skirtDots: '#C2185B',
      leg: '#B2164F', legDark: '#8E1240', shoe: '#7A1236',
      flower: '#FF9F1C', flowerDark: '#E0700B',
    },
  };
  DL.STYLE = STYLE;

  const KID_DEFAULTS = {
    x: 0, y: 830, s: 1.12, face: 1, rot: 0, pivot: [0, -30], lift: 0,
    crouch: 0, bob: 0, lean: 0, hipX: 0,
    footF: [7, -5], footB: [-6, -5], footRotF: 0, footRotB: 0,
    handF: null, handB: null,
    headTilt: 0, headFace: 1,
    eyes: 'open', mouth: 'smile', brows: 'normal', look: [0, 0],
    blush: 1, sweat: 0, stick: null, braid: 0, shadow: 1, alpha: 1,
  };

  // ---------------------------------------------------------------- kids
  DL.drawKid = function (ctx, style, pose) {
    const st = STYLE[style];
    const p = Object.assign({}, KID_DEFAULTS, pose);
    if (p.alpha <= 0) return;
    ctx.save();
    ctx.globalAlpha *= p.alpha;
    ctx.translate(p.x, p.y);
    ctx.scale(p.face * p.s, p.s);

    // ground shadow (does not rotate / bob)
    if (p.shadow > 0) {
      ctx.save();
      ctx.globalAlpha *= 0.13 * p.shadow * clamp(1 - p.lift / 60);
      ellipse(ctx, 0, 1, 26 + p.crouch * 6, 4.5);
      ctx.fillStyle = '#4A4020';
      ctx.fill();
      ctx.restore();
    }

    ctx.translate(0, -p.lift);
    if (p.rot) {
      ctx.translate(p.pivot[0], p.pivot[1]);
      ctx.rotate(p.rot);
      ctx.translate(-p.pivot[0], -p.pivot[1]);
    }

    const hip = [p.hipX, -34 + p.crouch * 15 + p.bob];
    const cl = Math.cos(p.lean), sl = Math.sin(p.lean);
    // upper-body space -> root space
    const U = (x, y) => [hip[0] + x * cl - y * sl, hip[1] + x * sl + y * cl];

    const shoulderF = [7, -27], shoulderB = [-7, -27];
    const handF = p.handF || [13, -4];
    const handB = p.handB || [-12, -4];

    // ---- back arm (behind everything)
    drawArm(ctx, st, U, shoulderB, handB, true, p);

    // ---- braid hangs behind the body
    if (st.kind === 'girl') withHead(ctx, U, p, () => drawBraid(ctx, st, p));

    // ---- legs
    const hipF = [hip[0] + 4, hip[1] + 1], hipB = [hip[0] - 4, hip[1] + 1];
    drawLeg(ctx, st, hipB, p.footB, p.footRotB, true);
    // when squatting, the boy's front thigh comes forward over the kurta
    const kneeOver = st.kind === 'boy' && p.crouch > 0.5;
    if (!kneeOver) drawLeg(ctx, st, hipF, p.footF, p.footRotF, false);

    // ---- torso
    if (st.kind === 'boy') drawKurta(ctx, st, U, p);
    else drawLehenga(ctx, st, U, hip, p);
    if (kneeOver) drawLeg(ctx, st, hipF, p.footF, p.footRotF, false);

    // ---- head
    withHead(ctx, U, p, () => drawHead(ctx, st, p));

    // ---- front arm (+ incense stick)
    drawArm(ctx, st, U, shoulderF, handF, false, p);

    ctx.restore();
  };

  function withHead(ctx, U, p, fn) {
    const neck = U(0, -32);
    ctx.save();
    ctx.translate(neck[0], neck[1]);
    ctx.rotate(p.lean + p.headTilt);
    ctx.translate(2.5, -33);
    if (p.headFace < 0) ctx.scale(-1, 1);
    fn();
    ctx.restore();
  }

  function drawLeg(ctx, st, hip, foot, footRot, back) {
    const knee = ik(hip[0], hip[1], foot[0], foot[1], 14.5, 14.5, -1);
    const col = back ? st.legDark : st.leg;
    limb(ctx, [hip, knee, foot], st.kind === 'boy' ? 11 : 8.5, col, 2.3);
    // shoe
    ctx.save();
    ctx.translate(foot[0], foot[1]);
    ctx.rotate(footRot);
    ctx.beginPath();
    ctx.moveTo(-6, -3);
    ctx.bezierCurveTo(-7, 3.5, -3, 5.2, 4, 5.2);
    ctx.bezierCurveTo(9, 5.2, 12.5, 4, 12.5, 1.2);
    if (st.kind === 'boy') ctx.quadraticCurveTo(14.5, -1.5, 13, -3.2); // curled mojari toe
    ctx.bezierCurveTo(10, -3.2, 6, -4.5, 2, -5);
    ctx.closePath();
    fillStroke(ctx, back ? shade(st.shoe) : st.shoe, 2.1);
    ctx.restore();
  }

  function shade(hex) {
    // quick darken for "far side" parts
    const n = parseInt(hex.slice(1), 16);
    const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
    const k = 0.82;
    return `rgb(${(r * k) | 0},${(g * k) | 0},${(b * k) | 0})`;
  }

  function drawArm(ctx, st, U, shoulder, hand, back, p) {
    const S = U(shoulder[0], shoulder[1]);
    const H = U(hand[0], hand[1]);
    const el = ik(S[0], S[1], H[0], H[1], 12.5, 12, 1);
    const sleeve = back ? st.topDark : st.top;
    if (st.kind === 'boy') {
      limb(ctx, [S, el, H], 9.5, sleeve, 2.3);
    } else {
      // short puffed sleeve, bare forearm
      limb(ctx, [S, el, H], 7.5, back ? st.skinDark : st.skin, 2.3);
      const mid = [lerp(S[0], el[0], 0.75), lerp(S[1], el[1], 0.75)];
      limb(ctx, [S, mid], 10.5, sleeve, 2.1);
      // bangle
      const b = [lerp(el[0], H[0], 0.72), lerp(el[1], H[1], 0.72)];
      circle(ctx, b[0], b[1], 4.4);
      ctx.strokeStyle = st.trim;
      ctx.lineWidth = 2;
      ctx.stroke();
    }
    // hand
    circle(ctx, H[0], H[1], 5.6);
    fillStroke(ctx, back ? st.skinDark : st.skin, 2.1);

    if (!back && p.stick) drawStick(ctx, H, p.stick, p);
  }

  /** Incense stick (agarbatti) held in the front hand. */
  function drawStick(ctx, H, stick, p) {
    const a = stick.angle; // in root space (radians, 0 = forward)
    const len = 44;
    const tip = [H[0] + Math.cos(a) * len, H[1] + Math.sin(a) * len];
    const base = [H[0] - Math.cos(a) * 6, H[1] - Math.sin(a) * 6];
    ctx.save();
    ctx.lineCap = 'round';
    ctx.strokeStyle = '#5B3A22';
    ctx.lineWidth = 2.6;
    ctx.beginPath();
    ctx.moveTo(base[0], base[1]);
    ctx.lineTo(tip[0], tip[1]);
    ctx.stroke();
    ctx.strokeStyle = '#8B5A36';
    ctx.lineWidth = 1.2;
    ctx.stroke();
    // glowing tip
    const gl = 0.75 + 0.25 * Math.sin((stick.t || 0) * 23);
    const g = ctx.createRadialGradient(tip[0], tip[1], 0, tip[0], tip[1], 9);
    g.addColorStop(0, `rgba(255,190,80,${0.85 * gl})`);
    g.addColorStop(1, 'rgba(255,120,40,0)');
    ctx.fillStyle = g;
    circle(ctx, tip[0], tip[1], 9);
    ctx.fill();
    circle(ctx, tip[0], tip[1], 2.2);
    ctx.fillStyle = '#FF5A1F';
    ctx.fill();
    // smoke wisp
    const tt = stick.t || 0;
    ctx.strokeStyle = 'rgba(150,145,135,0.35)';
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(tip[0], tip[1]);
    for (let i = 1; i <= 8; i++) {
      const k = i / 8;
      ctx.lineTo(tip[0] + Math.sin(tt * 3 + k * 6) * 4 * k, tip[1] - k * 30);
    }
    ctx.stroke();
    ctx.restore();
    p._stickTip = tip;
  }

  function drawKurta(ctx, st, U, p) {
    ctx.save();
    const h = U(0, 0);
    ctx.translate(h[0], h[1]);
    ctx.rotate(p.lean);
    const path = new Path2D(
      'M -13,-31 C -5,-34 6,-34 14,-31 C 18,-30 20,-26 20,-21 L 22,6 Q 22,10 18,10 L -18,10 Q -22,10 -22,6 L -20,-21 C -20,-26 -17,-30 -13,-31 Z'
    );
    ctx.fillStyle = st.top;
    ctx.fill(path);
    // back-side shading
    ctx.save();
    ctx.clip(path);
    ctx.fillStyle = st.topDark;
    ctx.globalAlpha = 0.55;
    ctx.beginPath();
    ctx.ellipse(-24, -8, 12, 30, 0.1, 0, TAU);
    ctx.fill();
    ctx.globalAlpha = 1;
    // hem trim
    ctx.fillStyle = st.trim;
    ctx.fillRect(-24, 5, 48, 2.6);
    ctx.restore();
    ctx.lineJoin = 'round';
    ctx.strokeStyle = OUTLINE;
    ctx.lineWidth = 2.4;
    ctx.stroke(path);
    // collar + placket
    ctx.strokeStyle = st.trim;
    ctx.lineWidth = 2.2;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(-7, -32);
    ctx.quadraticCurveTo(2, -28.5, 10, -32);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(4, -29);
    ctx.lineTo(4, -17);
    ctx.stroke();
    // "{ }" print — counter-flip so it never reads mirrored
    ctx.save();
    ctx.translate(0, -8);
    ctx.scale(p.face, 1);
    ctx.font = '700 11px "JetBrains Mono"';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = st.print;
    ctx.fillText('{ }', 0, 0);
    ctx.restore();
    ctx.restore();
  }

  function drawLehenga(ctx, st, U, hip, p) {
    // skirt: waist follows the upper body, hem stays near the ground
    const wl = U(-14, -13), wr = U(15, -13);
    const fx = (p.footF[0] + p.footB[0]) / 2;
    const spread = Math.abs(p.footF[0] - p.footB[0]);
    const hemY = Math.min(-3, Math.max(p.footF[1], p.footB[1]) - 4);
    const half = 24 + spread * 0.35 + p.crouch * 6;
    const sway = (p.skirtSway || 0) * 4;
    const hl = [fx - half + sway, hemY], hr = [fx + half + sway, hemY + 1];
    const skirt = new Path2D();
    skirt.moveTo(wl[0], wl[1]);
    skirt.quadraticCurveTo(wl[0] - 10, (wl[1] + hl[1]) / 2, hl[0], hl[1]);
    // scalloped hem
    const n = 6;
    for (let i = 1; i <= n; i++) {
      const x0 = lerp(hl[0], hr[0], (i - 1) / n), x1 = lerp(hl[0], hr[0], i / n);
      const y1 = lerp(hl[1], hr[1], i / n);
      skirt.quadraticCurveTo((x0 + x1) / 2, y1 + 3.2, x1, y1);
    }
    skirt.quadraticCurveTo(wr[0] + 10, (wr[1] + hr[1]) / 2, wr[0], wr[1]);
    skirt.closePath();
    ctx.fillStyle = st.skirt;
    ctx.fill(skirt);
    ctx.save();
    ctx.clip(skirt);
    // folds + dots + golden border
    ctx.strokeStyle = st.skirtDark;
    ctx.lineWidth = 2;
    for (let i = -2; i <= 2; i++) {
      const top = U(i * 5.5, -12);
      ctx.beginPath();
      ctx.moveTo(top[0], top[1]);
      ctx.quadraticCurveTo(top[0] + i * 3, (top[1] + hemY) / 2, fx + i * half * 0.38 + sway, hemY);
      ctx.stroke();
    }
    ctx.fillStyle = st.skirtDots;
    for (let i = 0; i < 7; i++) {
      const xx = lerp(hl[0] + 6, hr[0] - 6, i / 6);
      circle(ctx, xx, hemY - 9, 1.6);
      ctx.fill();
    }
    ctx.fillStyle = st.trim;
    ctx.fillRect(hl[0] - 4, hemY - 5, hr[0] - hl[0] + 8, 3.2);
    ctx.restore();
    ctx.strokeStyle = OUTLINE;
    ctx.lineWidth = 2.4;
    ctx.lineJoin = 'round';
    ctx.stroke(skirt);

    // blouse
    ctx.save();
    const h = U(0, 0);
    ctx.translate(h[0], h[1]);
    ctx.rotate(p.lean);
    const blouse = new Path2D('M -12,-31 C -5,-34 6,-34 13,-31 C 17,-30 18,-26 18,-21 L 17,-11 Q 0,-8 -17,-11 L -18,-21 C -18,-26 -16,-30 -12,-31 Z');
    ctx.fillStyle = st.top;
    ctx.fill(blouse);
    ctx.save();
    ctx.clip(blouse);
    ctx.fillStyle = st.topDark;
    ctx.globalAlpha = 0.5;
    ellipse(ctx, -20, -20, 9, 16);
    ctx.fill();
    ctx.restore();
    ctx.strokeStyle = OUTLINE;
    ctx.lineWidth = 2.4;
    ctx.lineJoin = 'round';
    ctx.stroke(blouse);
    // necklace
    ctx.strokeStyle = st.trim;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(-6, -31.5);
    ctx.quadraticCurveTo(2, -24, 10, -31.5);
    ctx.stroke();
    circle(ctx, 2, -26.5, 2);
    ctx.fillStyle = '#E2463C';
    ctx.fill();
    // dupatta sash across the chest
    ctx.globalAlpha = 0.85;
    ctx.fillStyle = '#F7D154';
    ctx.beginPath();
    ctx.moveTo(-15, -30);
    ctx.quadraticCurveTo(-4, -24, 16, -12);
    ctx.lineTo(12, -9.5);
    ctx.quadraticCurveTo(-6, -20, -17, -25);
    ctx.closePath();
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.restore();
  }
  function drawBraid(ctx, st, p) {
    const sw = p.braid || 0;
    ctx.save();
    ctx.translate(-22, 10);
    ctx.rotate(0.35 + sw * 0.5);
    for (let i = 0; i < 4; i++) {
      ellipse(ctx, 0, 6 + i * 8.5, 6.2 - i * 0.5, 6);
      fillStroke(ctx, st.hair, 2, '#170E0A');
    }
    // ribbon
    ctx.translate(0, 38);
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(-6, 5);
    ctx.lineTo(-5, -4);
    ctx.closePath();
    ctx.moveTo(0, 0);
    ctx.lineTo(6, 5);
    ctx.lineTo(5, -4);
    ctx.closePath();
    fillStroke(ctx, st.top, 1.6);
    ctx.restore();
  }

  // ---------------------------------------------------------------- head
  const BOY_HAIR = new Path2D(
    'M -33,6 C -40,-10 -36,-30 -22,-38 C -12,-45 4,-46 14,-41 C 26,-36 34,-26 35,-12 C 36,-6 35,-2 33,2 ' +
      'C 31,-3 29,-6 26,-8 C 25,-4 22,-3 19,-4 C 19,-9 16,-13 12,-14 C 10,-9 6,-7 2,-8 C 0,-13 -4,-16 -9,-16 ' +
      'C -10,-11 -13,-8 -17,-8 C -18,-4 -20,0 -22,6 C -26,9 -30,9 -33,6 Z'
  );
  const BOY_CURL = new Path2D('M 3,-43 C 1,-53 10,-58 15,-53 C 11,-53 8,-50 8.5,-43 Z');
  const GIRL_HAIR_BACK = new Path2D('M -31,22 C -44,6 -42,-26 -18,-38 C 2,-46 26,-38 33,-20 C 36,-8 34,4 31,12 Z');
  const GIRL_HAIR = new Path2D(
    'M -33,8 C -38,-14 -28,-36 -8,-41 C 10,-45 28,-36 34,-18 C 36,-10 35,-2 33,4 C 30,-4 27,-9 22,-12 ' +
      'C 14,-17 4,-17 -3,-12 C -6,-16 -11,-18 -16,-16 C -21,-12 -23,-4 -24,6 C -27,10 -30,10 -33,8 Z'
  );

  function drawHead(ctx, st, p) {
    if (st.kind === 'girl') {
      ctx.fillStyle = st.hair;
      ctx.fill(GIRL_HAIR_BACK);
      ctx.strokeStyle = OUTLINE;
      ctx.lineWidth = 2.4;
      ctx.stroke(GIRL_HAIR_BACK);
    }
    // face
    ellipse(ctx, 0, 0, 34, 32);
    fillStroke(ctx, st.skin, 2.5);
    // ear (back side)
    ellipse(ctx, -27, 6, 6, 8, -0.2);
    fillStroke(ctx, st.skin, 2.2);
    ctx.strokeStyle = st.skinDark;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(-27, 6, 3, -1.2, 1.4);
    ctx.stroke();
    if (st.kind === 'girl') {
      // jhumka earring
      circle(ctx, -28, 16, 2.6);
      fillStroke(ctx, st.trim, 1.2);
    }

    drawFace(ctx, st, p);

    // hair
    const hair = st.kind === 'boy' ? BOY_HAIR : GIRL_HAIR;
    ctx.fillStyle = st.hair;
    ctx.fill(hair);
    ctx.strokeStyle = '#170E0A';
    ctx.lineWidth = 2.4;
    ctx.lineJoin = 'round';
    ctx.stroke(hair);
    if (st.kind === 'boy') {
      ctx.fillStyle = st.hair;
      ctx.fill(BOY_CURL);
      ctx.stroke(BOY_CURL);
    }
    // shine
    ctx.strokeStyle = st.hairHi;
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.arc(-4, -10, 26, -2.5, -1.75);
    ctx.stroke();
    if (st.kind === 'girl') {
      // centre part
      ctx.strokeStyle = '#4A3226';
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.moveTo(4, -42);
      ctx.quadraticCurveTo(0, -30, -3, -13);
      ctx.stroke();
      drawMarigold(ctx, st, -19, -30);
    }
  }

  function drawMarigold(ctx, st, x, y) {
    ctx.save();
    ctx.translate(x, y);
    // leaf
    ellipse(ctx, -8, 5, 6, 3, 0.6);
    fillStroke(ctx, '#4E9A3A', 1.4);
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * TAU;
      circle(ctx, Math.cos(a) * 5.5, Math.sin(a) * 5.5, 3.8);
      fillStroke(ctx, st.flower, 1.3);
    }
    circle(ctx, 0, 0, 4.2);
    fillStroke(ctx, st.flowerDark, 1.3);
    ctx.restore();
  }

  function drawFace(ctx, st, p) {
    const L = p.look;
    const EX = [-3, 15], EY = 4;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    // blush
    if (p.blush > 0) {
      ctx.save();
      ctx.globalAlpha *= 0.5 * p.blush;
      ctx.fillStyle = st.blush;
      ellipse(ctx, -13, 14, 5.5, 3.2);
      ctx.fill();
      ellipse(ctx, 25, 14, 5, 3.2);
      ctx.fill();
      ctx.restore();
    }

    // eyes
    for (let i = 0; i < 2; i++) {
      const x = EX[i] + L[0] * 1.6, y = EY + L[1] * 1.4;
      ctx.strokeStyle = '#1B120E';
      ctx.fillStyle = '#1B120E';
      switch (p.eyes) {
        case 'wide': {
          ellipse(ctx, x, y - 1, 6.4, 7.4);
          fillStroke(ctx, '#FFFFFF', 1.8, '#1B120E');
          circle(ctx, x + L[0] * 2.6, y - 1 + L[1] * 2.6, 2.6);
          ctx.fillStyle = '#1B120E';
          ctx.fill();
          break;
        }
        case 'happy':
          ctx.lineWidth = 2.4;
          ctx.beginPath();
          ctx.arc(x, y + 3, 4.6, Math.PI * 1.15, Math.PI * 1.85);
          ctx.stroke();
          break;
        case 'closed':
          ctx.lineWidth = 2.2;
          ctx.beginPath();
          ctx.arc(x, y - 1, 4.2, Math.PI * 0.15, Math.PI * 0.85);
          ctx.stroke();
          break;
        case 'squeeze': {
          ctx.lineWidth = 2.3;
          const d = i === 0 ? 1 : -1;
          ctx.beginPath();
          ctx.moveTo(x - 4 * d, y - 4);
          ctx.lineTo(x + 3 * d, y);
          ctx.lineTo(x - 4 * d, y + 4);
          ctx.stroke();
          break;
        }
        case 'focus': {
          ellipse(ctx, x, y + 1, 3.8, 4);
          ctx.fill();
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.moveTo(x - 5, y - 2.5);
          ctx.lineTo(x + 5, y - 2);
          ctx.stroke();
          break;
        }
        default: {
          ellipse(ctx, x, y, 3.9, 5.3);
          ctx.fill();
          circle(ctx, x + 1.3, y - 2, 1.5);
          ctx.fillStyle = '#FFFFFF';
          ctx.fill();
          if (st.kind === 'girl') {
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            ctx.moveTo(x + 3.2, y - 3.5);
            ctx.lineTo(x + 5.8, y - 5.6);
            ctx.stroke();
          }
        }
      }
    }

    // brows
    ctx.strokeStyle = '#2A1A12';
    ctx.lineWidth = 2;
    const bt = { normal: [0, 0], up: [-3, 0], worried: [-1.5, 1], angry: [0, -1] }[p.brows] || [0, 0];
    for (let i = 0; i < 2; i++) {
      const x = EX[i], y = EY - 9 + bt[0];
      const tilt = (i === 0 ? 1 : -1) * bt[1] * 2.2;
      ctx.beginPath();
      ctx.moveTo(x - 4, y + tilt);
      ctx.quadraticCurveTo(x, y - 1.4, x + 4, y - tilt);
      ctx.stroke();
    }
    if (st.kind === 'girl') {
      circle(ctx, 6, -6, 1.8);
      ctx.fillStyle = '#D61F3B';
      ctx.fill();
    }

    // nose
    ctx.strokeStyle = st.skinDark;
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.arc(9, 11, 2, 0.2, 2.2);
    ctx.stroke();

    // mouth
    const mx = 8, my = 18;
    ctx.strokeStyle = '#3A1A12';
    ctx.lineWidth = 2;
    switch (p.mouth) {
      case 'grin':
        ctx.beginPath();
        ctx.moveTo(mx - 6, my - 2);
        ctx.quadraticCurveTo(mx, my + 9, mx + 7, my - 2);
        ctx.closePath();
        fillStroke(ctx, '#7A2B22', 1.8, '#3A1A12');
        ellipse(ctx, mx + 0.5, my + 3, 3, 1.6);
        ctx.fillStyle = '#E8736A';
        ctx.fill();
        break;
      case 'o':
        ellipse(ctx, mx, my + 1, 2.6, 3.4);
        fillStroke(ctx, '#7A2B22', 1.6, '#3A1A12');
        break;
      case 'open':
        ellipse(ctx, mx, my + 2, 4.6, 5.6);
        fillStroke(ctx, '#7A2B22', 1.8, '#3A1A12');
        ellipse(ctx, mx, my + 5, 3, 1.8);
        ctx.fillStyle = '#E8736A';
        ctx.fill();
        break;
      case 'scream':
        ellipse(ctx, mx, my + 3, 6.5, 8.2);
        fillStroke(ctx, '#7A2B22', 1.9, '#3A1A12');
        ctx.save();
        ellipse(ctx, mx, my + 3, 6.5, 8.2);
        ctx.clip();
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(mx - 7, my - 6, 14, 3.4);
        ellipse(ctx, mx, my + 9, 4.2, 2.6);
        ctx.fillStyle = '#E8736A';
        ctx.fill();
        ctx.restore();
        break;
      case 'flat':
        ctx.beginPath();
        ctx.moveTo(mx - 3.5, my);
        ctx.lineTo(mx + 4, my - 0.5);
        ctx.stroke();
        break;
      case 'wavy':
        ctx.beginPath();
        ctx.moveTo(mx - 5, my + 1);
        ctx.quadraticCurveTo(mx - 2.5, my - 2, mx, my + 1);
        ctx.quadraticCurveTo(mx + 2.5, my + 4, mx + 5, my + 1);
        ctx.stroke();
        break;
      case 'tongue':
        ctx.beginPath();
        ctx.arc(mx, my - 3, 4.5, 0.35, Math.PI - 0.35);
        ctx.stroke();
        ellipse(ctx, mx + 4, my + 1.5, 2.4, 2, 0.4);
        fillStroke(ctx, '#E8736A', 1.4, '#3A1A12');
        break;
      default: // smile
        ctx.beginPath();
        ctx.arc(mx, my - 4, 5, 0.3, Math.PI - 0.3);
        ctx.stroke();
    }

    // sweat drops
    if (p.sweat > 0) {
      const k = p.sweat;
      const drops = [[-30, -16, 1], [36, -22, 0.8]];
      for (const [x, y, s] of drops) {
        ctx.save();
        ctx.globalAlpha *= clamp(k * 2);
        ctx.translate(x, y + (1 - k) * -6);
        ctx.scale(s, s);
        ctx.beginPath();
        ctx.moveTo(0, -7);
        ctx.bezierCurveTo(3, -2, 4.5, 1, 4.5, 3);
        ctx.arc(0, 3, 4.5, 0, Math.PI);
        ctx.bezierCurveTo(-4.5, 1, -3, -2, 0, -7);
        fillStroke(ctx, '#9ADCF7', 1.6, '#3C7FA6');
        ctx.restore();
      }
    }
  }

  // ---------------------------------------------------------------- gaits
  /** Foot / hand targets for a run (or walk) cycle. phase in radians. */
  DL.gait = function (phase, o = {}) {
    const stride = o.stride ?? 13, lift = o.lift ?? 12, arm = o.arm ?? 1;
    const foot = (ph) => {
      const u = (((ph / TAU) % 1) + 1) % 1;
      if (u < 0.5) {
        const k = u / 0.5;
        return [lerp(stride, -stride, k), -5, 0];
      }
      const k = (u - 0.5) / 0.5;
      return [lerp(-stride, stride, E.inOutQuad(k)), -5 - Math.sin(Math.PI * k) * lift, -0.25 * Math.sin(Math.PI * k)];
    };
    const f = foot(phase), b = foot(phase + Math.PI);
    const swing = Math.sin(phase) * 0.95 * arm;
    const bend = o.walk ? 0.5 : 1.55;
    const hand = (sh, a) => {
      const au = Math.PI / 2 - a;
      const fa = au - bend;
      return [sh[0] + Math.cos(au) * 12.5 + Math.cos(fa) * 12, sh[1] + Math.sin(au) * 12.5 + Math.sin(fa) * 12];
    };
    return {
      footF: [f[0], f[1]], footB: [b[0], b[1]], footRotF: f[2], footRotB: b[2],
      handF: hand([7, -27], -swing), handB: hand([-7, -27], swing),
      bob: -(o.bounce ?? 3) * Math.abs(Math.cos(phase)),
      braid: Math.sin(phase * 2) * 0.25,
      skirtSway: Math.sin(phase),
    };
  };

  // ---------------------------------------------------------------- peacock
  const PC = {
    body: '#1E63D6', bodyDark: '#1446A6', belly: '#3C86EA', ol: '#0F2A66',
    tail: '#2E9E62', tailDark: '#1E7A4A', tailOl: '#145C37',
    eyeGold: '#EBC045', eyeTeal: '#17A2A0', eyeNavy: '#1A2D80',
    beak: '#E3A63A', leg: '#D69A45',
  };
  const PEA_DEFAULTS = {
    x: 0, y: 830, s: 1.05, face: 1, fan: 0, bob: 0, jump: 0, tilt: 0,
    neck: 0, headTilt: 0, eyes: 'open', wing: 0, crest: 0, alpha: 1,
    footF: [5, -1], footB: [-5, -1], tailSwing: 0, shadow: 1,
  };

  DL.drawPeacock = function (ctx, pose) {
    const p = Object.assign({}, PEA_DEFAULTS, pose);
    if (p.alpha <= 0) return;
    ctx.save();
    ctx.globalAlpha *= p.alpha;
    ctx.translate(p.x, p.y);
    ctx.scale(p.face * p.s, p.s);
    if (p.shadow) {
      ctx.save();
      ctx.globalAlpha *= 0.12 * clamp(1 - p.jump / 50);
      ellipse(ctx, -4, 1, 26 + p.fan * 20, 4.5);
      ctx.fillStyle = '#4A4020';
      ctx.fill();
      ctx.restore();
    }
    ctx.translate(0, -p.jump + p.bob);
    ctx.rotate(p.tilt);

    drawTail(ctx, p);
    drawBirdLeg(ctx, [-4, -31], p.footB, true);
    // body
    ellipse(ctx, 0, -42, 21, 16, -0.3);
    fillStroke(ctx, PC.body, 2.4, PC.ol);
    ctx.save();
    ellipse(ctx, 0, -42, 21, 16, -0.3);
    ctx.clip();
    ellipse(ctx, 8, -36, 12, 9, -0.3);
    ctx.fillStyle = PC.belly;
    ctx.fill();
    ctx.restore();
    drawBirdLeg(ctx, [4, -31], p.footF, false);
    // wing
    ctx.save();
    ctx.translate(2, -48);
    ctx.rotate(-p.wing);
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.bezierCurveTo(6, 2, 4, 14, -6, 16);
    ctx.bezierCurveTo(-14, 17, -22, 12, -24, 6);
    ctx.bezierCurveTo(-16, 6, -8, 2, 0, 0);
    fillStroke(ctx, '#B98B55', 2, '#5E3F1E');
    ctx.strokeStyle = '#8A6136';
    ctx.lineWidth = 1.2;
    for (let i = 0; i < 3; i++) {
      ctx.beginPath();
      ctx.moveTo(-6 - i * 5, 6 + i);
      ctx.lineTo(-10 - i * 5, 12 + i);
      ctx.stroke();
    }
    ctx.restore();
    // neck + head
    const nx = 20 + p.neck * 10, ny = -76 + p.neck * 6;
    ctx.save();
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(8, -48);
    ctx.quadraticCurveTo(nx - 2, -56, nx, ny);
    ctx.strokeStyle = PC.ol;
    ctx.lineWidth = 15;
    ctx.stroke();
    ctx.strokeStyle = PC.body;
    ctx.lineWidth = 10.5;
    ctx.stroke();
    ctx.restore();
    ctx.save();
    ctx.translate(nx + 1, ny - 6);
    ctx.rotate(p.headTilt);
    // crest
    const cr = 1 + p.crest * 0.35;
    ctx.strokeStyle = PC.bodyDark;
    ctx.lineWidth = 1.3;
    for (const a of [-2.0, -1.62, -1.25]) {
      const ex = Math.cos(a) * 15 * cr, ey = Math.sin(a) * 15 * cr - 5;
      ctx.beginPath();
      ctx.moveTo(0, -6);
      ctx.lineTo(ex, ey);
      ctx.stroke();
      ellipse(ctx, ex, ey, 2.6, 2.2);
      fillStroke(ctx, PC.eyeTeal, 1.1, PC.ol);
    }
    circle(ctx, 0, 0, 8.6);
    fillStroke(ctx, PC.body, 2.2, PC.ol);
    // beak
    ctx.beginPath();
    ctx.moveTo(6.5, -3);
    ctx.quadraticCurveTo(13, -1.5, 16, 0.5);
    ctx.quadraticCurveTo(12, 2.4, 6.5, 2.6);
    ctx.closePath();
    fillStroke(ctx, PC.beak, 1.6, '#7A4A12');
    // eye patch + eye
    ellipse(ctx, 3, -2, 4.4, 2.6, -0.2);
    ctx.fillStyle = '#FFFFFF';
    ctx.fill();
    if (p.eyes === 'wide') {
      circle(ctx, 3.2, -2.2, 3.4);
      fillStroke(ctx, '#FFFFFF', 1.2, '#111');
      circle(ctx, 3.6, -2.2, 1.4);
      ctx.fillStyle = '#111';
      ctx.fill();
    } else if (p.eyes === 'happy') {
      ctx.strokeStyle = '#111';
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.arc(3.2, -1, 2.4, Math.PI * 1.1, Math.PI * 1.9);
      ctx.stroke();
    } else {
      circle(ctx, 3.4, -2.2, 2);
      ctx.fillStyle = '#111';
      ctx.fill();
      circle(ctx, 4, -2.9, 0.7);
      ctx.fillStyle = '#FFF';
      ctx.fill();
    }
    ctx.restore();
    ctx.restore();
  };

  function drawBirdLeg(ctx, hip, foot, back) {
    const knee = ik(hip[0], hip[1], foot[0], foot[1], 15, 15, 1);
    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    const col = back ? '#B57E33' : PC.leg;
    ctx.strokeStyle = '#6B4515';
    ctx.lineWidth = 5.4;
    DL.poly(ctx, [hip, knee, foot]);
    ctx.stroke();
    ctx.strokeStyle = col;
    ctx.lineWidth = 3;
    ctx.stroke();
    // toes
    ctx.strokeStyle = '#6B4515';
    ctx.lineWidth = 2.6;
    ctx.beginPath();
    for (const a of [-0.25, 0.05, 0.35]) {
      ctx.moveTo(foot[0], foot[1]);
      ctx.lineTo(foot[0] + Math.cos(a) * 8, foot[1] + Math.sin(a) * 3 + 1);
    }
    ctx.moveTo(foot[0], foot[1]);
    ctx.lineTo(foot[0] - 5, foot[1] + 1);
    ctx.stroke();
    ctx.restore();
  }

  function drawTail(ctx, p) {
    const N = 13;
    const s = clamp(p.fan);
    const es = E.inOutCubic(s);
    const cx = -10, cy = -44;
    const feathers = [];
    for (let i = 0; i < N; i++) {
      const u = i / (N - 1);
      const foldA = (lerp(166, 186, u) * Math.PI) / 180 + p.tailSwing * 0.12 * (0.5 + u);
      const fanA = (lerp(160, 380, u) * Math.PI) / 180;
      const a = lerp(foldA, fanA, es);
      const len = lerp(lerp(86, 74, Math.abs(u - 0.5) * 2), 72 - Math.abs(u - 0.5) * 10, es);
      feathers.push({ a, len, u });
    }
    // draw outer feathers first so the middle ones sit on top
    feathers.sort((f1, f2) => Math.abs(f2.u - 0.5) - Math.abs(f1.u - 0.5));
    const vw = lerp(6.5, 11, es);
    for (const f of feathers) {
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(f.a);
      // vane
      ctx.beginPath();
      ctx.moveTo(4, 0);
      ctx.quadraticCurveTo(f.len * 0.55, -vw * 1.15, f.len, 0);
      ctx.quadraticCurveTo(f.len * 0.55, vw * 1.15, 4, 0);
      fillStroke(ctx, f.u > 0.45 && f.u < 0.55 ? PC.tail : PC.tailDark, 1.6, PC.tailOl);
      // shaft
      ctx.strokeStyle = 'rgba(20,80,50,0.7)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(4, 0);
      ctx.lineTo(f.len - 4, 0);
      ctx.stroke();
      // eye spot
      const ex = f.len - 9;
      ellipse(ctx, ex, 0, 6.6, 5.2);
      fillStroke(ctx, PC.eyeGold, 1.2, '#8A6A12');
      ellipse(ctx, ex + 0.5, 0, 4.4, 3.5);
      ctx.fillStyle = PC.eyeTeal;
      ctx.fill();
      ellipse(ctx, ex + 1, 0, 2.4, 2.1);
      ctx.fillStyle = PC.eyeNavy;
      ctx.fill();
      ctx.restore();
    }
  }
})();
