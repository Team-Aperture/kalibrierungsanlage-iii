/**
 * The player character: a small hooded figure in a long ochre coat with a dim amber
 * lamp on the chest strap. Their identity is deliberately unknown – the face stays in
 * the shadow of the hood.
 *
 * Frames are generated from hand-tuned shapes per facing (S, SE, E, NE, N; the west
 * facings are mirrored) with 4 idle and 6 walk frames. Each frame is produced at
 * several brightness levels so the figure matches the baked room lighting.
 */

import { quantizeFlat } from './dither';
import { PALETTE_U32, RAMP } from './palette';

export const PLAYER_W = 18;
export const PLAYER_H = 32;
/** Pixel in the frame that sits on the ground point. */
export const PLAYER_ANCHOR = { x: 9, y: 30 };

export const FACINGS = ['S', 'SE', 'E', 'NE', 'N', 'NW', 'W', 'SW'] as const;
export type PlayerFacing = (typeof FACINGS)[number];

export const IDLE_FRAMES = 4;
export const WALK_FRAMES = 6;
export const FRAMES_PER_DIR = IDLE_FRAMES + WALK_FRAMES;

export const LIGHT_LEVELS = [0.42, 0.56, 0.7, 0.84, 0.98, 1.12];

/** Material codes used while drawing. */
const enum P {
  EMPTY = 0,
  COAT = 1,
  COAT_DARK = 2,
  COAT_LIGHT = 3,
  TROUSER = 4,
  BOOT = 5,
  HOOD_IN = 6,
  SKIN = 7,
  STRAP = 8,
  LAMP = 9,
  PACK = 10,
  OUTLINE = 11,
  GLOVE = 12,
  BELT = 13,
}

interface Canvas {
  w: number;
  h: number;
  px: Uint8Array;
  lum: Float32Array;
}

function blank(): Canvas {
  return { w: PLAYER_W, h: PLAYER_H, px: new Uint8Array(PLAYER_W * PLAYER_H), lum: new Float32Array(PLAYER_W * PLAYER_H) };
}

function put(c: Canvas, x: number, y: number, m: P, lum = 0): void {
  x = Math.round(x);
  y = Math.round(y);
  if (x < 0 || y < 0 || x >= c.w || y >= c.h) return;
  c.px[y * c.w + x] = m;
  c.lum[y * c.w + x] = lum;
}

function get(c: Canvas, x: number, y: number): P {
  if (x < 0 || y < 0 || x >= c.w || y >= c.h) return P.EMPTY;
  return c.px[y * c.w + x] as P;
}

/** Horizontal span [x0, x1) with left-lit shading. */
function span(c: Canvas, y: number, x0: number, x1: number, m: P, shadeBias = 0): void {
  const a = Math.round(x0);
  const b = Math.round(x1);
  for (let x = a; x < b; x++) {
    const t = b - a <= 1 ? 0.5 : (x - a) / (b - a - 1);
    put(c, x, y, m, 0.5 - t + shadeBias);
  }
}

interface Pose {
  angle: number; // 0 = facing camera (S), 90 = E, 180 = away (N)
  frame: number;
  walking: boolean;
}

function drawFigure(pose: Pose): Canvas {
  const c = blank();
  const a = (pose.angle * Math.PI) / 180;
  const sinA = Math.sin(a);
  const cosA = Math.cos(a);
  const cx = 9;
  const phase = pose.walking ? (pose.frame / WALK_FRAMES) * Math.PI * 2 : 0;
  const bob = pose.walking ? (Math.abs(Math.cos(phase)) > 0.7 ? 0 : -1) : pose.frame === 2 ? 1 : 0;
  const breathe = !pose.walking && (pose.frame === 1 || pose.frame === 2) ? 1 : 0;
  const top = 2 + bob;

  // --- Legs (drawn first, the coat covers their tops) --------------------
  const sep = 2.4 * Math.abs(cosA) + 0.6;
  const swing = pose.walking ? Math.sin(phase) : 0;
  const lift = (s: number) => (pose.walking ? Math.max(0, s) * 2 : 0);
  const legs = [
    { side: -1, sw: swing, lift: lift(Math.sin(phase)) },
    { side: 1, sw: -swing, lift: lift(-Math.sin(phase)) },
  ];
  // Draw the far leg first.
  legs.sort((p, q) => (sinA >= 0 ? p.side - q.side : q.side - p.side));
  for (const leg of legs) {
    const fx = cx + leg.side * sep * 0.5 - 1 + leg.sw * 2.2 * Math.abs(sinA) * (sinA >= 0 ? 1 : -1) * (cosA < -0.3 ? -1 : 1);
    const fy = leg.sw * 1.2 * Math.abs(cosA) * (cosA >= 0 ? 1 : -1);
    const legTop = 22 + bob;
    const footY = 29 - leg.lift + fy * 0.5;
    for (let y = legTop; y <= footY - 1; y++) span(c, y, fx, fx + 2, P.TROUSER, leg.side < 0 ? 0.2 : -0.2);
    const toe = Math.round(sinA * 1.5);
    span(c, Math.round(footY), fx - (toe < 0 ? 1 : 0), fx + 2 + (toe > 0 ? 1 : 0), P.BOOT, 0.3);
    span(c, Math.round(footY) - 1, fx, fx + 2, P.BOOT, 0.4);
  }

  // --- Coat --------------------------------------------------------------
  const half = 4.3 - Math.abs(sinA) * 0.9;
  const hemSway = pose.walking ? Math.round(Math.sin(phase * 2) * 0.6) : 0;
  for (let y = 10; y <= 23; y++) {
    const t = (y - 10) / 13;
    const hw = half + t * 1.3 + (y === 10 ? -0.8 : 0) + (breathe && y < 13 ? 0.3 : 0);
    const yy = y + bob;
    const sway = y > 18 ? hemSway : 0;
    span(c, yy, cx - hw + sway, cx + hw + sway, P.COAT);
  }
  // Coat opening line and belt (front-facing angles).
  if (cosA > -0.2) {
    const ox = cx + sinA * (half - 0.5) - 0.5;
    for (let y = 16; y <= 23; y++) put(c, ox, y + bob, P.COAT_DARK, -0.3);
  }
  for (let x = Math.round(cx - half - 0.3); x < Math.round(cx + half + 0.6); x++) {
    if (get(c, x, 16 + bob) !== P.EMPTY) put(c, x, 16 + bob, P.BELT, 0);
  }
  // Hem shadow.
  for (let x = 0; x < c.w; x++) if (get(c, x, 23 + bob) === P.COAT) put(c, x, 23 + bob, P.COAT_DARK, -0.2);

  // --- Backpack (visible from the side and the back) ---------------------
  if (cosA < 0.4) {
    const off = -sinA * (half + 0.2);
    const pw = 2.6 + Math.max(0, -cosA) * 1.4;
    const pcx = cx + off * (cosA < -0.6 ? 0.15 : 1);
    for (let y = 11; y <= 18; y++) {
      const x0 = pcx - pw;
      const x1 = pcx + pw;
      span(c, y + bob, x0, x1, P.PACK, 0.1);
    }
    for (let x = Math.round(pcx - pw); x < Math.round(pcx + pw); x++) put(c, x, 14 + bob, P.STRAP, -0.2);
  }

  // --- Arms --------------------------------------------------------------
  const armSwing = pose.walking ? Math.sin(phase) : 0;
  const arms = [
    { side: -1, sw: -armSwing },
    { side: 1, sw: armSwing },
  ];
  for (const arm of arms) {
    // In profile only the near arm shows clearly.
    const near = sinA >= 0 ? arm.side > 0 : arm.side < 0;
    if (Math.abs(sinA) > 0.9 && !near) continue;
    const ax = cx + arm.side * (half + 0.4) * Math.max(0.35, Math.abs(cosA)) + (Math.abs(sinA) > 0.6 ? arm.sw * 1.6 * Math.sign(sinA || 1) : 0) - (arm.side < 0 ? 1 : 0);
    const ay = 11 + bob;
    const len = 8 - (Math.abs(sinA) < 0.5 ? Math.abs(arm.sw) * 0.8 : 0);
    for (let y = 0; y < len; y++) span(c, ay + y, ax, ax + 2, near ? P.COAT : P.COAT_DARK, arm.side < 0 ? 0.25 : -0.25);
    span(c, ay + len, ax, ax + 2, P.GLOVE, 0);
  }

  // --- Strap and chest lamp ---------------------------------------------
  if (cosA > -0.3) {
    for (let k = 0; k <= 7; k++) {
      const sx = cx - 3 + sinA * 1.5 + k * (6 / 7) * Math.max(0.3, cosA);
      put(c, sx, 10 + bob + k, P.STRAP, 0.2);
    }
    put(c, cx - 2 + sinA * 2.2, 12 + bob, P.LAMP);
  }

  // --- Hood / head -------------------------------------------------------
  const hoodW = [1.6, 2.8, 3.4, 3.8, 3.9, 3.9, 3.8, 3.5, 3.0];
  const hoodShift = sinA * 0.8;
  for (let r = 0; r < hoodW.length; r++) {
    const hw = hoodW[r] - Math.abs(sinA) * (r < 2 ? 0 : 0.3);
    span(c, top + r, cx - hw + hoodShift, cx + hw + hoodShift, P.COAT, 0.15);
  }
  // Hood rim highlight.
  for (let x = 0; x < c.w; x++) if (get(c, x, top) === P.COAT) put(c, x, top, P.COAT_LIGHT, 0.4);
  // Face opening.
  if (cosA > -0.15) {
    const fcx = cx + sinA * 2.4 + hoodShift;
    const fw = 2.2 - Math.abs(sinA) * 0.9;
    for (let r = 3; r <= 7; r++) {
      const w = r === 3 ? fw - 0.8 : r === 7 ? fw - 0.6 : fw;
      span(c, top + r, fcx - w, fcx + w, P.HOOD_IN);
    }
    // A sliver of chin and cheek in the shadow.
    put(c, fcx + (sinA > 0.3 ? 0.6 : -0.4), top + 6, P.SKIN, 0.2);
    put(c, fcx + (sinA > 0.3 ? 0.6 : 0.6), top + 6, P.SKIN, -0.2);
    if (Math.abs(sinA) < 0.5) put(c, fcx, top + 7, P.SKIN, -0.3);
  } else {
    // Hood seam on the back.
    for (let r = 1; r <= 7; r++) put(c, cx + hoodShift - 0.5, top + r, P.COAT_DARK, -0.2);
  }

  // --- Outline -----------------------------------------------------------
  const out = new Uint8Array(c.px);
  for (let y = 0; y < c.h; y++) {
    for (let x = 0; x < c.w; x++) {
      if (c.px[y * c.w + x] !== P.EMPTY) continue;
      const n = get(c, x - 1, y) || get(c, x + 1, y) || get(c, x, y - 1) || get(c, x, y + 1);
      if (n) out[y * c.w + x] = P.OUTLINE;
    }
  }
  c.px.set(out);
  return c;
}

const BASE_VALUE: Record<number, number> = {
  [P.COAT]: 0.66,
  [P.COAT_DARK]: 0.5,
  [P.COAT_LIGHT]: 0.86,
  [P.TROUSER]: 0.42,
  [P.BOOT]: 0.24,
  [P.SKIN]: 0.5,
  [P.STRAP]: 0.62,
  [P.PACK]: 0.5,
  [P.GLOVE]: 0.3,
  [P.BELT]: 0.3,
};

function rampFor(m: P): ReadonlyArray<number> {
  switch (m) {
    case P.COAT:
    case P.COAT_DARK:
    case P.COAT_LIGHT:
      return RAMP.rust;
    case P.SKIN:
      return RAMP.skin;
    case P.PACK:
    case P.TROUSER:
    case P.BOOT:
    case P.GLOVE:
    case P.BELT:
      return RAMP.steelDark;
    case P.STRAP:
      return RAMP.steel;
    default:
      return RAMP.steel;
  }
}

/** Palette index for a pixel at a light level. */
function colorOf(m: P, lum: number, level: number): number {
  if (m === P.OUTLINE) return 1;
  if (m === P.HOOD_IN) return 0;
  if (m === P.LAMP) return 26;
  const v = (BASE_VALUE[m] ?? 0.5) * (1 + lum * 0.28) * level;
  return quantizeFlat(v, rampFor(m));
}

const ANGLES: Record<PlayerFacing, { angle: number; mirror: boolean }> = {
  S: { angle: 0, mirror: false },
  SE: { angle: 45, mirror: false },
  E: { angle: 90, mirror: false },
  NE: { angle: 135, mirror: false },
  N: { angle: 180, mirror: false },
  NW: { angle: 135, mirror: true },
  W: { angle: 90, mirror: true },
  SW: { angle: 45, mirror: true },
};

/** Frame index inside the sheet for a facing + animation frame. */
export function frameIndex(facing: PlayerFacing, anim: 'idle' | 'walk', frame: number): number {
  const d = FACINGS.indexOf(facing);
  return d * FRAMES_PER_DIR + (anim === 'idle' ? frame % IDLE_FRAMES : IDLE_FRAMES + (frame % WALK_FRAMES));
}

/**
 * Renders the full sheet (8 facings × 10 frames) at one light level.
 * Also returns a flat silhouette sheet when `silhouette` is set (for the x-ray ghost).
 */
export function renderPlayerSheet(level: number, silhouette = false): HTMLCanvasElement {
  const cols = FRAMES_PER_DIR;
  const rows = FACINGS.length;
  const cv = document.createElement('canvas');
  cv.width = cols * PLAYER_W;
  cv.height = rows * PLAYER_H;
  const ctx = cv.getContext('2d')!;
  const img = ctx.createImageData(cv.width, cv.height);
  const u32 = new Uint32Array(img.data.buffer);
  const cache = new Map<string, Canvas>();
  FACINGS.forEach((facing, d) => {
    const { angle, mirror } = ANGLES[facing];
    for (let f = 0; f < cols; f++) {
      const walking = f >= IDLE_FRAMES;
      const frame = walking ? f - IDLE_FRAMES : f;
      const key = `${angle}:${walking}:${frame}`;
      let c = cache.get(key);
      if (!c) {
        c = drawFigure({ angle, frame, walking });
        cache.set(key, c);
      }
      for (let y = 0; y < PLAYER_H; y++) {
        for (let x = 0; x < PLAYER_W; x++) {
          const sx = mirror ? PLAYER_W - 1 - x : x;
          const m = c.px[y * PLAYER_W + sx] as P;
          if (m === P.EMPTY) continue;
          const color = silhouette ? (m === P.OUTLINE ? 5 : 8) : colorOf(m, mirror ? -c.lum[y * PLAYER_W + sx] : c.lum[y * PLAYER_W + sx], level);
          u32[(d * PLAYER_H + y) * cv.width + f * PLAYER_W + x] = PALETTE_U32[color];
        }
      }
    }
  });
  ctx.putImageData(img, 0, 0);
  return cv;
}
