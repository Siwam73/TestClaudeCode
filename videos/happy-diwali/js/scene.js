/* scene.js — the story timeline. Every function here maps time -> pose, and
 * DL.renderFrame(ctx, t) composes one finished frame. */
(function () {
  'use strict';
  const DL = window.DL;
  const { T, GROUND, W, H, kf, E, clamp, lerp, prog, TAU, noise1 } = DL;

  /** Numerical integral of fn over time, as a fast lookup function. */
  function integral(fn, t0, t1, dt = 1 / 1000) {
    const n = Math.ceil((t1 - t0) / dt) + 1;
    const tab = new Float64Array(n);
    let acc = 0;
    for (let i = 1; i < n; i++) {
      const ta = t0 + (i - 1) * dt;
      acc += 0.5 * (fn(ta) + fn(ta + dt)) * dt;
      tab[i] = acc;
    }
    return (t) => {
      const x = (t - t0) / dt;
      if (x <= 0) return 0;
      if (x >= n - 1) return tab[n - 1];
      const i = Math.floor(x);
      return tab[i] + (tab[i + 1] - tab[i]) * (x - i);
    };
  }
  /** Step function: value of the last key whose time <= t. */
  function pick(t, keys) {
    let v = keys[0][1];
    for (const [kt, kv] of keys) if (t >= kt) v = kv;
    return v;
  }
  const ramp = (t, a, b) => E.inOutQuad(prog(t, a, b));
  const RET_GROUND = 965; // the kids come back below the title
  DL.RET_GROUND = RET_GROUND;

  // ------------------------------------------------------------- camera
  const RUN = 330; // chase speed (design px / s)
  const EXIT = 430; // a final burst of speed as they flee off screen
  const camSpeed = (t) =>
    kf(t, [[T.camStart, 0], [T.camStart + 0.4, RUN, 'inOutQuad'], [T.camStop, RUN], [T.camStop + 0.3, 0, 'outQuad']]);
  const camX = integral(camSpeed, 0, DL.DURATION + 1);
  const exitShift = integral((t) => (t < T.camStop ? 0 : EXIT * ramp(t, T.camStop, T.camStop + 0.25) - camSpeed(t)), 0, DL.DURATION + 1);
  DL.camX = camX;

  // gait phases (cycles integrated from a frequency schedule)
  const boyFreq = (t) =>
    kf(t, [[0, 3.7], [0.95, 3.7], [1.35, 0, 'outQuad'], [T.runStart, 0], [T.runStart + 0.3, 4.1, 'inQuad'],
      [T.trip - 0.02, 4.1], [T.trip + 0.05, 0, 'linear'], [T.pullUp + 0.1, 0], [T.pullUp + 0.35, 4.5, 'inQuad'],
      [T.camStop, 4.2], [T.camStop + 0.25, 5.2], [14.5, 5.2], [14.6, 0], [T.kidsReturn, 0], [T.kidsReturn + 0.1, 3.3],
      [T.kidsReturn + 0.85, 3.3], [T.kidsReturn + 1.2, 0, 'outQuad']]);
  const girlFreq = (t) =>
    kf(t, [[0, 3.7], [0.85, 3.7], [1.25, 0, 'outQuad'], [T.runStart, 0], [T.runStart + 0.3, 4.1, 'inQuad'],
      [10.08, 4.1], [10.14, 0, 'linear'], [10.4, 0], [10.42, 4.6], [10.6, 4.6], [10.62, 0], [T.pullUp + 0.12, 0],
      [T.pullUp + 0.35, 4.5, 'inQuad'], [T.camStop, 4.2], [T.camStop + 0.25, 5.2], [14.5, 5.2], [14.6, 0],
      [T.kidsReturn - 0.05, 0], [T.kidsReturn + 0.05, 3.3], [T.kidsReturn + 0.75, 3.3], [T.kidsReturn + 1.1, 0, 'outQuad']]);
  const peaFreq = (t) =>
    kf(t, [[0, 4.4], [1.05, 4.4], [1.45, 0, 'outQuad'], [T.runStart, 0], [T.runStart + 0.3, 5.0, 'inQuad'],
      [T.camStop, 5.0], [T.camStop + 0.25, 6.2], [14.5, 6.2], [14.6, 0], [T.kidsReturn + 0.15, 0],
      [T.kidsReturn + 0.25, 4.2], [T.kidsReturn + 1.05, 4.2], [T.kidsReturn + 1.4, 0, 'outQuad']]);
  const boyPhase = integral(boyFreq, 0, DL.DURATION + 1);
  const girlPhase = integral(girlFreq, 0, DL.DURATION + 1);
  const peaPhase = integral(peaFreq, 0, DL.DURATION + 1);

  // ------------------------------------------------------------- props
  const BOTTLE_X = 205;
  const ROCKET_REST = { x: BOTTLE_X - 8.5, y: GROUND - 102 };
  const FUSE = { x: BOTTLE_X - 6.5, y: GROUND - 72 };

  function bezier(p0, p1, p2, p3, u) {
    const v = 1 - u;
    return [
      v * v * v * p0[0] + 3 * v * v * u * p1[0] + 3 * v * u * u * p2[0] + u * u * u * p3[0],
      v * v * v * p0[1] + 3 * v * v * u * p1[1] + 3 * v * u * u * p2[1] + u * u * u * p3[1],
    ];
  }

  /** Rocket screen position + heading at time t (null when not visible). */
  function rocketAt(t) {
    if (t < T.launch) return { x: ROCKET_REST.x, y: ROCKET_REST.y, a: -Math.PI / 2, flame: 0, onBottle: true };
    if (t < T.rocketGone + 0.1) {
      // up, then a lazy arc away to the left
      const p = prog(t, T.launch, T.rocketGone + 0.1);
      const u = 0.18 * p + 0.82 * p * p;
      const P = (uu) =>
        bezier([ROCKET_REST.x, ROCKET_REST.y], [ROCKET_REST.x + 6, 300], [150, 150], [-110, 210], uu);
      const a0 = P(u), a1 = P(Math.min(1, u + 0.01));
      const wob = Math.sin(t * 40) * 0.05 * (1 - p);
      return { x: a0[0], y: a0[1], a: Math.atan2(a1[1] - a0[1], a1[0] - a0[0]) + wob, flame: 1 };
    }
    if (t < T.rocketBack) return null;
    if (t < T.camStop) {
      // back at kid height, chasing to the right
      const x = kf(t, [[T.rocketBack, -80], [T.rocketBack + 0.35, 160, 'outQuad'], [9.6, 175], [10.3, 168], [10.8, 150],
        [11.6, 170], [T.camStop, 180]]);
      const y = GROUND - 52 + Math.sin(t * 5.2) * 7 + noise1(t * 3, 4) * 3;
      const a = Math.cos(t * 5.2) * 0.12 + noise1(t * 4, 2) * 0.05;
      return { x: x + noise1(t * 1.3, 8) * 10, y, a, flame: 1 };
    }
    if (t < T.boom) {
      // runs out of steam: drifts to centre stage, sputtering
      const p = prog(t, T.camStop, T.boom);
      const C = [[180, GROUND - 52], [290, GROUND - 52], [280, 650], [360, 640]];
      const P = bezier(C[0], C[1], C[2], C[3], E.outQuad(p));
      const P2 = bezier(C[0], C[1], C[2], C[3], E.outQuad(Math.min(1, p + 0.02)));
      const shake = prog(t, 13.8, T.boom);
      const jx = noise1(t * 40, 1) * 3 * shake, jy = noise1(t * 40, 2) * 3 * shake;
      const sput = t > 13.9 ? (noise1(t * 18, 6) > -0.1 ? 1 : 0.15) : 1;
      return {
        x: P[0] + jx, y: P[1] + jy,
        a: Math.atan2(P2[1] - P[1], P2[0] - P[0] + 0.0001) + noise1(t * 30, 3) * 0.2 * shake,
        flame: sput * (1 - 0.4 * shake),
      };
    }
    return null;
  }
  DL.rocketAt = rocketAt;

  function drawRocketTrail(ctx, t) {
    // puffs emitted along the path; world-anchored so they stream past during the chase
    const emitRanges = [[T.launch, T.rocketGone + 0.1], [T.rocketBack, T.boom - 0.02]];
    for (const [t0, t1] of emitRanges) {
      DL.emit(t, t0, t1, 36, 0.85, (te, age, i) => {
        const r = rocketAt(te);
        if (!r) return;
        const back = 22;
        const ex = r.x - Math.cos(r.a) * back, ey = r.y - Math.sin(r.a) * back;
        const sx = ex - (camX(t) - camX(te));
        const k = age / 0.85;
        const drift = (DL.r01(i, 3) - 0.5) * 18 * k;
        const rad = (4 + k * 14) * (0.8 + DL.r01(i, 4) * 0.5);
        DL.drawPuff(ctx, sx + drift, ey - k * 14 + drift * 0.4, rad, (1 - k) * 0.55);
      });
    }
    // sparks
    for (const [t0, t1] of emitRanges) {
      DL.emit(t, t0, t1, 60, 0.28, (te, age, i) => {
        const r = rocketAt(te);
        if (!r || r.flame < 0.5) return;
        const k = age / 0.28;
        const sp = 120 + DL.r01(i, 8) * 140;
        const ang = r.a + Math.PI + (DL.r01(i, 9) - 0.5) * 0.9;
        const x0 = r.x - Math.cos(r.a) * 30, y0 = r.y - Math.sin(r.a) * 30;
        const x = x0 + Math.cos(ang) * sp * age - (camX(t) - camX(te));
        const y = y0 + Math.sin(ang) * sp * age + 90 * age * age;
        ctx.fillStyle = k < 0.5 ? '#FFF1B0' : '#FFB347';
        ctx.globalAlpha = 1 - k;
        DL.circle(ctx, x, y, 1.6 * (1 - k * 0.5));
        ctx.fill();
        ctx.globalAlpha = 1;
      });
    }
  }

  // ------------------------------------------------------------- helpers
  /** Root-space point -> upper-body space of a kid pose (for aiming hands). */
  function toUpper(pt, crouch, lean, bob = 0) {
    const hx = 0, hy = -34 + crouch * 15 + bob;
    const dx = pt[0] - hx, dy = pt[1] - hy;
    const c = Math.cos(-lean), s = Math.sin(-lean);
    return [dx * c - dy * s, dx * s + dy * c];
  }
  const SCALE = 1.12;
  // faceplant geometry: rotate around the feet to fall, around the shoulder to get up
  const FALL_ROT = 1.42;
  const PIVOT_FEET = [10, 0], PIVOT_SHOULDER = [7, -61];
  const PULL_DX = (() => {
    const ax = PIVOT_FEET[0] - PIVOT_SHOULDER[0], ay = PIVOT_FEET[1] - PIVOT_SHOULDER[1];
    const c = Math.cos(FALL_ROT), sn = Math.sin(FALL_ROT);
    return ax - (ax * c - ay * sn);
  })();
  const PULL_DY = (() => {
    const ax = PIVOT_FEET[0] - PIVOT_SHOULDER[0], ay = PIVOT_FEET[1] - PIVOT_SHOULDER[1];
    const c = Math.cos(FALL_ROT), sn = Math.sin(FALL_ROT);
    return ay - (ax * sn + ay * c);
  })();
  const blink = (t, times) => times.some((b) => t >= b && t < b + 0.11);

  // chase "breathing" so the group never looks frozen
  const wob = (t, seed, amp) => noise1(t * 0.9, seed) * amp;

  // ------------------------------------------------------------- the girl
  function girlPose(t) {
    const p = { s: SCALE, y: GROUND };
    // --- x position & facing
    if (t < T.runStart) {
      p.face = -1;
      p.x = kf(t, [[0, 650], [0.85, 345, 'linear'], [1.25, 275, 'outQuad'], [2.25, 275], [2.6, 300, 'inOutQuad']]);
    } else if (t < T.camStop) {
      p.face = pick(t, [[0, 1], [10.42, -1], [T.pullUp, 1]]);
      p.x = kf(t, [[T.runStart, 300], [5.85, 490, 'inOutQuad'], [10.12, 490], [10.4, 476, 'outQuad'],
        [10.58, 466, 'inOutQuad'], [T.pullUp + 0.2, 474], [11.6, 490, 'inOutQuad'], [T.camStop, 490]]);
      if (t > 5.85 && t < 10.0) p.x += wob(t, 11, 10) * prog(t, 5.85, 6.3);
    } else if (t < T.boom) {
      p.face = 1;
      p.x = 490 + exitShift(t);
    } else {
      p.face = t > T.kidsReturn + 1.25 ? 1 : -1;
      p.y = RET_GROUND;
      p.x = kf(t, [[T.kidsReturn, 800], [T.kidsReturn + 1.1, 248, 'outQuad']]);
    }

    // --- body pose by beat
    const ph = girlPhase(t) * TAU;
    if (t < 1.25) {
      Object.assign(p, DL.gait(ph, { stride: 17, lift: 11, bounce: 3 }), { lean: 0.1, eyes: 'open', mouth: 'grin' });
      p.handF = [17, -12];
      p.stick = { angle: -0.75, t };
    } else if (t < 2.6) {
      // crouch, aim the incense stick at the fuse, then scramble back
      const cr = ramp(t, 1.2, 1.5) * (1 - ramp(t, 2.25, 2.55));
      const lean = 0.32 * cr;
      p.crouch = cr;
      p.lean = lean;
      p.footF = [lerp(7, 13, cr), -5];
      p.footB = [lerp(-6, -5, cr), -5];
      const reach = ramp(t, 1.5, 1.92) * (1 - ramp(t, 2.06, 2.3));
      // target: put the stick tip on the fuse
      const tipL = [(p.x - FUSE.x) / SCALE, (FUSE.y - p.y) / SCALE];
      const a = -0.42;
      const handRoot = [tipL[0] - Math.cos(a) * 44, tipL[1] - Math.sin(a) * 44];
      const rest = [17, -12];
      const aimUp = toUpper(handRoot, cr, lean);
      p.handF = [lerp(rest[0], aimUp[0], reach), lerp(rest[1], aimUp[1], reach)];
      p.stick = { angle: lerp(-0.75, a, reach) + (t > 2.06 ? -0.35 * ramp(t, 2.06, 2.4) : 0), t };
      p.eyes = pick(t, [[0, 'open'], [1.5, 'focus'], [2.02, 'wide'], [2.3, 'happy']]);
      p.mouth = pick(t, [[0, 'grin'], [1.5, 'tongue'], [2.02, 'o'], [2.3, 'grin']]);
      p.brows = t > 2.02 && t < 2.3 ? 'up' : 'normal';
      p.look = t < 2.02 ? [1, 0.4] : [0, 0];
    } else if (t < T.launch) {
      // waiting: wince, cover one ear, hold the stick high
      const k = ramp(t, 2.6, 2.8);
      p.handB = [lerp(-12, -24, k), lerp(-4, -58, k)];
      p.handF = [17, -12];
      p.stick = { angle: -0.8, t };
      p.bob = -Math.abs(Math.sin(t * 9)) * 1.5 * k;
      p.eyes = t > 2.75 ? 'squeeze' : 'happy';
      p.mouth = 'grin';
    } else if (t < T.shock) {
      // watch the rocket go… then relief… then that whistle
      const look = ramp(t, T.launch, T.launch + 0.3) * (1 - ramp(t, T.rocketGone, T.rocketGone + 0.3));
      p.headTilt = -0.42 * look;
      p.lean = -0.08 * look;
      p.look = [0.6 * look, -1 * look];
      p.handB = [-12, -4];
      p.handF = [17, -12];
      p.stick = { angle: -0.8 - 0.4 * look, t };
      p.eyes = pick(t, [[0, 'open'], [T.rocketGone + 0.05, 'happy'], [4.72, 'open']]);
      p.mouth = pick(t, [[0, 'o'], [T.rocketGone + 0.05, 'grin'], [4.72, 'flat']]);
      p.headFace = t > T.rocketGone + 0.05 && t < 4.72 ? -1 : 1;
      p.brows = t > 4.72 ? 'up' : 'normal';
      if (t > 4.72) p.look = [1, 0];
    } else if (t < T.runStart) {
      // SHOCK
      const k = prog(t, T.shock, T.runStart);
      p.lift = Math.sin(Math.PI * k) * 14;
      p.handF = [16, -44];
      p.handB = [-16, -44];
      p.eyes = 'wide';
      p.mouth = 'scream';
      p.brows = 'up';
      p.sweat = 1;
      p.look = [1, 0];
      p.stick = { angle: -1.9, t };
    } else if (t < T.boom) {
      // RUN (with the rescue in the middle)
      Object.assign(p, DL.gait(ph, { stride: 18, lift: 13, bounce: 4 }));
      p.lean = 0.24;
      p.eyes = 'wide';
      p.mouth = Math.floor(t * 3) % 3 === 0 ? 'open' : 'scream';
      p.sweat = 1;
      p.look = [1, 0];
      p.stick = { angle: -2.3, t };
      if (t > 10.0 && t < 10.42) {
        // notice + skid
        p.headFace = t > 10.02 ? -1 : 1;
        if (t > 10.14) {
          p.lean = -0.22;
          p.footF = [16, -5];
          p.footB = [2, -5];
          p.handF = [16, -30];
          p.handB = [-14, -30];
        }
        p.mouth = 'o';
      } else if (t >= 10.42 && t < T.pullUp) {
        // lunge back and grab his hand
        p.lean = 0.35;
        p.handF = [30, -2];
        p.eyes = 'wide';
        p.mouth = 'open';
        if (t > 10.6) {
          p.footF = [14, -5];
          p.footB = [-8, -5];
        }
      } else if (t >= T.pullUp && t < 11.0) {
        p.handB = [-30, -14 - 20 * prog(t, T.pullUp, T.pullUp + 0.2)];
        p.mouth = 'grin';
        p.brows = 'angry';
      }
    } else {
      // after the boom: walk back in and wave
      Object.assign(p, waveOrWalk(t, ph, 0.25));
    }
    if (p.eyes === 'open' && blink(t, [0.55, 3.15, 6.6, 8.9, 12.0, 18.6, 20.4])) p.eyes = 'closed';
    return p;
  }

  // ------------------------------------------------------------- the boy
  function boyPose(t) {
    const p = { s: SCALE, y: GROUND };
    if (t < T.runStart) {
      p.face = -1;
      p.x = kf(t, [[0, 745], [0.95, 425, 'linear'], [1.35, 362, 'outQuad'], [2.1, 362], [2.45, 395, 'inOutQuad']]);
    } else if (t < T.camStop) {
      p.face = 1;
      p.x = kf(t, [[T.runStart, 395], [5.85, 360, 'inOutQuad'], [T.trip, 360], [T.land, 368, 'outQuad'],
        [10.5, 280, 'inQuad'], [T.pullUp, 262, 'outQuad'], [T.pullUp + 0.2, 262], [11.6, 290, 'inOutQuad'], [T.camStop, 290]]);
      if (t >= T.pullUp) p.x += PULL_DX * SCALE;
      if (t > 5.85 && t < T.trip - 0.2) p.x += wob(t, 21, 9) * prog(t, 5.85, 6.3);
    } else if (t < T.boom) {
      p.face = 1;
      p.x = 360 + exitShift(t);
    } else {
      p.face = -1;
      p.y = RET_GROUND;
      p.x = kf(t, [[T.kidsReturn, 880], [T.kidsReturn + 1.2, 352, 'outQuad']]);
    }

    const ph = boyPhase(t) * TAU;
    if (t < 1.35) {
      Object.assign(p, DL.gait(ph, { stride: 17, lift: 11, bounce: 3 }), { lean: 0.1, eyes: 'open', mouth: 'grin' });
    } else if (t < 2.45) {
      const cr = ramp(t, 1.3, 1.6) * (1 - ramp(t, 2.1, 2.4));
      p.crouch = cr;
      p.lean = 0.3 * cr;
      p.footF = [lerp(7, 12, cr), -5];
      p.footB = [lerp(-6, -4, cr), -5];
      p.handF = [lerp(13, 21, cr), lerp(-4, 4, cr)];
      p.handB = [lerp(-12, 6, cr), lerp(-4, 6, cr)];
      p.eyes = pick(t, [[0, 'open'], [2.0, 'wide']]);
      p.mouth = pick(t, [[0, 'o'], [2.0, 'open']]);
      p.brows = t > 2.0 ? 'up' : 'normal';
      p.look = [1, 0.5];
    } else if (t < T.launch) {
      const k = ramp(t, 2.45, 2.65);
      p.handF = [lerp(13, 30, k), lerp(-4, -60, k)];
      p.handB = [lerp(-12, -25, k), lerp(-4, -60, k)];
      p.eyes = 'squeeze';
      p.mouth = 'grin';
      p.bob = noise1(t * 25, 5) * 1.2;
    } else if (t < T.shock) {
      const look = ramp(t, T.launch + 0.05, T.launch + 0.35) * (1 - ramp(t, T.rocketGone, T.rocketGone + 0.3));
      const ears = 1 - ramp(t, 3.75, 4.0);
      p.handF = [lerp(13, 30, ears), lerp(-4, -60, ears)];
      p.handB = [lerp(-12, -25, ears), lerp(-4, -60, ears)];
      p.headTilt = -0.4 * look;
      p.lean = -0.1 * look;
      p.look = [0.5 * look, -1 * look];
      p.eyes = pick(t, [[0, 'open'], [T.rocketGone + 0.08, 'happy'], [4.74, 'open']]);
      p.mouth = pick(t, [[0, 'o'], [T.rocketGone + 0.08, 'grin'], [4.74, 'flat']]);
      p.brows = t > 4.74 ? 'up' : 'normal';
      if (t > T.rocketGone + 0.1 && t < 4.7) {
        // thumbs-up-ish fist pump
        p.handF = [18, -40 + Math.sin((t - 4.5) * 18) * 3];
      }
      if (t > 4.74) p.look = [1, 0];
    } else if (t < T.runStart) {
      const k = prog(t, T.shock + 0.03, T.runStart);
      p.lift = Math.sin(Math.PI * k) * 16;
      p.handF = [18, -46];
      p.handB = [-18, -46];
      p.eyes = 'wide';
      p.mouth = 'scream';
      p.brows = 'up';
      p.sweat = 1;
      p.look = [1, 0];
    } else if (t < T.boom) {
      Object.assign(p, DL.gait(ph, { stride: 18, lift: 13, bounce: 4 }));
      p.lean = 0.24;
      p.eyes = 'wide';
      p.mouth = Math.floor(t * 3 + 1) % 3 === 0 ? 'open' : 'scream';
      p.sweat = 1;
      p.look = [1, 0];
      if (t >= T.trip && t < T.pullUp + 0.22) {
        // trip -> faceplant -> slide (rotating forward around the feet)
        const fall = E.inQuad(prog(t, T.trip, T.land));
        p.rot = FALL_ROT * fall;
        p.pivot = PIVOT_FEET;
        p.lift = Math.sin(Math.PI * prog(t, T.trip, T.land)) * 10;
        p.footF = [10, -5];
        p.footB = [-14, -12];
        p.handF = [lerp(20, 36, fall), lerp(-20, -40, fall)];
        p.handB = [-2, -40];
        p.eyes = t < T.land ? 'wide' : 'squeeze';
        p.mouth = t < T.land ? 'scream' : 'wavy';
        p.sweat = 0;
        if (t >= T.pullUp) {
          // yanked up by the arm: rotate around the shoulder instead. The pivot
          // switch is compensated (PULL_DX / PULL_DY) so nothing jumps.
          const up = E.outBack(prog(t, T.pullUp, T.pullUp + 0.22));
          p.pivot = PIVOT_SHOULDER;
          p.rot = FALL_ROT * (1 - up);
          p.lift = -PULL_DY * (1 - up);
          p.handF = [lerp(36, 24, up), lerp(-40, -50, up)];
          p.eyes = 'wide';
          p.mouth = 'open';
          p.footB = [lerp(-14, -6, up), -5];
        }
      } else if (t >= T.pullUp + 0.22 && t < 11.2) {
        p.sweat = 1;
      }
    } else {
      Object.assign(p, waveOrWalk(t, ph, 0));
    }
    if (p.eyes === 'open' && blink(t, [0.8, 2.9, 7.4, 9.2, 11.8, 18.1, 20.0])) p.eyes = 'closed';
    return p;
  }

  /** After the explosion both kids walk back in, then wave. */
  function waveOrWalk(t, ph, delay) {
    const tr = T.kidsReturn + delay;
    if (t < tr + 1.1) {
      return Object.assign(DL.gait(ph, { stride: 15, lift: 10, bounce: 3 }), { lean: 0.1, eyes: 'happy', mouth: 'grin' });
    }
    // "ta-da!" — arms flung wide (chibi arms can't reach above that big head), little hops
    const w = t - (tr + 1.2);
    const k = ramp(t, tr + 1.15, tr + 1.4);
    const hop = Math.max(0, Math.sin(w * 7 + delay * 9));
    const wig = Math.sin(w * 14) * 4 * k;
    return {
      handF: [lerp(13, 36, k), lerp(-4, -38, k) + wig],
      handB: [lerp(-12, -32, k), lerp(-4, -38, k) - wig],
      eyes: w > 0 && Math.floor(w * 1.1) % 3 === 2 ? 'open' : 'happy',
      mouth: 'grin',
      headTilt: Math.sin(w * 3.5) * 0.05,
      lift: hop * 9 * k,
      crouch: 0.15 * (1 - hop) * k,
    };
  }

  // ------------------------------------------------------------- the peacock
  function peacockPose(t) {
    const p = { y: GROUND, s: 1.05 };
    const ph = peaPhase(t) * TAU;
    if (t < T.runStart) {
      p.face = -1;
      p.x = kf(t, [[0, 890], [1.05, 552, 'linear'], [1.45, 502, 'outQuad']]);
    } else if (t < T.camStop) {
      p.face = 1;
      p.x = kf(t, [[T.runStart, 502], [5.8, 615, 'inOutQuad']]) + (t > 5.8 ? wob(t, 31, 8) * prog(t, 5.8, 6.3) : 0);
    } else if (t < T.boom) {
      p.face = 1;
      p.x = 615 + exitShift(t) * 1.1;
    } else {
      p.face = -1;
      p.y = RET_GROUND;
      p.x = kf(t, [[T.kidsReturn + 0.15, 840], [T.kidsReturn + 1.45, 488, 'outQuad']]);
    }
    const g = DL.gait(ph, { stride: 15, lift: 12 });
    const moving = (t < 1.45) || (t > T.runStart && t < T.boom) || (t > T.kidsReturn && t < T.kidsReturn + 1.45);
    if (moving) {
      p.footF = [g.footF[0], g.footF[1] + 4];
      p.footB = [g.footB[0], g.footB[1] + 4];
      p.bob = g.bob * 0.8;
      p.neck = 0.35 + Math.sin(ph * 2) * 0.25;
    }
    if (t < T.shock) {
      p.fan = ramp(t, 1.5, 2.15) * (1 - ramp(t, T.shock - 0.02, T.shock + 0.15));
      p.eyes = pick(t, [[0, 'open'], [1.6, 'happy'], [T.launch, 'wide'], [T.launch + 0.35, 'open'], [T.rocketGone + 0.1, 'happy'], [4.74, 'open']]);
      p.tailSwing = t > 2.15 ? Math.sin(t * 30) * 0.15 : 0;
      if (t > T.launch && t < T.launch + 0.3) {
        p.jump = Math.sin(Math.PI * prog(t, T.launch, T.launch + 0.3)) * 7;
        p.crest = 1;
      }
      const look = ramp(t, T.launch + 0.1, T.launch + 0.4) * (1 - ramp(t, T.rocketGone, T.rocketGone + 0.3));
      p.headTilt = -0.6 * look;
    } else if (t < T.runStart) {
      const k = prog(t, T.shock, T.runStart);
      p.jump = Math.sin(Math.PI * k) * 22;
      p.fan = 1 - ramp(t, T.shock, T.shock + 0.15);
      p.eyes = 'wide';
      p.crest = 1;
      p.wing = 0.9;
    } else if (t < T.boom) {
      p.eyes = 'wide';
      p.crest = 1;
      p.wing = 0.5 + Math.sin(t * 34) * 0.5;
      p.tailSwing = Math.sin(ph) * 1;
      p.neck = 0.7 + Math.sin(ph * 2) * 0.15;
      if (t > 10.05 && t < 10.9) p.headTilt = -0.3;
    } else if (t > T.kidsReturn + 1.45) {
      p.fan = ramp(t, T.kidsReturn + 1.5, T.kidsReturn + 2.1);
      p.eyes = 'happy';
      p.tailSwing = Math.sin(t * 28) * 0.12 * p.fan;
    } else {
      p.eyes = 'happy';
    }
    return p;
  }

  // ------------------------------------------------------------- dust & marks
  function footDust(ctx, t, posFn, phaseFn, freqFn, t0, t1, seed) {
    // one dust puff per foot plant (twice per gait cycle)
    const cyc0 = phaseFn(t0), cyc1 = phaseFn(Math.min(t, t1));
    for (let k = Math.ceil(cyc0 * 2); k <= Math.floor(cyc1 * 2); k++) {
      // find plant time by bisection
      let a = t0, b = Math.min(t, t1);
      for (let i = 0; i < 24; i++) {
        const m = (a + b) / 2;
        if (phaseFn(m) * 2 < k) a = m;
        else b = m;
      }
      const te = b, age = t - te;
      if (age > 0.45 || freqFn(te) < 1) continue;
      const pos = posFn(te);
      const sx = pos.x - pos.face * 12 - (camX(t) - camX(te));
      DL.drawDust(ctx, sx, GROUND - 3, age, 0.45, k + seed, 0.9);
    }
  }

  function drawMark(ctx, x, y, text, t0, t, col = '#E53935') {
    const k = prog(t, t0, t0 + 0.18);
    const out = 1 - prog(t, t0 + 0.55, t0 + 0.7);
    if (k <= 0 || out <= 0) return;
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(E.outBack(k) * out, E.outBack(k) * out);
    ctx.rotate(Math.sin(t * 30) * 0.08);
    ctx.font = '800 44px "Baloo 2"';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineJoin = 'round';
    ctx.lineWidth = 7;
    ctx.strokeStyle = '#FFFFFF';
    ctx.strokeText(text, 0, 0);
    ctx.fillStyle = col;
    ctx.fillText(text, 0, 0);
    ctx.restore();
  }

  function speedLines(ctx, t) {
    const on = ramp(t, T.camStart + 0.2, T.camStart + 0.6) * (1 - ramp(t, T.camStop - 0.1, T.camStop + 0.2));
    if (on <= 0) return;
    ctx.save();
    ctx.lineCap = 'round';
    ctx.strokeStyle = 'rgba(150,145,115,0.35)';
    ctx.lineWidth = 2;
    for (let i = 0; i < 9; i++) {
      const y = GROUND - 20 - DL.r01(i, 70) * 110;
      const speed = 900 + DL.r01(i, 71) * 500;
      const len = 30 + DL.r01(i, 72) * 50;
      const x = W + 80 - (((t * speed + DL.r01(i, 73) * 2000) % (W + 200)));
      ctx.globalAlpha = on * (0.5 + DL.r01(i, 74) * 0.5);
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + len, y);
      ctx.stroke();
    }
    ctx.restore();
  }

  // ------------------------------------------------------------- frame
  DL.renderFrame = function (ctx, t, scale = 1) {
    ctx.save();
    ctx.setTransform(scale, 0, 0, scale, 0, 0);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';

    if (t < T.wipeEnd) {
      DL.drawBackground(ctx, t, scale);
      drawStory(ctx, t);
      DL.drawBadge(ctx, t);
    }
    if (t >= T.wipe && DL.drawEndCard) DL.drawEndCard(ctx, t, scale);

    ctx.restore();
  };

  function drawStory(ctx, t) {
    const cx = camX(t);
    // ground: full line until the boom, then a short stage line when the kids come back
    const groundA = 1 - ramp(t, T.boom, T.boom + 0.3);
    DL.drawGround(ctx, cx, groundA);

    // bottle (+ the rocket's stick inside it before launch)
    const tip = t < T.launch ? 0 : (Math.PI / 2) * E.outBack(prog(t, T.launch + 0.05, T.launch + 0.45)) * 0.92;
    const bx = BOTTLE_X - cx;
    if (bx > -60 && groundA > 0) {
      ctx.save();
      ctx.globalAlpha = groundA;
      const r = rocketAt(t);
      const onBottle = r && r.onBottle;
      if (onBottle) DL.drawRocket(ctx, r.x - cx, r.y, r.a, { fuse: t < T.ignite ? 1 : 1 - prog(t, T.ignite, T.launch), burning: t >= T.ignite, t });
      DL.drawBottle(ctx, bx, GROUND, tip);
      ctx.restore();
    }

    if (t < T.boom + 0.05) drawRocketTrail(ctx, t);

    // characters (draw order = depth)
    const g = girlPose(t), b = boyPose(t), pc = peacockPose(t);
    const showKids = t < T.boom || t > T.kidsReturn - 0.1;
    if (showKids) {
      // dust when running
      if (t > T.runStart && t < T.boom) {
        footDust(ctx, t, boyPose, boyPhase, boyFreq, T.runStart, T.trip, 1);
        footDust(ctx, t, boyPose, boyPhase, boyFreq, T.pullUp + 0.1, T.boom, 2);
        footDust(ctx, t, girlPose, girlPhase, girlFreq, T.runStart, T.boom, 3);
        footDust(ctx, t, peacockPose, peaPhase, peaFreq, T.runStart, T.boom, 4);
      }
      if (t > T.boom) {
        // little stage under them on the way back
        const a = ramp(t, T.kidsReturn + 0.2, T.kidsReturn + 0.8) * (1 - ramp(t, T.wipe - 0.2, T.wipe));
        if (a > 0) {
          ctx.save();
          ctx.globalAlpha = a;
          ctx.strokeStyle = DL.COLORS.ground;
          ctx.lineWidth = 1.9;
          ctx.lineCap = 'round';
          ctx.beginPath();
          ctx.moveTo(lerp(360, 165, E.outCubic(a)), RET_GROUND);
          ctx.lineTo(lerp(360, 585, E.outCubic(a)), RET_GROUND);
          ctx.stroke();
          ctx.restore();
        }
      }
      if (t < T.runStart || t > T.boom) {
        DL.drawPeacock(ctx, pc);
        DL.drawKid(ctx, 'boy', b);
        DL.drawKid(ctx, 'girl', g);
      } else {
        DL.drawPeacock(ctx, pc);
        DL.drawKid(ctx, 'girl', g);
        DL.drawKid(ctx, 'boy', b);
      }
      // skid + faceplant dust
      if (t > T.land && t < T.land + 0.5) {
        for (let i = 0; i < 3; i++) {
          DL.drawDust(ctx, b.x - 30 + i * 22 - (camX(t) - camX(T.land)), GROUND - 4, t - T.land, 0.5, 40 + i, 1.5);
        }
      }
      if (t > 10.14 && t < 10.75) {
        DL.drawDust(ctx, g.x + 8, GROUND - 3, (t - 10.14) % 0.25, 0.25, Math.floor((t - 10.14) / 0.25) + 60, 1.1);
      }
    }

    // rocket in flight (drawn above the kids)
    const r = rocketAt(t);
    if (r && !r.onBottle) DL.drawRocket(ctx, r.x, r.y, r.a, { flame: r.flame, t });

    // comic marks
    if (t > 4.6 && t < 5.5) {
      if (t < T.shock) drawMark(ctx, g.x - 4, GROUND - 170, '?', 4.72, t, '#6B5B2E');
      drawMark(ctx, g.x - 8, GROUND - 170 - (g.lift || 0) * SCALE, '!', T.shock, t);
      drawMark(ctx, b.x + 6, GROUND - 172 - (b.lift || 0) * SCALE, '!', T.shock + 0.04, t);
    }
    if (t > 10.0 && t < 10.7) drawMark(ctx, g.x, GROUND - 175, '!', 10.03, t);
    speedLines(ctx, t);

    // explosion + title
    if (t >= T.boom - 0.02 && DL.drawCelebration) DL.drawCelebration(ctx, t);
  }

  DL._debug = { girlPose, boyPose, peacockPose, camX, rocketAt };
})();
