/**
 * Team_Aperture emblem, procedural pixel-art version (KA-III art pipeline style).
 *
 * One scene definition (signed-distance shapes in normalised emblem space, y down,
 * emblem radius = 1) is rendered per variant at its own resolution:
 *   ring   bezel + arc light segments (red left, green right), analytic per pixel
 *   back   dark backdrop, radial glow at the high-five, faint grid, floor
 *   bots   parametric parts (circles, ellipses, capsules, boxes) shaded with a light
 *          model: key light from the high-five glow, red rim light from the left,
 *          green rim light from the right; quantised on palette ramps with 8x8 Bayer
 *   post   outlines, contact lines, floor reflections, starburst, pixel overrides
 * The 15 px badge is a hand-authored map (no renderer holds a 15 px silhouette).
 *
 * Every pixel is a palette index 0..27 or 255 (transparent outside the disc).
 */

export type EmblemVariant = 'full' | 'simple' | 'screen' | 'badge';
export interface EmblemOpts { red?: number; green?: number; spark?: number }
export interface IndexedPixels { w: number; h: number; data: Uint8Array }

const T = 255;

// ---------------------------------------------------------------- dithering
const BAYER_RAW = [
  0, 32, 8, 40, 2, 34, 10, 42, 48, 16, 56, 24, 50, 18, 58, 26,
  12, 44, 4, 36, 14, 46, 6, 38, 60, 28, 52, 20, 62, 30, 54, 22,
  3, 35, 11, 43, 1, 33, 9, 41, 51, 19, 59, 27, 49, 17, 57, 25,
  15, 47, 7, 39, 13, 45, 5, 37, 63, 31, 55, 23, 61, 29, 53, 21,
];
const bayer = (x: number, y: number): number => (BAYER_RAW[((y & 7) << 3) | (x & 7)] + 0.5) / 64;
const clamp = (v: number, a = 0, b = 1): number => (v < a ? a : v > b ? b : v);
const smooth = (a: number, b: number, v: number): number => {
  const t = clamp((v - a) / (b - a));
  return t * t * (3 - 2 * t);
};

/**
 * Quantise a continuous ramp position `lv` (0..ramp.length-1) with Bayer dithering.
 * `k` sharpens the transition: 1 = full-width dither, large = hard posterised bands,
 * so dither only appears in a narrow zone between two flat clusters.
 */
function qlv(lv: number, ramp: readonly number[], x: number, y: number, k: number): number {
  const n = ramp.length - 1;
  if (lv <= 0) return ramp[0];
  if (lv >= n) return ramp[n];
  const i = Math.floor(lv);
  const f = clamp((lv - i - 0.5) * k + 0.5);
  return ramp[f > bayer(x, y) ? i + 1 : i];
}

// ---------------------------------------------------------------- ramps
const RED = [0, 11, 17, 18, 19, 20, 27];
const GRN = [0, 21, 22, 23, 24, 25, 27];
const BEZEL = [0, 1, 2, 3, 4, 5, 6, 7];
/** One step brighter on the emissive chains (red / green / spark). */
const UPMAP: Record<number, number> = { 11: 17, 17: 18, 18: 19, 19: 20, 20: 27, 21: 22, 22: 23, 23: 24, 24: 25, 25: 27 };
const up1 = (i: number): number => UPMAP[i] ?? i;
/** One step darker along the steel / red / green chains (used by reflections). */
const DOWN: Record<number, number> = {};
for (const ch of [[0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 27], [0, 11, 17, 18, 19, 20], [0, 21, 22, 23, 24, 25], [0, 11, 12, 13, 14, 15, 16, 26]]) {
  for (let j = 1; j < ch.length; j++) DOWN[ch[j]] = ch[j - 1];
}

// ---------------------------------------------------------------- SDF primitives
type Sdf = (x: number, y: number) => number;
const circle = (cx: number, cy: number, r: number): Sdf => (x, y) => Math.hypot(x - cx, y - cy) - r;
const ellipse = (cx: number, cy: number, rx: number, ry: number): Sdf => (x, y) => {
  const px = (x - cx) / rx, py = (y - cy) / ry;
  const k0 = Math.hypot(px, py);
  const k1 = Math.hypot(px / rx, py / ry);
  return k1 === 0 ? -Math.min(rx, ry) : (k0 * (k0 - 1)) / k1;
};
const capsule = (ax: number, ay: number, bx: number, by: number, r: number): Sdf => (x, y) => {
  const pax = x - ax, pay = y - ay, bax = bx - ax, bay = by - ay;
  const h = clamp((pax * bax + pay * bay) / (bax * bax + bay * bay));
  return Math.hypot(pax - bax * h, pay - bay * h) - r;
};
/** Capsule with different end radii (iq's uneven capsule). */
const taper = (ax: number, ay: number, bx: number, by: number, ra: number, rb: number): Sdf => (x, y) => {
  const px = x - ax, py = y - ay;
  const qx0 = bx - ax, qy0 = by - ay;
  const h = qx0 * qx0 + qy0 * qy0;
  const qx = Math.abs((px * qy0 - py * qx0) / h);
  const qy = (px * qx0 + py * qy0) / h;
  const b = ra - rb;
  const cx = Math.sqrt(h - b * b), cy = b;
  const k = cx * qy - cy * qx;
  const m = cx * qx + cy * qy;
  const n = qx * qx + qy * qy;
  if (k < 0) return Math.sqrt(h * n) - ra;
  if (k > cx) return Math.sqrt(h * (n + 1 - 2 * qy)) - rb;
  return m - ra;
};
const rbox = (cx: number, cy: number, hx: number, hy: number, rad: number, ang = 0): Sdf => {
  const c = Math.cos(ang), s = Math.sin(ang);
  return (x, y) => {
    const dx = x - cx, dy = y - cy;
    const lx = Math.abs(c * dx + s * dy) - hx + rad, ly = Math.abs(-s * dx + c * dy) - hy + rad;
    return Math.hypot(Math.max(lx, 0), Math.max(ly, 0)) + Math.min(Math.max(lx, ly), 0) - rad;
  };
};
/** Annulus band kept above (up=true) or below the line y = cy. */
const halfRing = (cx: number, cy: number, r: number, th: number, upper: boolean): Sdf => (x, y) =>
  Math.max(Math.abs(Math.hypot(x - cx, y - cy) - r) - th, upper ? y - cy : cy - y);

// ---------------------------------------------------------------- variant config
interface Cfg {
  v: 'full' | 'simple' | 'screen';
  S: number;
  lod: number; // bit: 1 full, 2 simple, 4 screen
  k: number; // dither sharpness on robots
  minR: number; // minimum limb radius in px
  scale: number; // robot scale about the high-five point
  // ring radii in px from the centre (outer → inner)
  rOut: number; rBez: number; rGroove: number; rTrack: number; rLip: number;
  segs: number[]; // segment boundaries in degrees from the top (clockwise, green side)
  gap: number; // gap between segments in px
}
const F = 1, SI = 2, SC = 4;
const ALL = F | SI | SC;

const CFG: Record<'full' | 'simple' | 'screen', Cfg> = {
  full: { v: 'full', S: 95, lod: F, k: 2.4, minR: 1.0, scale: 1.1, rOut: 47.5, rBez: 46.5, rGroove: 42.5, rTrack: 41.5, rLip: 37.6, segs: [7, 30, 55, 101, 146], gap: 1.4 },
  simple: { v: 'simple', S: 47, lod: SI, k: 6, minR: 1.0, scale: 1.1, rOut: 23.5, rBez: 22.6, rGroove: 20.6, rTrack: 19.7, rLip: 17.7, segs: [9, 42, 96, 146], gap: 1.1 },
  screen: { v: 'screen', S: 31, lod: SC, k: 8, minR: 0.6, scale: 1.1, rOut: 15.5, rBez: 15.0, rGroove: 14.0, rTrack: 13.9, rLip: 12.1, segs: [10, 62, 142], gap: 1.0 },
};

interface Ctx { c: Cfg; px: number; red: number; green: number; spark: number }

// ---------------------------------------------------------------- scene
/** The high-five contact point (key light source); robots scale about it. */
const GX = 0, GY = -0.36;
/** Floor line in scene units (feet stand on it). */
const FLOOR = 0.575;

interface Smp { x: number; y: number; ix: number; iy: number; d: number; nx: number; ny: number; nz: number }
type Shade = (s: Smp, k: Ctx) => number;
interface Part { g: number; f: Sdf; bev: number; sh: Shade; sep: boolean; name: string }

/** Key light (high-five glow, slightly in front) + soft top fill + specular. */
function light(s: Smp): number {
  const lx = GX - s.x, ly = GY - s.y, lz = 0.42;
  const dist = Math.hypot(lx, ly), ll = Math.hypot(lx, ly, lz);
  const dif = Math.max(0, (s.nx * lx + s.ny * ly + s.nz * lz) / ll);
  const att = 1 / (1 + (dist / 0.8) ** 2);
  const hx = lx / ll, hy = ly / ll, hz = lz / ll + 1, hl = Math.hypot(hx, hy, hz);
  const sp = Math.max(0, (s.nx * hx + s.ny * hy + s.nz * hz) / hl) ** 28 * att;
  const fill = Math.max(0, -0.45 * s.ny + 0.89 * s.nz);
  return 0.1 + 0.28 * fill + 0.75 * dif * att + 0.5 * sp;
}

/** A lit material: ramp per variant family (pixel art / CRT phosphor). */
interface Mat { ramp: number[]; scr: number[]; gain: number; bias: number }
const MAT: Record<string, Mat> = {
  gun: { ramp: [1, 2, 4, 6, 7, 8, 9, 10], scr: [11, 11, 17, 17, 18], gain: 1, bias: 0 },
  gunD: { ramp: [1, 2, 4, 6, 7, 8, 9, 10], scr: [0, 11, 11, 17], gain: 0.75, bias: 0 },
  steel: { ramp: [2, 4, 6, 7, 8, 9, 10, 27], scr: [21, 22, 22, 23, 24], gain: 1.05, bias: 0.04 },
  steelD: { ramp: [2, 4, 6, 7, 8, 9, 10, 27], scr: [21, 21, 22, 23], gain: 0.75, bias: 0 },
  dark: { ramp: [0, 1, 2, 3, 4, 5, 6], scr: [0, 0, 11, 11], gain: 0.9, bias: 0 },
  darkG: { ramp: [0, 1, 2, 3, 4, 5, 6], scr: [0, 0, 21, 21], gain: 0.9, bias: 0 },
  socket: { ramp: [0, 1, 2, 3, 4, 5, 6], scr: [0, 0, 0], gain: 0.5, bias: 0 },
  rimL: { ramp: [3, 5, 7, 8, 9, 10], scr: [11, 17, 17], gain: 1.1, bias: 0.15 },
  hand: { ramp: [0, 1, 2, 3, 5, 7], scr: [0, 0, 11], gain: 0.6, bias: 0 },
  handG: { ramp: [0, 1, 2, 3, 5, 7, 8], scr: [0, 0, 21], gain: 0.65, bias: 0 },
};
const lit = (m: string): Shade => (s, k) => {
  const M = MAT[m];
  const ramp = k.c.v === 'screen' ? M.scr : M.ramp;
  return qlv((light(s) * M.gain + M.bias) * (ramp.length - 1), ramp, s.ix, s.iy, k.c.k);
};

/** Radial emissive (eyes, lamps): ramp levels from the core outwards; the one-level
 *  step-up for the animation grows from the core (phi = radius) – no dither noise. */
function lamp(cx: number, cy: number, r: number, chan: 'red' | 'green', lv: number[]): Shade {
  const ramp = chan === 'red' ? RED : GRN;
  return (s, k) => {
    const t = Math.hypot(s.x - cx, s.y - cy) / r;
    let l = lv[Math.min(lv.length - 1, Math.floor(t * lv.length))];
    const p = chan === 'red' ? k.red : k.green;
    if (p > 0 && t < p * 1.0001) l += 1;
    return ramp[clamp(l, 0, ramp.length - 1)];
  };
}

/** Glass tank with glowing liquid below `level`. */
function tank(cx: number, r: number, level: number, bot: number, chan: 'red' | 'green'): Shade {
  const ramp = chan === 'red' ? RED : GRN;
  return (s, k) => {
    const u = (s.x - cx) / r; // -1..1 across
    if (s.y < level) {
      if (k.c.v === 'screen') return 0;
      return Math.abs(u + 0.4) < 0.25 ? 4 : 1; // empty glass with a highlight streak
    }
    const p = chan === 'red' ? k.red : k.green;
    const depth = clamp((s.y - level) / (bot - level));
    let l = 2;
    if (Math.abs(u + 0.4) < 0.3 || s.y - level < k.px * 1.2) l = 3; // streak + meniscus
    if (depth > 0.7 && Math.abs(u) > 0.5) l = 1;
    if (p > 0 && (1 - Math.abs(u)) * 0.6 + (1 - depth) * 0.4 < p * 1.0001) l += 1;
    return ramp[l];
  };
}

function scene(k: Ctx, pxs: number): Part[] {
  const c = k.c;
  const mr = c.minR * pxs;
  const R = (r: number): number => Math.max(r, mr);
  const parts: Part[] = [];
  const add = (name: string, g: number, lod: number, f: Sdf, bev: number, sh: Shade, sep = true): void => {
    if (lod & c.lod) parts.push({ name, g, f, bev, sh, sep });
  };

  // ======================= LEFT ROBOT: small dome bot, red eye =================
  const L = 1;
  const bx = -0.335, by = 0.135, br = 0.225;
  add('hoseL', L, F | SI, halfRing(-0.5, -0.02, 0.1, R(0.02), true), R(0.02), lit('dark'));
  add('tankL', L, ALL, capsule(-0.625, -0.01, -0.625, 0.15, R(0.05)), R(0.05), tank(-0.625, R(0.05), 0.05, 0.2, 'red'));
  add('tankCapT', L, F | SI, rbox(-0.625, -0.06, R(0.05), R(0.02), R(0.012)), 0.03, lit('gunD'));
  add('tankCapB', L, F | SI, rbox(-0.625, 0.2, R(0.05), R(0.02), R(0.012)), 0.03, lit('gunD'));
  // short hanging arm (left side), mostly tucked behind the dome
  add('armL2', L, F | SI, capsule(-0.5, 0.22, -0.56, 0.31, R(0.032)), R(0.032), lit('gunD'));
  add('clawL', L, F | SI, rbox(-0.565, 0.34, R(0.032), R(0.028), R(0.014)), R(0.03), lit('dark'));
  // legs
  add('pelvisL', L, ALL, rbox(-0.335, 0.35, 0.11, R(0.04), 0.025), 0.035, lit('dark'));
  add('thighL1', L, ALL, capsule(-0.415, 0.36, -0.43, 0.46, R(0.046)), R(0.046), lit('gunD'));
  add('thighL2', L, ALL, capsule(-0.255, 0.36, -0.24, 0.46, R(0.046)), R(0.046), lit('gunD'));
  add('shinL1', L, ALL, capsule(-0.43, 0.47, -0.44, 0.535, R(0.044)), R(0.044), lit('gunD'));
  add('shinL2', L, ALL, capsule(-0.24, 0.47, -0.23, 0.535, R(0.044)), R(0.044), lit('gunD'));
  add('kneeL1', L, F | SI, circle(-0.43, 0.465, R(0.048)), R(0.048), lit('gun'));
  add('kneeL2', L, F | SI, circle(-0.24, 0.465, R(0.048)), R(0.048), lit('gun'));
  add('footL1', L, ALL, rbox(-0.46, 0.55, 0.08, R(0.028), 0.024), 0.035, lit('gun'));
  add('footL2', L, ALL, rbox(-0.205, 0.55, 0.08, R(0.028), 0.024), 0.035, lit('gun'));
  // ear joint on the left of the dome
  add('earL', L, F | SI, circle(-0.548, 0.13, R(0.058)), R(0.058), lit('dark'));
  add('earLamp', L, F, circle(-0.548, 0.13, 0.026), 0.026, lamp(-0.548, 0.13, 0.026, 'red', [2]), false);
  // the dome
  add('dome', L, ALL, circle(bx, by, br), br, lit('gun'));
  add('hatch', L, F, rbox(-0.36, -0.06, 0.036, 0.014, 0.01, -0.2), 0.012, lamp(-0.36, -0.06, 0.04, 'red', [2]), false);
  // eye: metal bezel, dark socket, lens
  const ex = -0.29, ey = 0.11;
  add('eyeRim', L, F | SI, circle(ex, ey, 0.112), 0.02, lit('rimL'), false);
  add('socket', L, ALL, circle(ex, ey, 0.09), 0.025, lit('socket'), false);
  add('eyeL', L, ALL, circle(ex, ey, 0.064), 0.064, lamp(ex, ey, 0.064, 'red', [5, 4, 3, 3, 3, 2]), false);
  // raised arm (to the high-five)
  add('shoulderL', L, ALL, circle(-0.13, 0.05, R(0.045)), R(0.045), lit('gunD'));
  add('uarmL', L, ALL, capsule(-0.13, 0.05, -0.08, -0.13, R(0.033)), R(0.033), lit('gun'));
  add('elbowL', L, F | SI, circle(-0.08, -0.13, R(0.036)), R(0.036), lit('gunD'));
  add('farmL', L, ALL, capsule(-0.08, -0.13, -0.042, -0.24, R(0.031)), R(0.031), lit('gun'));
  add('handL', L, ALL, rbox(-0.036, -0.302, R(0.036), 0.06, R(0.026), 0.06), R(0.03), lit('hand'));

  // ======================= RIGHT ROBOT: tall slender bot, green eye ============
  const G2 = 2;
  add('hoseR', G2, F | SI, halfRing(0.45, -0.39, 0.085, R(0.018), true), R(0.018), lit('darkG'));
  add('tankR', G2, ALL, capsule(0.535, -0.33, 0.535, -0.16, R(0.058)), R(0.058), tank(0.535, R(0.058), -0.31, -0.1, 'green'));
  add('tankRCapT', G2, F | SI, rbox(0.535, -0.39, R(0.055), R(0.02), R(0.012)), 0.03, lit('steelD'));
  add('tankRCapB', G2, F | SI, rbox(0.535, -0.1, R(0.055), R(0.02), R(0.012)), 0.03, lit('steelD'));
  // hanging right arm
  add('shoulderR2', G2, ALL, circle(0.445, -0.215, R(0.046)), R(0.046), lit('steelD'));
  add('uarmR2', G2, ALL, capsule(0.45, -0.2, 0.5, 0.0, R(0.031)), R(0.031), lit('steelD'));
  add('elbowR2', G2, F | SI, circle(0.5, 0.0, R(0.033)), R(0.033), lit('darkG'));
  add('farmR2', G2, ALL, taper(0.5, 0.0, 0.525, 0.17, R(0.032), R(0.026)), R(0.03), lit('steel'));
  add('handR2', G2, ALL, rbox(0.53, 0.215, R(0.028), R(0.042), R(0.016), -0.1), R(0.028), lit('steelD'));
  // legs
  add('thighR1', G2, ALL, taper(0.29, 0.11, 0.28, 0.32, R(0.046), R(0.035)), R(0.045), lit('steel'));
  add('thighR2', G2, ALL, taper(0.385, 0.11, 0.4, 0.32, R(0.046), R(0.035)), R(0.045), lit('steel'));
  add('shinR1', G2, ALL, taper(0.28, 0.35, 0.27, 0.52, R(0.038), R(0.028)), R(0.036), lit('steelD'));
  add('shinR2', G2, ALL, taper(0.4, 0.35, 0.415, 0.52, R(0.038), R(0.028)), R(0.036), lit('steelD'));
  add('kneeR1', G2, F | SI, circle(0.28, 0.335, R(0.038)), R(0.038), lit('darkG'));
  add('kneeR2', G2, F | SI, circle(0.4, 0.335, R(0.038)), R(0.038), lit('darkG'));
  add('footR1', G2, ALL, rbox(0.255, 0.55, 0.07, R(0.028), 0.024), 0.035, lit('steel'));
  add('footR2', G2, ALL, rbox(0.44, 0.55, 0.07, R(0.028), 0.024), 0.035, lit('steel'));
  // torso: pelvis, segmented waist, chest plate
  add('pelvisR', G2, ALL, rbox(0.335, 0.09, 0.085, R(0.045), 0.035), 0.045, lit('steel'));
  add('waistR', G2, ALL, rbox(0.335, -0.02, R(0.05), 0.09, 0.025), 0.035, lit('darkG'));
  add('abs1', G2, F, rbox(0.335, -0.065, 0.058, 0.017, 0.012), 0.02, lit('steelD'));
  add('abs2', G2, F, rbox(0.335, -0.018, 0.055, 0.017, 0.012), 0.02, lit('steelD'));
  add('abs3', G2, F, rbox(0.335, 0.028, 0.052, 0.015, 0.012), 0.02, lit('steelD'));
  add('chestR', G2, ALL, taper(0.335, -0.195, 0.335, -0.105, 0.105, 0.065), 0.09, lit('steel'));
  add('neckR', G2, ALL, capsule(0.315, -0.34, 0.325, -0.28, R(0.026)), R(0.026), lit('darkG'));
  // head
  const hx = 0.3, hy = -0.445;
  add('headR', G2, ALL, ellipse(hx, hy, 0.105, 0.12), 0.1, lit('steel'));
  add('earR', G2, F, circle(0.365, -0.435, 0.034), 0.034, lit('steelD'));
  const gx = 0.243, gy = -0.43;
  add('socketR', G2, ALL, circle(gx, gy, 0.058), 0.02, lit('socket'), false);
  add('eyeR', G2, ALL, circle(gx, gy, R(0.04)), R(0.04), lamp(gx, gy, R(0.04), 'green', [5, 4, 3, 3]), false);
  // raised left arm (V shape: down to the elbow, up to the hand)
  add('shoulderR', G2, ALL, circle(0.225, -0.215, R(0.044)), R(0.044), lit('steelD'));
  add('uarmR', G2, ALL, capsule(0.225, -0.215, 0.125, -0.05, R(0.031)), R(0.031), lit('steel'));
  add('elbowR', G2, F | SI, circle(0.125, -0.05, R(0.034)), R(0.034), lit('darkG'));
  add('elbowLamp', G2, F, circle(0.125, -0.05, 0.015), 0.015, lamp(0.125, -0.05, 0.016, 'green', [3]), false);
  add('farmR', G2, ALL, capsule(0.125, -0.05, 0.042, -0.24, R(0.03)), R(0.03), lit('steel'));
  add('handR', G2, ALL, rbox(0.036, -0.302, R(0.036), 0.06, R(0.026), -0.06), R(0.03), lit('handG'));
  return parts;
}

// ---------------------------------------------------------------- rendering
const N4: ReadonlyArray<readonly [number, number]> = [[1, 0], [-1, 0], [0, 1], [0, -1]];

function renderProc(c: Cfg, o: EmblemOpts): IndexedPixels {
  const S = c.S, px = 2 / S, half = S / 2;
  const k: Ctx = { c, px, red: clamp(o.red ?? 0), green: clamp(o.green ?? 0), spark: clamp(o.spark ?? 0) };
  const data = new Uint8Array(S * S).fill(T);
  const own = new Int16Array(S * S).fill(-1); // part index per pixel
  const zone = new Uint8Array(S * S); // 0 outside, 1 bezel, 2 track/lip, 3 interior
  const parts = scene(k, px / c.scale);
  const P = (i: number): number => (i + 0.5 - half) / half; // pixel centre → normalised
  // robots are authored in scene space and scaled about the high-five point
  const toScene = (v: number, g: number): number => (v - g) / c.scale + g;
  const floorRow = Math.floor((GY + (FLOOR - GY) * c.scale) * half + half - 1e-6);

  // ---- pass 1: ring + backdrop
  for (let iy = 0; iy < S; iy++) {
    for (let ix = 0; ix < S; ix++) {
      const x = P(ix), y = P(iy);
      const rp = Math.hypot(ix + 0.5 - half, iy + 0.5 - half); // radius in px
      const i = iy * S + ix;
      if (rp > c.rOut) continue;
      if (rp > c.rLip) {
        zone[i] = rp > c.rGroove ? 1 : 2;
        data[i] = ringPixel(k, ix, iy, x, y, rp);
      } else {
        zone[i] = 3;
        data[i] = backPixel(k, ix, iy, x, y, rp, floorRow);
      }
    }
  }

  // ---- pass 2: robots (painter's order, topmost part owns the pixel)
  const ds = new Float32Array(S * S);
  const nxs = new Float32Array(S * S);
  for (let iy = 0; iy < S; iy++) {
    for (let ix = 0; ix < S; ix++) {
      const i = iy * S + ix;
      if (zone[i] === 0 || zone[i] === 1) continue;
      const x = toScene(P(ix), GX), y = toScene(P(iy), GY);
      for (let p = parts.length - 1; p >= 0; p--) {
        const d = parts[p].f(x, y);
        if (d < 0) { own[i] = p; ds[i] = d; break; }
      }
    }
  }
  for (let iy = 0; iy < S; iy++) {
    for (let ix = 0; ix < S; ix++) {
      const i = iy * S + ix;
      const p = own[i];
      if (p < 0) continue;
      const part = parts[p];
      const x = toScene(P(ix), GX), y = toScene(P(iy), GY), d = ds[i];
      const e = 0.0015;
      let gx = part.f(x + e, y) - part.f(x - e, y), gy = part.f(x, y + e) - part.f(x, y - e);
      const gl = Math.hypot(gx, gy) || 1;
      gx /= gl; gy /= gl;
      const t = clamp(-d / Math.max(part.bev, px * 0.75));
      const sx = 1 - t, nz = Math.sqrt(Math.max(0, 1 - sx * sx));
      const smp: Smp = { x, y, ix, iy, d, nx: gx * sx, ny: gy * sx, nz };
      data[i] = part.sh(smp, k);
      nxs[i] = smp.nx;
    }
  }

  // ---- pass 3: contact lines, rim lights (crisp silhouette lines), outlines
  const grp = (ix: number, iy: number): number => {
    if (ix < 0 || iy < 0 || ix >= S || iy >= S) return 0;
    const p = own[iy * S + ix];
    return p < 0 ? 0 : parts[p].g;
  };
  const out = data.slice();
  for (let iy = 0; iy < S; iy++) {
    for (let ix = 0; ix < S; ix++) {
      const i = iy * S + ix;
      const p = own[i];
      if (p < 0) continue;
      const part = parts[p];
      const g = part.g;
      if (c.v === 'full') {
        let behind = false;
        for (const [dx, dy] of N4) {
          const jx = ix + dx, jy = iy + dy;
          if (jx < 0 || jy < 0 || jx >= S || jy >= S) continue;
          const q = own[jy * S + jx];
          if (q > p && parts[q].g === g && parts[q].sep) behind = true;
        }
        if (behind) { out[i] = g === 1 ? 0 : 1; continue; }
      }
      const sil = grp(ix - 1, iy) !== g || grp(ix + 1, iy) !== g || grp(ix, iy - 1) !== g || grp(ix, iy + 1) !== g;
      if (!sil || isEmissive(data[i])) continue;
      const x = P(ix), nx = nxs[i];
      const wr = 1 - smooth(-0.1, 0.25, x); // red light reaches the left half
      const wg = smooth(-0.25, 0.1, x);
      if (nx < -0.3 && wr > 0.5) {
        const v = g === 1 && nx < -0.55 ? 18 : 17;
        out[i] = k.red >= 0.5 ? up1(v) : v;
      } else if (nx > 0.3 && wg > 0.5) {
        const v = g === 2 && nx > 0.55 ? 24 : 23;
        out[i] = k.green >= 0.5 ? up1(v) : v;
      }
    }
  }
  // outline: background pixels touching a robot become void
  for (let iy = 0; iy < S; iy++) {
    for (let ix = 0; ix < S; ix++) {
      const i = iy * S + ix;
      if (own[i] >= 0 || zone[i] < 2) continue;
      if (grp(ix - 1, iy) || grp(ix + 1, iy) || grp(ix, iy - 1) || grp(ix, iy + 1)) out[i] = 0;
    }
  }

  // ---- pass 4: floor reflections (mirrored silhouettes in the side's light colour)
  for (let iy = floorRow + 2; iy < S; iy++) {
    const my = 2 * floorRow + 1 - iy;
    if (my < 0) continue;
    for (let ix = 0; ix < S; ix++) {
      const i = iy * S + ix;
      if (own[i] >= 0 || zone[i] !== 3) continue;
      const g = grp(ix, my);
      if (!g) continue;
      const dist = iy - floorRow;
      const n = 1.6 + dist * (c.v === 'full' ? 0.42 : 0.8) - (g === 1 ? k.red : k.green) * 0.6;
      const steps = Math.floor(n) + (n - Math.floor(n) > bayer(ix, iy) ? 1 : 0);
      let v = out[my * S + ix];
      for (let j = 0; j < steps; j++) v = DOWN[v] ?? 0;
      if (v > 1 && v !== 21) out[i] = v;
    }
  }

  // ---- pass 5: the high-five starburst
  spark(k, out, own);
  return { w: S, h: S, data: out };
}

const isEmissive = (i: number): boolean => i === 18 || i === 19 || i === 20 || i === 24 || i === 25 || i === 27;

/** Angle from the top, clockwise, in degrees (-180..180). */
const angTop = (x: number, y: number): number => (Math.atan2(x, -y) * 180) / Math.PI;

/** Distance (px, along the arc) to the nearest segment end, or -1 outside lit segments. */
function segAt(c: Cfg, x: number, y: number, rp: number): number {
  const a = Math.abs(angTop(x, y));
  const b = c.segs;
  for (let j = 0; j + 1 < b.length; j++) {
    if (a >= b[j] && a < b[j + 1]) {
      const toEnd = (Math.min(a - b[j], b[j + 1] - a) * Math.PI * rp) / 180;
      return toEnd < c.gap / 2 ? -1 : toEnd;
    }
  }
  return -1;
}

function ringPixel(k: Ctx, ix: number, iy: number, x: number, y: number, rp: number): number {
  const c = k.c;
  const left = x < 0;
  if (rp > c.rBez) return c.v === 'screen' ? 1 : 0; // outer dark edge
  if (rp > c.rGroove) {
    if (c.v === 'screen') return 0;
    // bezel: torus profile lit from the top and from the high-five
    const t = ((rp - c.rGroove) / (c.rBez - c.rGroove)) * 2 - 1; // -1 inner .. 1 outer
    const r = Math.hypot(x, y) || 1;
    const ny = (y / r) * t, nz = Math.sqrt(Math.max(0, 1 - t * t));
    const v = 0.2 + 0.32 * Math.max(0, -0.6 * ny + 0.8 * nz) + 0.3 * Math.max(0, -ny) * Math.max(0, -y / r);
    return qlv(clamp(v) * (BEZEL.length - 1), BEZEL, ix, iy, 3);
  }
  if (rp > c.rTrack) {
    // groove: picks up a little coloured light next to lit segments
    if (c.v !== 'screen' && segAt(c, x, y, rp) > 1.2) return left ? 11 : 21;
    return 0;
  }
  // track: lit arc segments
  const toEnd = segAt(c, x, y, rp);
  if (toEnd < 0) return c.v === 'screen' ? 0 : 1;
  const mid = (c.rTrack + c.rLip) / 2, hw = (c.rTrack - c.rLip) / 2;
  const u = Math.abs(rp - mid) / hw; // 0 core .. 1 edge
  const ramp = left ? RED : GRN;
  const p = left ? k.red : k.green;
  const base = left ? 2 : 3; // red 17/18, green 23/24 (balanced brightness)
  let lv = u < 0.55 ? base + 1 : base;
  if (toEnd < 0.9) lv = base;
  // animation: the brighter core widens outwards from the centre line
  if (p > 0 && u * 0.8 + 0.2 * (toEnd < 0.9 ? 1 : 0) < p * 1.0001) lv += 1;
  return ramp[lv];
}

function backPixel(k: Ctx, ix: number, iy: number, x: number, y: number, rp: number, floorRow: number): number {
  const c = k.c;
  const left = x < 0;
  const S = c.S, px = 2 / S;
  const dG = Math.hypot(x - GX, y - GY);
  if (c.v === 'screen') {
    // CRT: black disc, one faint phosphor halo ring around the glow
    if (Math.abs(dG - 0.3) < px * 0.5 && y < 0.1) return 21;
    return 0;
  }
  // floor: darker, faint coloured pools under each robot
  if (iy > floorRow) {
    const pool = Math.exp(-(((x - (left ? -0.33 : 0.35)) / 0.2) ** 2)) * (1 - (iy - floorRow) / 6);
    const p = left ? k.red : k.green;
    return qlv(0.6 + pool * 0.9 + p * 0.4, left ? [0, 0, 11, 17] : [0, 0, 21, 22], ix, iy, 1.5);
  }
  // radial glow from the high-five + a soft vignette towards the lip
  const ri = rp / c.rLip;
  const g = 0.9 / (1 + (dG / 0.21) ** 2) + 0.25 * (1 - ri * ri);
  let idx = qlv(clamp(g * 1.1 + 0.25) * 3, [0, 1, 21, 22], ix, iy, 1.3);
  // faint grid and halo rings, visible only within the glow
  if (c.v === 'full') {
    const gxp = ix - (S - 1) / 2;
    const gyp = iy - Math.round((GY + 1) * (S / 2) - 0.5);
    if ((gxp % 8 === 0 || gyp % 8 === 0) && g > 0.3 && idx < 22 && dG > 0.12) idx = idx === 0 ? 1 : idx === 1 ? 21 : 22;
    if (Math.abs(dG - 0.23) < px * 0.5) idx = 23;
    if (Math.abs(dG - 0.4) < px * 0.5 && y < -0.05) idx = 22;
  }
  // segment light spill just inside the lip
  const edge = c.rLip - rp; // px inside the lip
  const a = Math.abs(angTop(x, y));
  if (a > c.segs[0] + 2 && a < c.segs[c.segs.length - 1] - 2 && edge < 3) {
    const p = left ? k.red : k.green;
    const s = (1 - edge / 3) * 1.4 + p * 0.5;
    const v = qlv(s, left ? [idx, 11, 17] : [idx, 21, 22], ix, iy, 1.6);
    if (v !== idx) idx = v;
  }
  return idx;
}

/** The high-five starburst: a warm core on the contact column, rays behind the robots. */
function spark(k: Ctx, out: Uint8Array, own: Int16Array): void {
  const c = k.c, S = c.S, s = k.spark;
  const cx = (S - 1) / 2;
  const cy = Math.round((GY + 1) * (S / 2) - 0.5);
  const put = (x: number, y: number, v: number, over = false): void => {
    if (x < 0 || y < 0 || x >= S || y >= S) return;
    const i = y * S + x;
    if (!over && own[i] >= 0) return;
    out[i] = v;
  };
  const big = c.v === 'full';
  const touches = (x: number, y: number): boolean => {
    for (const [dx, dy] of N4) {
      const jx = x + dx, jy = y + dy;
      if (jx >= 0 && jy >= 0 && jx < S && jy < S && own[jy * S + jx] >= 0) return true;
    }
    return false;
  };
  // glow disc behind the hands: concentric bands with short dithered transitions
  const rg = big ? 7.5 + s * 2.5 : c.v === 'simple' ? 4 + s * 1.5 : 2.6 + s;
  const R0 = Math.ceil(rg);
  for (let y = -R0; y <= R0; y++) {
    for (let x = -R0; x <= R0; x++) {
      const d = Math.hypot(x, y * 1.08);
      if (d > rg) continue;
      const lv = Math.pow(1 - d / rg, 1.25) * 4.6;
      const v = qlv(lv, [out[(cy + y) * S + cx + x], 22, 26, 20, 27], cx + x, cy + y, 2.6);
      put(cx + x, cy + y, v);
    }
  }
  // rays: long up, medium sideways, short diagonals (tapering white → peach → amber)
  const L = big ? 15 + Math.round(s * 5) : c.v === 'simple' ? 8 + Math.round(s * 3) : 5 + Math.round(s * 2);
  const ray = (f: number): number => (f > 0.72 ? 27 : f > 0.46 ? 20 : f > 0.24 ? 26 : 22);
  for (let d = 1; d <= L; d++) {
    const f = 1 - d / (L + 1);
    put(cx, cy - d, ray(f));
    if (d <= L * 0.62) { put(cx - d, cy, ray(f * 0.95)); put(cx + d, cy, ray(f * 0.95)); }
    if (d <= L * 0.36) {
      const v = ray(f * 0.85);
      put(cx - d, cy - d, v); put(cx + d, cy - d, v);
      if (!touches(cx - d, cy + d)) put(cx - d, cy + d, v);
      if (!touches(cx + d, cy + d)) put(cx + d, cy + d, v);
    }
  }
  // core on the contact point (fingertips), drawn over the hands
  put(cx, cy, 27, true);
  put(cx, cy - 1, 27, true);
  put(cx - 1, cy, s >= 0.5 ? 27 : 20, true);
  put(cx + 1, cy, s >= 0.5 ? 27 : 20, true);
  put(cx, cy + 1, s >= 0.5 ? 27 : 20, true);
  if (s >= 0.75) { put(cx, cy - 2, 27, true); put(cx - 2, cy, 20, true); put(cx + 2, cy, 20, true); }
}

// ---------------------------------------------------------------- badge (hand-authored)
function badge(o: EmblemOpts): IndexedPixels {
  const rows = [
    '.....bbbbb.....',
    '...bbRRkGGbb...',
    '..bRRkkWkkGGb..',
    '.bRkkkk*kkkkGb.',
    '.bRkkkh|hkkkGb.',
    'bRkkkkh|hkoGkGb',
    'bRkkkkhkhkooGGb',
    'bRkoookhkkoogGb',
    'bRooeoookkkooGb',
    'bRooooookkkookb',
    '.bkoookkkkkokb.',
    '.bkokokkkkokob.',
    '..bkkkkkkkkkb..',
    '...bbkkkkkbb...',
    '.....bbbbb.....',
  ];
  const red = clamp(o.red ?? 0), green = clamp(o.green ?? 0), sp = clamp(o.spark ?? 0);
  const map: Record<string, number> = {
    '.': T, b: 3, k: 1, R: red >= 0.5 ? 19 : 18, G: green >= 0.5 ? 25 : 24,
    o: 7, h: 9, '|': 9, e: red >= 0.5 ? 20 : 19, g: green >= 0.5 ? 25 : 24,
    W: sp >= 0.5 ? 27 : 20, '*': 27,
  };
  const data = new Uint8Array(225);
  rows.forEach((r, y) => { for (let x = 0; x < 15; x++) data[y * 15 + x] = map[r[x]] ?? T; });
  return { w: 15, h: 15, data };
}

// ---------------------------------------------------------------- entry
export function emblemPixels(variant: EmblemVariant, opts: EmblemOpts = {}): IndexedPixels {
  if (variant === 'badge') return badge(opts);
  return renderProc(CFG[variant], opts);
}
