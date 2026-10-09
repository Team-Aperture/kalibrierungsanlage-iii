/**
 * Team_Aperture emblem: final pixel-art family for KA-III (full / simple / screen / badge).
 *
 * One layout drives the family: the two raised hands meet at the top centre, at the tall
 * robot's chin (about 36 % down the disc, as in the reference); the small robot's arm
 * rises diagonally from its dome's upper right, the tall robot's arm forms a V (forearm
 * down to a low elbow, upper arm back up to the shoulder).
 *
 * full (95 px) renders signed-distance parts in emblem space (x and y from -1 to 1,
 * y down, radius 1):
 *   ring   bezel and arc light segments (red on the left, green on the right). The arcs
 *          have unequal lengths and radial gap cuts, the bottom arc is unlit and the
 *          12 o'clock gap sits on the spark column.
 *   back   dark backdrop, radial glow at the high-five, a faint grid
 *   bots   small dome robot (left, gunmetal, red eye) and tall slender robot (right,
 *          light steel, green eye). Shading: key light from the high-five, red rim light
 *          on the small robot's outer-left edge, mint rim light on the tall robot's
 *          outer-right edge (only as runs, never single specks). Ramps are quantised
 *          with 8x8 Bayer dithering.
 *   post   two mitten palm clusters, solid floor pools 2+ px clear of the arcs, and the
 *          starburst on the seam between the palms (short rays that end in the backdrop)
 * simple (47 px) and screen (31 px) draw the same ring, backdrop and spark, with
 * hand-placed figure maps on the same layout (no renderer holds a 31-47 px silhouette
 * cleanly). The 15 px badge is fully hand-authored.
 *
 * Pulse: red / green step the ring segments, eye, tank liquid, rim light and floor pool
 * one ramp level up; spark grows the burst. Every step is a whole band or a shape grown
 * from its core, never a per-pixel dither, and the levels below 0.5 keep the resting
 * look of every narrow feature (the game's still frame is 0.25), so no stray pixels
 * appear in the arcs. The red eye always keeps at least one saturated red pixel.
 * Every pixel is a palette index 0..27, or 255 (transparent outside the disc).
 * The geometry (part ownership, normals, light) is cached per variant, so each call
 * only re-shades.
 */

export type EmblemVariant = 'full' | 'simple' | 'screen' | 'badge';
export interface EmblemOpts { red?: number; green?: number; spark?: number }
export interface IndexedPixels { w: number; h: number; data: Uint8Array }

const T = 255;

// ---------------------------------------------------------------- helpers
const BAYER_RAW = [
  0, 32, 8, 40, 2, 34, 10, 42, 48, 16, 56, 24, 50, 18, 58, 26,
  12, 44, 4, 36, 14, 46, 6, 38, 60, 28, 52, 20, 62, 30, 54, 22,
  3, 35, 11, 43, 1, 33, 9, 41, 51, 19, 59, 27, 49, 17, 57, 25,
  15, 47, 7, 39, 13, 45, 5, 37, 63, 31, 55, 23, 61, 29, 53, 21,
];
const bayer = (x: number, y: number): number => (BAYER_RAW[((y & 7) << 3) | (x & 7)] + 0.5) / 64;
const clamp = (v: number, a = 0, b = 1): number => (v < a ? a : v > b ? b : v);

/**
 * Quantise a continuous ramp position `lv` (0..ramp.length-1) with Bayer dithering.
 * `k` sharpens the transition: 1 = full-width dither, large = flat bands with a narrow
 * dither seam.
 */
function qlv(lv: number, ramp: readonly number[], x: number, y: number, k: number): number {
  const n = ramp.length - 1;
  if (lv <= 0) return ramp[0];
  if (lv >= n) return ramp[n];
  const i = Math.floor(lv);
  const f = clamp((lv - i - 0.5) * k + 0.5);
  return ramp[f > bayer(x, y) ? i + 1 : i];
}

// ---------------------------------------------------------------- palette ramps
const RED = [0, 11, 17, 18, 19, 20, 27];
const GRN = [0, 21, 22, 23, 24, 25, 27];
const BEZEL = [0, 1, 2, 3, 4, 5, 6, 7];
/** One step brighter on the emissive chains (red / green / spark). */
const UPMAP: Record<number, number> = { 11: 17, 17: 18, 18: 19, 19: 20, 20: 27, 21: 22, 22: 23, 23: 24, 24: 25, 25: 27 };
const up1 = (i: number): number => UPMAP[i] ?? i;
const isEmissive = (i: number): boolean => i === 18 || i === 19 || i === 20 || i === 24 || i === 25 || i === 27;

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
/** Capsule with different end radii. */
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
/** Annulus band kept above (upper=true) or below the line y = cy. */
const halfRing = (cx: number, cy: number, r: number, th: number, upper: boolean): Sdf => (x, y) =>
  Math.max(Math.abs(Math.hypot(x - cx, y - cy) - r) - th, upper ? y - cy : cy - y);

// ---------------------------------------------------------------- variant config
type ProcVariant = 'full' | 'simple' | 'screen';
interface Cfg {
  v: ProcVariant;
  S: number;
  lod: number; // bit: 1 full, 2 simple (screen draws no SDF robots)
  k: number; // dither sharpness on robots
  glowK: number; // dither sharpness of the backdrop glow
  lift: number; // added to the light value (small sizes need brighter, flatter metal)
  minR: number; // minimum limb radius in px
  // ring radii in px from the centre (outer -> inner)
  rOut: number; rBez: number; rGroove: number; rTrack: number; rLip: number;
  segs: number[]; // segment boundaries in degrees from the top (mirrored left / right)
  gap: number; // gap between segments in px
}
const F = 1, SI = 2;
const ALL = F | SI;

const CFG: Record<ProcVariant, Cfg> = {
  full: { v: 'full', S: 95, lod: F, k: 3.5, glowK: 2.5, lift: 0, minR: 1.0, rOut: 47.5, rBez: 46.5, rGroove: 42.5, rTrack: 41.5, rLip: 37.6, segs: [7, 30, 55, 101, 146], gap: 1.4 },
  simple: { v: 'simple', S: 47, lod: SI, k: 6, glowK: 4, lift: 0.1, minR: 1.0, rOut: 23.5, rBez: 22.6, rGroove: 20.6, rTrack: 19.7, rLip: 17.7, segs: [9, 42, 96, 146], gap: 1.1 },
  screen: { v: 'screen', S: 31, lod: 0, k: 8, glowK: 4, lift: 0, minR: 0.6, rOut: 15.5, rBez: 15.0, rGroove: 14.0, rTrack: 13.9, rLip: 12.1, segs: [10, 62, 142], gap: 1.0 },
};

interface Ctx { c: Cfg; px: number; red: number; green: number; spark: number }

// ---------------------------------------------------------------- scene
/** The high-five contact point (key light source), on the centre column above both heads. */
const GX = 0, GY = -0.27;
/** Floor line: the feet stand on it. */
const FLOOR = 0.575;
/** Contact row of a variant (the spark centre). */
const contactRow = (S: number): number => Math.round((GY + 1) * (S / 2) - 0.5);

interface Smp { x: number; y: number; ix: number; iy: number; d: number; nx: number; ny: number; nz: number; l: number }
type Shade = (s: Smp, k: Ctx) => number;
type Kind = 'lit' | 'lamp' | 'socket' | 'tank';
interface Part { g: number; f: Sdf; bev: number; sh: Shade; kind: Kind; sep: boolean; rim: boolean; spec: number; name: string }

/** Key light (the high-five glow, slightly in front) + soft top fill + specular. */
function light(x: number, y: number, nx: number, ny: number, nz: number): number {
  const lx = GX - x, ly = GY - y, lz = 0.42;
  const dist = Math.hypot(lx, ly), ll = Math.hypot(lx, ly, lz);
  const dif = Math.max(0, (nx * lx + ny * ly + nz * lz) / ll);
  const att = 1 / (1 + (dist / 0.8) ** 2);
  const hx = lx / ll, hy = ly / ll, hz = lz / ll + 1, hl = Math.hypot(hx, hy, hz);
  const sp = Math.max(0, (nx * hx + ny * hy + nz * hz) / hl) ** 28 * att;
  const fill = Math.max(0, -0.45 * ny + 0.89 * nz);
  return 0.1 + 0.28 * fill + 0.75 * dif * att + 0.5 * sp;
}

/**
 * Lit materials. Palette roles: the small robot is gunmetal (6/7/8, caps at 9), the tall
 * robot is light steel (8/9/10). White (27) is never on a ramp: it belongs to the spark,
 * plus a few specular pixels placed explicitly.
 */
interface Mat { ramp: number[]; gain: number; bias: number }
const MAT: Record<string, Mat> = {
  gun: { ramp: [1, 2, 4, 6, 7, 8, 9], gain: 0.95, bias: 0.17 },
  gunD: { ramp: [1, 2, 4, 6, 7, 8, 9], gain: 0.78, bias: 0.12 },
  leg: { ramp: [2, 4, 6, 7, 8, 9], gain: 0.85, bias: 0.3 },
  steel: { ramp: [2, 4, 6, 7, 8, 9, 10], gain: 0.95, bias: 0.25 },
  steelD: { ramp: [2, 4, 6, 7, 8, 9, 10], gain: 0.8, bias: 0.15 },
  dark: { ramp: [0, 1, 2, 3, 4, 5, 6], gain: 0.9, bias: 0 },
  darkG: { ramp: [0, 1, 2, 3, 4, 5, 6], gain: 0.9, bias: 0 },
  cap: { ramp: [4, 6, 7, 7, 8], gain: 0.9, bias: 0.1 },
  socket: { ramp: [0, 1, 2, 3, 4, 5, 6], gain: 0.5, bias: 0 },
  rimL: { ramp: [3, 5, 7, 8, 9], gain: 1.1, bias: 0.15 },
  hand: { ramp: [1, 2, 4, 6, 7, 8], gain: 0.8, bias: 0 },
  handG: { ramp: [2, 4, 6, 7, 8, 9, 10], gain: 0.85, bias: 0 },
};
const lit = (m: string): Shade => {
  const M = MAT[m];
  return (s, k) => qlv(((s.l + k.c.lift) * M.gain + M.bias) * (M.ramp.length - 1), M.ramp, s.ix, s.iy, k.c.k);
};

/** Radial emissive (eyes, lamps): ramp levels from the core outwards. The one-level
 *  step-up of the pulse grows outwards from the core (no dither noise). */
function lamp(cx: number, cy: number, r: number, chan: 'red' | 'green', lv: number[]): Shade {
  const ramp = chan === 'red' ? RED : GRN;
  return (s, k) => {
    const t = Math.hypot(s.x - cx, s.y - cy) / r;
    const h = k.px / 2;
    const core = Math.abs(s.x - cx) <= h && Math.abs(s.y - cy) <= h;
    let l = lv[core ? 0 : Math.min(lv.length - 1, Math.floor(t * lv.length))];
    const p = chan === 'red' ? k.red : k.green;
    if (p > 0 && t < p * 1.0001) l += 1;
    return ramp[clamp(l, 0, ramp.length - 1)];
  };
}

/** Glowing glass tank: liquid (18 / 23) with a brighter streak (19 / 24) below `level`,
 *  dim glass (3 / 4) above it. The liquid steps up one level with its channel. */
function tank(cx: number, r: number, level: number, bot: number, chan: 'red' | 'green'): Shade {
  const ramp = chan === 'red' ? RED : GRN;
  return (s, k) => {
    const u = (s.x - cx) / r; // -1..1 across
    const streak = Math.abs(u + 0.4) < 0.3;
    if (s.y < level) return streak ? 4 : 3;
    const p = chan === 'red' ? k.red : k.green;
    let l = 3;
    if (streak) l = 4; // highlight streak
    const depth = clamp((s.y - level) / (bot - level));
    if (p > 0 && (1 - Math.abs(u)) * 0.6 + (1 - depth) * 0.4 < p * 1.0001) l += 1;
    return ramp[l];
  };
}

interface Scene { parts: Part[]; handL: number; handR: number }

function buildScene(c: Cfg): Scene {
  const pxs = 2 / c.S;
  const mr = c.minR * pxs;
  const R = (r: number): number => Math.max(r, mr);
  const parts: Part[] = [];
  const add = (name: string, g: number, lod: number, f: Sdf, bev: number, sh: Shade, kind: Kind = 'lit',
    o: { sep?: boolean; rim?: boolean; spec?: number } = {}): void => {
    if (lod & c.lod) parts.push({ name, g, f, bev, sh, kind, sep: o.sep ?? kind === 'lit', rim: o.rim ?? true, spec: o.spec ?? 0 });
  };
  const noRim = { rim: false };
  const fh = R(0.027);
  const footY = FLOOR - fh;

  // ======================= LEFT ROBOT: small dome bot, red eye =================
  const L = 1;
  const BX = -0.32, BY = 0.18, BR = 0.22;
  const TLX = -0.615;
  add('hoseL', L, F, halfRing(-0.55, 0.05, 0.062, R(0.02), true), R(0.02), lit('gunD'), 'lit', noRim);
  add('tankL', L, ALL, capsule(TLX, 0.06, TLX, 0.215, R(0.052)), R(0.052), tank(TLX, R(0.052), 0.1, 0.26, 'red'), 'tank', noRim);
  add('tankCapT', L, F, rbox(TLX, 0.012, R(0.054), R(0.02), R(0.012)), 0.03, lit('cap'), 'lit', noRim);
  add('tankCapB', L, F, rbox(TLX, 0.268, R(0.054), R(0.02), R(0.012)), 0.03, lit('cap'), 'lit', noRim);
  // short hanging arm on the far side, mostly tucked behind the dome
  add('armL2', L, F, capsule(-0.49, 0.3, -0.54, 0.36, R(0.032)), R(0.032), lit('gunD'), 'lit', noRim);
  add('clawL', L, F, rbox(-0.545, 0.39, R(0.032), R(0.028), R(0.014)), R(0.03), lit('dark'), 'lit', noRim);
  // stubby legs: knee joints right under the dome, short shins, foot slabs
  add('shinL1', L, ALL, capsule(BX - 0.09, 0.43, BX - 0.095, footY - 0.01, R(0.042)), R(0.042), lit('leg'));
  add('shinL2', L, ALL, capsule(BX + 0.09, 0.43, BX + 0.095, footY - 0.01, R(0.042)), R(0.042), lit('leg'));
  add('kneeL1', L, F | SI, circle(BX - 0.09, 0.465, R(0.048)), R(0.048), lit('leg'));
  add('kneeL2', L, F | SI, circle(BX + 0.09, 0.465, R(0.048)), R(0.048), lit('leg'));
  add('footL1', L, ALL, rbox(BX - 0.11, footY, 0.068, fh, 0.022), 0.035, lit('gun'));
  add('footL2', L, ALL, rbox(BX + 0.115, footY, 0.068, fh, 0.022), 0.035, lit('gun'));
  // ear joint on the left of the dome
  add('earL', L, F | SI, circle(BX - 0.205, BY + 0.01, R(0.056)), R(0.056), lit('dark'), 'lit', noRim);
  add('earLamp', L, F, circle(BX - 0.205, BY + 0.01, 0.025), 0.025, lamp(BX - 0.205, BY + 0.01, 0.025, 'red', [2]), 'lamp');
  // the dome
  add('dome', L, ALL, circle(BX, BY, BR), BR, lit('gun'));
  add('hatch', L, F, rbox(BX - 0.035, BY - BR + 0.045, 0.036, 0.013, 0.01, -0.2), 0.012, lamp(BX - 0.035, BY - BR + 0.045, 0.04, 'red', [2]), 'lamp');
  // eye: metal bezel, dark socket, lens
  const ex = BX + 0.05, ey = BY - 0.02;
  add('eyeRim', L, F | SI, circle(ex, ey, 0.112), 0.02, lit('rimL'), 'lit', { sep: false });
  add('socket', L, ALL, circle(ex, ey, 0.09), 0.025, lit('socket'), 'socket');
  add('eyeL', L, ALL, circle(ex, ey, 0.066), 0.066, lamp(ex, ey, 0.066, 'red', [5, 4, 3, 3, 3, 2]), 'lamp');
  // raised arm: from the dome's upper right, bent slightly at the elbow, diagonally up to
  // the palm at the contact (about the tall robot's chin height, as in the reference)
  add('shoulderL', L, ALL, circle(-0.158, 0.04, R(0.046)), R(0.046), lit('gunD'));
  add('uarmL', L, ALL, capsule(-0.158, 0.04, -0.125, -0.105, R(0.033)), R(0.033), lit('gun'));
  add('elbowL', L, F | SI, circle(-0.125, -0.105, R(0.037)), R(0.037), lit('gunD'));
  add('farmL', L, ALL, capsule(-0.125, -0.105, -0.06, -0.215, R(0.031)), R(0.031), lit('gun'));
  const handL = parts.length;
  // the SDF hand is replaced by an explicit palm cluster after shading (sep: false, so the
  // forearm keeps no contact line under it)
  add('handL', L, ALL, rbox(-0.045, -0.255, R(0.03), 0.04, R(0.02)), R(0.03), lit('hand'), 'lit', { sep: false });

  // ======================= RIGHT ROBOT: tall slender bot, green eye ============
  const G2 = 2;
  const TX = 0.36;
  const TRX = 0.565;
  add('hoseR', G2, F, halfRing(0.47, -0.3, 0.085, R(0.018), true), R(0.018), lit('darkG'), 'lit', noRim);
  add('tankR', G2, ALL, capsule(TRX, -0.255, TRX, -0.1, R(0.056)), R(0.056), tank(TRX, R(0.056), -0.22, -0.04, 'green'), 'tank', noRim);
  add('tankRCapT', G2, F, rbox(TRX, -0.31, R(0.056), R(0.02), R(0.012)), 0.03, lit('cap'), 'lit', noRim);
  add('tankRCapB', G2, F, rbox(TRX, -0.045, R(0.056), R(0.02), R(0.012)), 0.03, lit('cap'), 'lit', noRim);
  // hanging right arm
  add('shoulderR2', G2, ALL, circle(TX + 0.115, -0.165, R(0.046)), R(0.046), lit('steelD'));
  add('uarmR2', G2, ALL, capsule(TX + 0.12, -0.15, TX + 0.165, 0.04, R(0.031)), R(0.031), lit('steelD'));
  add('elbowR2', G2, F | SI, circle(TX + 0.165, 0.04, R(0.033)), R(0.033), lit('darkG'));
  add('farmR2', G2, ALL, taper(TX + 0.165, 0.04, TX + 0.185, 0.2, R(0.032), R(0.026)), R(0.03), lit('steel'));
  add('handR2', G2, ALL, rbox(TX + 0.19, 0.245, R(0.028), R(0.042), R(0.016), -0.1), R(0.028), lit('steelD'));
  // legs
  add('thighR1', G2, ALL, taper(TX - 0.05, 0.18, TX - 0.058, 0.35, R(0.046), R(0.035)), R(0.045), lit('steel'));
  add('thighR2', G2, ALL, taper(TX + 0.05, 0.18, TX + 0.062, 0.35, R(0.046), R(0.035)), R(0.045), lit('steel'));
  add('shinR1', G2, ALL, taper(TX - 0.058, 0.38, TX - 0.066, footY - 0.02, R(0.038), R(0.028)), R(0.036), lit('steelD'));
  add('shinR2', G2, ALL, taper(TX + 0.062, 0.38, TX + 0.072, footY - 0.02, R(0.038), R(0.028)), R(0.036), lit('steelD'));
  add('kneeR1', G2, F | SI, circle(TX - 0.058, 0.365, R(0.038)), R(0.038), lit('darkG'));
  add('kneeR2', G2, F | SI, circle(TX + 0.062, 0.365, R(0.038)), R(0.038), lit('darkG'));
  add('footR1', G2, ALL, rbox(TX - 0.088, footY, 0.062, fh, 0.022), 0.035, lit('steel'));
  add('footR2', G2, ALL, rbox(TX + 0.08, footY, 0.062, fh, 0.022), 0.035, lit('steel'));
  // torso: pelvis, segmented waist, chest plate
  add('pelvisR', G2, ALL, rbox(TX, 0.165, 0.085, R(0.042), 0.035), 0.045, lit('steel'));
  add('waistR', G2, ALL, rbox(TX, 0.06, R(0.05), 0.08, 0.025), 0.035, lit('darkG'));
  add('abs1', G2, F, rbox(TX, 0.015, 0.058, 0.017, 0.012), 0.02, lit('steelD'));
  add('abs2', G2, F, rbox(TX, 0.062, 0.055, 0.017, 0.012), 0.02, lit('steelD'));
  add('abs3', G2, F, rbox(TX, 0.108, 0.052, 0.015, 0.012), 0.02, lit('steelD'));
  add('chestR', G2, ALL, taper(TX, -0.13, TX, -0.045, 0.1, 0.065), 0.09, lit('steel'), 'lit', { spec: 0 });
  add('neckR', G2, ALL, capsule(TX - 0.015, -0.255, TX - 0.01, -0.2, R(0.026)), R(0.026), lit('darkG'));
  // head
  const hx = 0.33, hy = -0.35;
  add('headR', G2, ALL, ellipse(hx, hy, 0.1, 0.115), 0.1, lit('steel'), 'lit', { spec: 0 });
  add('earR', G2, F, circle(hx + 0.07, hy + 0.01, 0.034), 0.034, lit('steelD'));
  const gx = hx - 0.058, gy = hy + 0.015;
  add('socketR', G2, ALL, circle(gx, gy, 0.058), 0.02, lit('socket'), 'socket');
  add('eyeR', G2, ALL, circle(gx, gy, R(0.04)), R(0.04), lamp(gx, gy, R(0.04), 'green', [5, 4, 3, 3]), 'lamp');
  // raised arm: the upper arm hangs down-left to the elbow, the forearm rises up-left to
  // the palm (the reference's V-shaped arm)
  add('shoulderR', G2, ALL, circle(TX - 0.11, -0.165, R(0.044)), R(0.044), lit('steelD'));
  const elx = 0.17, ely = -0.08;
  add('uarmR', G2, ALL, capsule(TX - 0.11, -0.165, elx, ely, R(0.031)), R(0.031), lit('steel'));
  add('elbowR', G2, F | SI, circle(elx, ely, R(0.034)), R(0.034), lit('darkG'));
  add('elbowLamp', G2, F, circle(elx, ely, 0.015), 0.015, lamp(elx, ely, 0.016, 'green', [3]), 'lamp');
  add('farmR', G2, ALL, capsule(elx, ely, 0.06, -0.215, R(0.03)), R(0.03), lit('steel'));
  const handR = parts.length;
  add('handR', G2, ALL, rbox(0.045, -0.255, R(0.03), 0.04, R(0.02)), R(0.03), lit('handG'), 'lit', { sep: false });
  return { parts, handL, handR };
}

// ---------------------------------------------------------------- geometry cache
const N4: ReadonlyArray<readonly [number, number]> = [[1, 0], [-1, 0], [0, 1], [0, -1]];

interface Geo {
  sc: Scene;
  zone: Uint8Array; // 0 outside, 1 bezel, 2 track/lip, 3 interior
  rp: Float32Array; // radius in px
  own: Int16Array; // part index per pixel (-1 = none)
  ds: Float32Array; nx: Float32Array; ny: Float32Array; nz: Float32Array; l: Float32Array;
  sil: Uint8Array; // 1 = on the robot's silhouette (4-neighbour outside its group)
  spec: number[]; // pixels lifted to white (specular)
  floorRow: number;
}
const GEO = new Map<ProcVariant, Geo>();

function geometry(c: Cfg): Geo {
  const hit = GEO.get(c.v);
  if (hit) return hit;
  const S = c.S, half = S / 2, px = 2 / S;
  const sc: Scene = c.v !== 'full' ? { parts: [], handL: -1, handR: -1 } : buildScene(c);
  const parts = sc.parts;
  const n = S * S;
  const zone = new Uint8Array(n), rpA = new Float32Array(n);
  const own = new Int16Array(n).fill(-1);
  const ds = new Float32Array(n), nx = new Float32Array(n), ny = new Float32Array(n), nz = new Float32Array(n), l = new Float32Array(n);
  const P = (i: number): number => (i + 0.5 - half) / half;
  for (let iy = 0; iy < S; iy++) {
    for (let ix = 0; ix < S; ix++) {
      const i = iy * S + ix;
      const rp = Math.hypot(ix + 0.5 - half, iy + 0.5 - half);
      rpA[i] = rp;
      zone[i] = rp > c.rOut ? 0 : rp > c.rGroove ? 1 : rp > c.rLip ? 2 : 3;
      // robots stay 1+ px clear of the lip, so a void outline always separates them from the ring
      if (zone[i] !== 3 || rp > c.rLip - 1) continue;
      const x = P(ix), y = P(iy);
      for (let p = parts.length - 1; p >= 0; p--) {
        const d = parts[p].f(x, y);
        if (d < 0) { own[i] = p; ds[i] = d; break; }
      }
      const p = own[i];
      if (p < 0) continue;
      const part = parts[p], d = ds[i], e = 0.0015;
      let gx = part.f(x + e, y) - part.f(x - e, y), gy = part.f(x, y + e) - part.f(x, y - e);
      const gl = Math.hypot(gx, gy) || 1;
      gx /= gl; gy /= gl;
      const t = clamp(-d / Math.max(part.bev, px * 0.75));
      const sx = 1 - t;
      nx[i] = gx * sx; ny[i] = gy * sx; nz[i] = Math.sqrt(Math.max(0, 1 - sx * sx));
      l[i] = light(x, y, nx[i], ny[i], nz[i]);
    }
  }
  const grp = (ix: number, iy: number): number => {
    if (ix < 0 || iy < 0 || ix >= S || iy >= S) return 0;
    const p = own[iy * S + ix];
    return p < 0 ? 0 : parts[p].g;
  };
  const sil = new Uint8Array(n);
  for (let iy = 0; iy < S; iy++) {
    for (let ix = 0; ix < S; ix++) {
      const g = grp(ix, iy);
      if (g && (grp(ix - 1, iy) !== g || grp(ix + 1, iy) !== g || grp(ix, iy - 1) !== g || grp(ix, iy + 1) !== g)) sil[iy * S + ix] = 1;
    }
  }
  // specular: the brightest interior pixels of parts that ask for it
  const spec: number[] = [];
  parts.forEach((part, p) => {
    if (!part.spec) return;
    const cand: number[] = [];
    for (let i = 0; i < n; i++) if (own[i] === p && !sil[i]) cand.push(i);
    cand.sort((a, b) => l[b] - l[a]);
    spec.push(...cand.slice(0, part.spec));
  });
  const floorRow = c.v === 'simple' ? SIMPLE_FLOOR : Math.floor((FLOOR + 1) * half - 0.5);
  const geo: Geo = { sc, zone, rp: rpA, own, ds, nx, ny, nz, l, sil, spec, floorRow };
  GEO.set(c.v, geo);
  return geo;
}

// ---------------------------------------------------------------- rendering
function renderProc(c: Cfg, o: EmblemOpts): IndexedPixels {
  const S = c.S, px = 2 / S, half = S / 2;
  const k: Ctx = { c, px, red: clamp(o.red ?? 0), green: clamp(o.green ?? 0), spark: clamp(o.spark ?? 0) };
  const geo = geometry(c);
  const { zone, own, sil } = geo;
  const parts = geo.sc.parts;
  const P = (i: number): number => (i + 0.5 - half) / half;
  const data = new Uint8Array(S * S).fill(T);

  // ---- pass 1: ring + backdrop
  for (let iy = 0; iy < S; iy++) {
    for (let ix = 0; ix < S; ix++) {
      const i = iy * S + ix;
      const z = zone[i];
      if (z === 0) continue;
      const x = P(ix), y = P(iy);
      data[i] = z === 3 ? backPixel(k, ix, iy, x, y, geo.rp[i], geo.floorRow) : ringPixel(k, ix, iy, x, y, geo.rp[i]);
    }
  }
  const bg = data.slice();
  if (c.v === 'screen' || c.v === 'simple') {
    const block = new Int16Array(S * S).fill(-1);
    if (c.v === 'screen') screenFigures(k, data, block);
    else simpleFigures(k, data, block, zone);
    spark(k, data, block);
    return { w: S, h: S, data };
  }

  // ---- pass 2: robots
  for (let iy = 0; iy < S; iy++) {
    for (let ix = 0; ix < S; ix++) {
      const i = iy * S + ix, p = own[i];
      if (p < 0) continue;
      const part = parts[p];
      const smp: Smp = { x: P(ix), y: P(iy), ix, iy, d: geo.ds[i], nx: geo.nx[i], ny: geo.ny[i], nz: geo.nz[i], l: geo.l[i] };
      data[i] = part.sh(smp, k);
    }
  }
  for (const i of geo.spec) data[i] = 27;

  // ---- pass 3: contact lines, rim lights, outlines
  const grp = (ix: number, iy: number): number => {
    if (ix < 0 || iy < 0 || ix >= S || iy >= S) return 0;
    const p = own[iy * S + ix];
    return p < 0 ? 0 : parts[p].g;
  };
  // outer edge: no pixel of the same robot within `reach` px on the light's side
  const reach = 6;
  const outer = (ix: number, iy: number, g: number): boolean => {
    const dir = g === 1 ? -1 : 1;
    for (let d = 2; d <= reach; d++) if (grp(ix + dir * d, iy) === g) return false;
    return true;
  };
  const out = data.slice();
  const rimAt = new Map<number, number>();
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
      if (!sil[i] || !part.rim || isEmissive(data[i])) continue;
      // rim light: red only on the small robot's outer-left edge, mint only on the tall robot's outer-right edge
      const nx = geo.nx[i];
      if (!outer(ix, iy, g)) continue;
      if (g === 1 && nx < -0.3) {
        const v = nx < -0.55 ? 18 : 17;
        rimAt.set(i, k.red >= 0.5 ? up1(v) : v);
      } else if (g === 2 && nx > 0.3) {
        const v = nx > 0.55 ? 24 : 23;
        rimAt.set(i, k.green >= 0.5 ? up1(v) : v);
      }
    }
  }
  // rim light only as runs: a rim pixel with no rim neighbour would read as a stray speck
  for (const [i, v] of rimAt) {
    let n = 0;
    for (const j of [i - 1, i + 1, i - S, i + S, i - S - 1, i - S + 1, i + S - 1, i + S + 1]) if (rimAt.has(j)) n++;
    if (n) out[i] = v;
  }
  // outline: interior background pixels touching a robot become void
  for (let iy = 0; iy < S; iy++) {
    for (let ix = 0; ix < S; ix++) {
      const i = iy * S + ix;
      if (own[i] >= 0 || zone[i] !== 3) continue;
      if (grp(ix - 1, iy) || grp(ix + 1, iy) || grp(ix, iy - 1) || grp(ix, iy + 1)) out[i] = 0;
    }
  }

  // ---- pass 4: explicit palm clusters at the contact
  const block = own.slice();
  palms(k, out, block, bg, geo);

  // ---- pass 5: floor pools under each robot
  floorGlow(k, out, geo);

  // ---- pass 6: the high-five starburst
  spark(k, out, block);
  return { w: S, h: S, data: out };
}

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
  // screen: one flat level across the track (no inner / outer anti-aliasing that would
  // flip sides from row to row and wobble under scanlines)
  const core = c.v === 'screen' || (u < 0.55 && toEnd >= 0.9);
  let lv = core ? base + 1 : base;
  // pulse in whole bands, never per pixel: the core steps up at 0.5, the edges at 0.75
  if (p >= (core ? 0.5 : 0.75)) lv += 1;
  return ramp[lv];
}

function backPixel(k: Ctx, ix: number, iy: number, x: number, y: number, rp: number, floorRow: number): number {
  const c = k.c;
  const left = x < 0;
  const S = c.S;
  if (c.v === 'screen') return 0; // CRT: plain black disc
  if (iy > floorRow) return iy === floorRow + 1 ? 1 : 0; // dark floor
  // radial glow from the high-five + a soft vignette towards the lip
  const dG = Math.hypot(x - GX, y - GY);
  const ri = rp / c.rLip;
  const g = 0.9 / (1 + (dG / 0.21) ** 2) + 0.25 * (1 - ri * ri);
  let idx = qlv(clamp(g * 1.1 + 0.25) * 3, [0, 1, 21, 22], ix, iy, c.glowK);
  if (c.v === 'full') {
    // faint grid (21 on 1), only inside the glow
    const gxp = ix - (S - 1) / 2;
    const gyp = iy - contactRow(S);
    if ((gxp % 8 === 0 || gyp % 8 === 0) && g > 0.3 && idx === 1 && dG > 0.12) idx = 21;
  }
  // segment light spill just inside the lip
  const edge = c.rLip - rp; // px inside the lip
  const a = Math.abs(angTop(x, y));
  if (a > c.segs[0] + 2 && a < c.segs[c.segs.length - 1] - 2 && edge < 3) {
    const s = (1 - edge / 3) * 1.4;
    const v = qlv(s, left ? [idx, 11, 17] : [idx, 21, 22], ix, iy, 1.6);
    if (v !== idx) idx = v;
  }
  return idx;
}

/*
 * Palm clusters at the contact: two mitten hands pressed palm to palm, fingers up, one
 * pixel wider than the forearms, with a thumb bump on the outer side. Maps run from the
 * fingertip row (contact row - 1) down; columns from the outer edge to the seam neighbour.
 * The right hand is the mirror image in light steel with a mint rim.
 *   d brightest (lit by the spark)  c light  b mid  a shadow  r rim  q dim rim  . untouched
 */
const PALM_FULL = [
  '...dd',
  '..cbd',
  '.rbbd',
  '.rabd',
  '.qabc',
  '..qac',
];
function palms(k: Ctx, out: Uint8Array, block: Int16Array, bg: Uint8Array, geo: Geo): void {
  const c = k.c, S = c.S;
  const cx = (S - 1) / 2, cy = contactRow(S);
  const { handL, handR } = geo.sc;
  const { zone } = geo;
  // clear the SDF hands near the contact; the clusters below replace them
  for (let y = cy - 3; y <= cy + 6; y++) {
    for (let x = cx - 6; x <= cx + 6; x++) {
      const i = y * S + x;
      if (block[i] === handL || block[i] === handR) { out[i] = bg[i]; block[i] = -1; }
    }
  }
  const r = k.red >= 0.5, g = k.green >= 0.5;
  const LV: Record<string, number> = { d: 9, c: 7, b: 6, a: 5, r: r ? 19 : 18, q: r ? 18 : 17 };
  const RV: Record<string, number> = { d: 10, c: 9, b: 8, a: 7, r: g ? 25 : 24, q: g ? 24 : 23 };
  const map = PALM_FULL;
  const w = map[0].length;
  const top = cy - 1;
  const stamped: number[] = [];
  for (let j = 0; j < map.length; j++) {
    const y = top + j;
    for (let m = 0; m < w; m++) {
      const ch = map[j][m];
      if (ch === '.') continue;
      const xl = cx - w + m, xr = cx + w - m;
      out[y * S + xl] = LV[ch]; block[y * S + xl] = handL;
      out[y * S + xr] = RV[ch]; block[y * S + xr] = handR;
      stamped.push(y * S + xl, y * S + xr);
    }
  }
  // void outline around the new hand pixels (the seam column stays open for the spark)
  for (const i of stamped) {
    for (const j of [i - 1, i + 1, i - S, i + S]) {
      if (block[j] < 0 && zone[j] === 3 && j % S !== cx) out[j] = 0;
    }
  }
}

/*
 * simple: hand-placed figure layer at 47 px, drawn on the procedural ring and backdrop.
 * Bold clusters for 1x on walls and 2x in menus: a round 11 px dome robot (gunmetal,
 * red rim on its outer left, 2x2 red lens) and a slender light-steel robot (mint rim on
 * its outer right, green eye facing left). The raised arms meet at the contact (column
 * 23, row 17) in two mitten hands; the spark seam between them is drawn by spark().
 * Background pixels touching a figure become a void outline.
 *   0-9 / A  steel index 0-10      r q  red rim 18 / 17          m n  mint rim 24 / 23
 *   e E k    red lens 18, glint 19, lens 18 that stays red at the peak
 *   g G      green eye 24, glint 25  t T  red tank 18 / 19         u U  green tank 23 / 24
 *   f h      red floor 17 / 11       F H  green floor 23 / 22      .    untouched
 */
// <SIMPLE_FIG>
const SIMPLE_X0 = 9, SIMPLE_Y0 = 11;
const SIMPLE_FLOOR = 34;
const SIMPLE_FIG = [
  '.....................8998....',
  '....................899987...',
  '....................9Gg98m...',
  '....................8gg87m...',
  '....................788776...',
  '............89.A9....6776....',
  '...........r79.A8m....65.....',
  '78.........r68.98m...89998...',
  'tT6.........67.87...89AA987..',
  'tt.677888..87...9...989998m8m',
  'tt.q78899976.....9.8.78987.8m',
  '67q77889999......8.8..787..8m',
  '.r6778811998......6...676..6.',
  '.r56781eE188..........898..8m',
  '.r56771ke188..........676..8m',
  '.r5567711887.........78987..9',
  '.r4556677776.........87.8n...',
  '..q45566666..........87.8n...',
  '...q445555...........98.9m...',
  '....44444............87.8n...',
  '...76...76...........87.8n...',
  '...87...87...........76.76...',
  '..7887.7887.........898.89...',
  '..5555.5555.........666.66...',
  '....hffffh..........HFFFFH...',
];
// </SIMPLE_FIG>
function simpleFigures(k: Ctx, out: Uint8Array, block: Int16Array, zone: Uint8Array): void {
  const r = k.red >= 0.5, g = k.green >= 0.5;
  const r2 = k.red >= 0.75, g2 = k.green >= 0.75;
  const lg: Record<string, number> = {
    A: 10, r: r ? 19 : 18, q: r ? 18 : 17, m: g ? 25 : 24, n: g ? 24 : 23,
    e: r ? 19 : 18, E: r ? 20 : 19, k: 18, g: g ? 25 : 24, G: 25,
    t: r ? 19 : 18, T: r ? 20 : 19, u: g ? 24 : 23, U: g ? 25 : 24,
    f: r2 ? 18 : 17, h: r2 ? 17 : 11, F: g2 ? 24 : 23, H: g2 ? 23 : 22,
  };
  for (let d = 0; d <= 9; d++) lg[String(d)] = d;
  const S = k.c.S;
  const fig: number[] = [];
  for (let j = 0; j < SIMPLE_FIG.length; j++) {
    const row = SIMPLE_FIG[j], y = SIMPLE_Y0 + j;
    for (let m = 0; m < row.length; m++) {
      const ch = row[m];
      if (ch === '.' || ch === ' ') continue;
      const i = y * S + SIMPLE_X0 + m;
      out[i] = lg[ch];
      if ('fhFH'.indexOf(ch) >= 0) block[i] = -2; // floor glow: no outline, spark may pass
      else { block[i] = 1; fig.push(i); }
    }
  }
  const cx = (S - 1) / 2;
  for (const i of fig) {
    for (const j of [i - 1, i + 1, i - S, i + S]) {
      if (block[j] === -1 && zone[j] === 3 && j % S !== cx) out[j] = 0;
    }
  }
}

/*
 * screen: CRT figures, hand-placed at 31 px on the same layout (contact at column 15,
 * row 11, above the small dome and at the tall robot's chin). Each robot is a solid
 * phosphor fill inside a brighter outline, so it reads as a shape, not a glyph, and
 * stays visible when scanlines dim every second row one step (18 -> 17, 24 -> 23).
 * The reflections are single glow pixels under each foot (2+ px clear of the arcs), so
 * legs and floor never close into a box.
 *   R 18 red outline          q 17 red fill        o 0 socket / visor
 *   e E k red lens 18 / glint 19 / lens pixel that stays 18 at the peak
 *   G 24 green outline        g 23 green fill      c C green eye 24 / glint 25
 *   L l left palm 18 / 19     M m right palm 24 / 25
 *   f 17 red floor            F 23 green floor     . untouched
 */
// <SCREEN_FIG>
const SCREEN_FIG = [
  '...............................',
  '...............................',
  '...............................',
  '...............................',
  '...............................',
  '...............................',
  '...............................',
  '....................GGG........',
  '...................GgogG.......',
  '...................GCogG.......',
  '..............l.m..GoogG.......',
  '.............Ll.mM..GGG........',
  '.............LL.MMG..G.........',
  '........RRRRR.....GGGGGGG......',
  '.......RqqooR......GgggGG......',
  '......RqqoeEoR......GgG.G......',
  '......RqqokeoR......GgG.G......',
  '......RqqqooqR.....GGGGG.......',
  '......RqqqqqqR......G.G........',
  '.......RqqqqR.......G.G........',
  '........RRRR........G.G........',
  '........R..R........G.G........',
  '.......RR..RR......GG.GG.......',
  '........f..f........F.F........',
  '...............................',
  '...............................',
  '...............................',
  '...............................',
  '...............................',
  '...............................',
  '...............................',
];
// </SCREEN_FIG>
function screenFigures(k: Ctx, out: Uint8Array, block: Int16Array): void {
  const r = k.red >= 0.5, g = k.green >= 0.5;
  const r2 = k.red >= 0.75, g2 = k.green >= 0.75;
  const map: Record<string, number> = {
    R: r ? 19 : 18, q: 17, o: 0, e: r ? 19 : 18, E: r ? 20 : 19, k: 18,
    G: g ? 25 : 24, g: 23, c: g ? 25 : 24, C: 25,
    L: r ? 19 : 18, l: r ? 20 : 19, M: g ? 25 : 24, m: 25,
    f: r2 ? 18 : 17, F: g2 ? 24 : 23,
  };
  const S = k.c.S;
  for (let y = 0; y < S; y++) {
    const row = SCREEN_FIG[y];
    if (!row) continue;
    for (let x = 0; x < S; x++) {
      const v = map[row[x]];
      if (v === undefined) continue;
      out[y * S + x] = v;
      if (row[x] !== 'f' && row[x] !== 'F') block[y * S + x] = 1;
    }
  }
}

/** Floor pools: red under the small robot, green under the tall one, plus foot reflections. */
function floorGlow(k: Ctx, out: Uint8Array, geo: Geo): void {
  const c = k.c, S = c.S;
  const parts = geo.sc.parts;
  const { own, zone } = geo;
  // pools stay 2+ px clear of the ring lip, so they never hook into the arcs
  const inside = (x: number, y: number): boolean => {
    if (x < 1 || y < 1 || x >= S - 1 || y >= S - 1) return false;
    const i = y * S + x;
    return zone[i] === 3 && own[i] < 0 && geo.rp[i] < c.rLip - 2.2;
  };
  for (const g of [1, 2]) {
    // the feet: the lowest row holding this robot
    let fr = -1;
    const cols: number[] = [];
    for (let y = S - 1; y >= 0 && fr < 0; y--) {
      for (let x = 0; x < S; x++) {
        const p = own[y * S + x];
        if (p >= 0 && parts[p].g === g) { fr = y; cols.push(x); }
      }
    }
    if (fr < 0) continue;
    const x0 = cols[0], x1 = cols[cols.length - 1];
    const xc = (x0 + x1) / 2, hw = (x1 - x0) / 2 + 1;
    const p = g === 1 ? k.red : k.green;
    const feet = new Set(cols);
    // one ramp step up with the pulse, sweeping outwards from under the robot
    const lift = (v: number, x: number): number => (p > 0 && Math.abs(x - xc) / (hw + 2) < p * 1.0001 ? up1(v) : v);
    const put = (x: number, y: number, v: number): void => { if (inside(x, y)) out[y * S + x] = lift(v, x); };
    if (c.v === 'full') {
      // solid bands, no dither: foot reflections + pool, then a shorter core run
      const core = g === 1 ? 17 : 23, edge = g === 1 ? 11 : 22;
      for (let x = x0 - 3; x <= x1 + 3; x++) {
        const dx = Math.abs(x - xc) / (hw + 2);
        if (feet.has(x)) put(x, fr + 1, core);
        else if (dx < 0.95) put(x, fr + 1, edge);
        if (dx < 0.5) put(x, fr + 2, core);
        else if (dx < 0.8) put(x, fr + 2, edge);
        if (dx < 0.3) put(x, fr + 3, edge);
      }
    } else {
      for (let x = x0; x <= x1; x++) put(x, fr + 1, g === 1 ? 17 : 23);
    }
  }
}

/**
 * The high-five starburst: a white core on the seam between the palms, a four-pointed
 * glow behind the hands and short rays that end inside the backdrop. The spark channel
 * works in clean stages (0.5, 0.75, 1): below 0.5 the burst keeps its resting look, so
 * the still frame (0.25) carries no stray pixels.
 */
function spark(k: Ctx, out: Uint8Array, block: Int16Array): void {
  const c = k.c, S = c.S;
  const st = k.spark >= 1 ? 3 : k.spark >= 0.75 ? 2 : k.spark >= 0.5 ? 1 : 0;
  const cx = (S - 1) / 2;
  const cy = contactRow(S);
  const put = (x: number, y: number, v: number, over = false): void => {
    if (x < 0 || y < 0 || x >= S || y >= S) return;
    const i = y * S + x;
    if (out[i] === T) return;
    if (!over && block[i] >= 0) return;
    out[i] = v;
  };
  const big = c.v === 'full', mid = c.v === 'simple';
  // glow behind the hands: a four-pointed star (reaches further along the axes than along
  // the diagonals), banded white -> peach -> amber with short dithered seams
  const rg = big ? 4.6 + st * 0.8 : mid ? 2.7 + st * 0.45 : 1.7 + st * 0.35;
  const R0 = Math.ceil(rg);
  const oy = cy - 1; // the burst centres on the fingertips
  for (let y = -R0; y <= R0; y++) {
    for (let x = -R0; x <= R0; x++) {
      const r0 = Math.hypot(x, y * 1.08);
      const d = r0 * (1 + (r0 > 0 ? (0.9 * Math.abs(x * y)) / (r0 * r0) : 0) * 1.6);
      if (d > rg || oy + y < 0) continue;
      const lv = Math.pow(1 - d / rg, 0.8) * 3.4;
      const v = qlv(lv, [out[(oy + y) * S + cx + x], 26, 20, 27], cx + x, oy + y, 3);
      put(cx + x, oy + y, v);
    }
  }
  const ray = (f: number): number => (f > 0.72 ? 27 : f > 0.46 ? 20 : f > 0.24 ? 26 : 22);
  // vertical ray: fades out well inside the backdrop (no seam through the ring)
  const Lv = big ? 8 + st * 2 : mid ? 4 + st : 2 + (st >> 1);
  for (let d = 1; d <= Lv; d++) put(cx, oy - d, ray(1 - d / (Lv + 1)));
  // horizontal (medium) and diagonal (short) rays
  const Lh = big ? 8 + st : mid ? 4 + (st >> 1) : 2 + (st >> 1);
  for (let d = 1; d <= Lh; d++) {
    const f = 1 - d / (Lh + 1);
    put(cx - d, oy, ray(f));
    put(cx + d, oy, ray(f));
  }
  const Ld = big ? 3 + st : mid ? 2 + (st >> 1) : st >> 1;
  for (let d = 1; d <= Ld; d++) {
    const v = ray((1 - d / (Ld + 1)) * 0.85);
    put(cx - d, oy - d, v);
    put(cx + d, oy - d, v);
  }
  // core: the seam between the palms; peach flares that turn white at the peak
  put(cx, oy - 1, st >= 1 ? 27 : 20);
  for (let dy = 0; dy <= 2; dy++) put(cx, oy + dy, 27, true);
  if (big) { put(cx, oy + 3, 20, true); put(cx, oy + 4, 26, true); put(cx, oy + 5, 1, true); }
  else if (mid) { put(cx, oy + 3, 26, true); }
  if (st >= 2 && c.v !== 'screen') { put(cx - 1, oy - 1, 20); put(cx + 1, oy - 1, 20); }
}

// ---------------------------------------------------------------- badge (hand-authored)
/*
 * 15x15, mirrors the scene: the spark (7,5) sits at the tall robot's chin with a palm on
 * each side, (6,5) and (8,5), so the hands touch the spark column. Both raised arms are
 * 45 degree pixel chains into the shoulders ("/" from the small dome, "\" into the tall
 * robot's shoulder). Small dome robot left: a round 4x4 body in gunmetal 8 with a 9
 * highlight towards the spark (above the 2.4:1 of index 7 on the interior), red eye.
 * Tall robot right: light steel 10 / 9, green eye facing left, hanging arm, two legs.
 *   b bezel 3   k interior 1   R red arc 18   G green arc 24
 *   * spark 27  P flare 20 (spark: 27)  f side flare (spark: 20)  u v up / down ray (spark: 26)
 *   o O small robot 8 / 9   h small palm 9   e red eye 18 (red: 19)
 *   r body pixel beside the eye that blooms to red 18 when the eye steps up, so the
 *     eye never loses its saturated red
 *   s d tall robot 10 / 9   H tall palm 10   g green eye 24 (green: 25)
 */
const BADGE = [
  '.....bbbbb.....',
  '...bbRRkGGbb...',
  '..bRRkkkkkGGb..',
  '.bRkkkkuksskGb.',
  '.bRkkkfPfgskGb.',
  'bRkkkkh*HkdkkGb',
  'bRkkkkOvkssdkGb',
  'bRkkoOkkkssdkGb',
  'bRkoreokksdkkGb',
  'bRkooookkdddkGb',
  '.bkkookkkskskb.',
  '.bkokkokkskskb.',
  '..bkkkkkkkkkb..',
  '...bbkkkkkbb...',
  '.....bbbbb.....',
];
function badge(o: EmblemOpts): IndexedPixels {
  const red = clamp(o.red ?? 0) >= 0.5, green = clamp(o.green ?? 0) >= 0.5, sp = clamp(o.spark ?? 0) >= 0.5;
  const map: Record<string, number> = {
    '.': T, b: 3, k: 1,
    R: red ? 19 : 18, e: red ? 19 : 18, r: red ? 18 : 8,
    G: green ? 25 : 24, g: green ? 25 : 24,
    '*': 27, P: sp ? 27 : 20, f: sp ? 20 : 1, u: sp ? 26 : 1, v: sp ? 26 : 1,
    o: 8, O: 9, h: 9, s: 10, d: 9, H: 10,
  };
  const data = new Uint8Array(225);
  BADGE.forEach((r, y) => { for (let x = 0; x < 15; x++) data[y * 15 + x] = map[r[x]] ?? T; });
  return { w: 15, h: 15, data };
}

// ---------------------------------------------------------------- entry
export function emblemPixels(variant: EmblemVariant, opts: EmblemOpts = {}): IndexedPixels {
  if (variant === 'badge') return badge(opts);
  return renderProc(CFG[variant], opts);
}
