/**
 * KA-III game logo banner: "DIE KALIBRIERUNGSANLAGE III – DIE ÜBERGABE".
 *
 * Hand-built pixel art generated from code on the locked 28-colour palette (indices
 * 0..27, 255 = transparent). No imports: it runs under `node --experimental-strip-types`
 * and in the game bundle alike.
 *
 * Layout (320×102): a circular calibration medallion on the left (red half / green
 * half), a bevelled gunmetal frame with a top tab, coil and side brackets, the tagline
 * plate, the big custom bold title font, a green-rimmed Roman "III", the hexagonal
 * subtitle plate with chevron lights, and the bottom strip with the SEKTOR 7C badge.
 *
 * `red` / `green` (0..1) pulse the red and green lights: every light pixel carries a
 * fractional ramp level, so intermediate values grow the glow from the cores outward
 * and 1 steps every light exactly one ramp level up. No new colours are introduced.
 */

export interface BannerOpts { red?: number; green?: number }
export interface IndexedPixels { w: number; h: number; data: Uint8Array }

export const BANNER_W = 320;
export const BANNER_H = 102;

const W = BANNER_W;
const H = BANNER_H;
const T = 255;

type Mask = (x: number, y: number) => boolean;
/** kind: 0 face, 1 lit edge, -1 shadow edge, 2 neutral (diagonal) edge; d = 1 outermost. */
type Shade = (kind: number, d: number, x: number, y: number) => number;

let buf = new Uint8Array(W * H);
let redAmt = 0;
let grnAmt = 0;

// Key light from the upper left (mostly from above).
const LX = -0.55;
const LY = -0.83;

// ---------------------------------------------------------------- raster helpers

function set(x: number, y: number, c: number): void {
  if (x < 0 || y < 0 || x >= W || y >= H) return;
  buf[y * W + x] = c;
}

function get(x: number, y: number): number {
  if (x < 0 || y < 0 || x >= W || y >= H) return T;
  return buf[y * W + x];
}

function rect(x0: number, y0: number, w: number, h: number, c: number): void {
  for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) set(x, y, c);
}

function hline(x0: number, x1: number, y: number, c: number): void {
  for (let x = x0; x <= x1; x++) set(x, y, c);
}

function vline(x: number, y0: number, y1: number, c: number): void {
  for (let y = y0; y <= y1; y++) set(x, y, c);
}

// Light ramps. A light pixel is given as a fractional level; the pulse adds to it.
const RED = [0, 11, 17, 18, 19, 20, 27];
const GRN = [0, 21, 22, 23, 24, 25, 27];

function red(level: number): number {
  return RED[Math.max(0, Math.min(RED.length - 1, Math.floor(level + redAmt + 1e-6)))];
}

function grn(level: number): number {
  return GRN[Math.max(0, Math.min(GRN.length - 1, Math.floor(level + grnAmt + 1e-6)))];
}

// ---------------------------------------------------------------- shapes

/** Polygon mask; vertices on pixel edges, pixel centres are tested. */
function poly(pts: number[]): Mask {
  const n = pts.length / 2;
  return (x, y) => {
    const px = x + 0.5;
    const py = y + 0.5;
    let inside = false;
    for (let i = 0, j = n - 1; i < n; j = i++) {
      const xi = pts[2 * i];
      const yi = pts[2 * i + 1];
      const xj = pts[2 * j];
      const yj = pts[2 * j + 1];
      if (yi > py !== yj > py && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) inside = !inside;
    }
    return inside;
  };
}

function bbox(pts: number[]): [number, number, number, number] {
  let x0 = 1e9;
  let y0 = 1e9;
  let x1 = -1e9;
  let y1 = -1e9;
  for (let i = 0; i < pts.length; i += 2) {
    x0 = Math.min(x0, pts[i]);
    x1 = Math.max(x1, pts[i]);
    y0 = Math.min(y0, pts[i + 1]);
    y1 = Math.max(y1, pts[i + 1]);
  }
  return [Math.floor(x0), Math.floor(y0), Math.ceil(x1), Math.ceil(y1)];
}

/**
 * Bevel fill: every pixel of the mask gets its distance to the outside (Chebyshev) and
 * an outward normal estimated from the outside pixels around it; edges facing the key
 * light are lit, edges facing away are shaded. `inset` flips it for recesses.
 */
function bevel(m: Mask, box: [number, number, number, number], depth: number, shade: Shade, inset = false, thr = 0.3): void {
  const R = depth + 1;
  const [x0, y0, x1, y1] = box;
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      if (!m(x, y)) continue;
      let d = 99;
      let nx = 0;
      let ny = 0;
      for (let oy = -R; oy <= R; oy++) {
        for (let ox = -R; ox <= R; ox++) {
          if (!ox && !oy) continue;
          if (m(x + ox, y + oy)) continue;
          const cd = Math.max(Math.abs(ox), Math.abs(oy));
          if (cd < d) d = cd;
          const w = 1 / (ox * ox + oy * oy);
          nx += ox * w;
          ny += oy * w;
        }
      }
      if (d > depth) {
        set(x, y, shade(0, 0, x, y));
        continue;
      }
      const len = Math.hypot(nx, ny) || 1;
      let lit = (nx * LX + ny * LY) / len;
      if (inset) lit = -lit;
      set(x, y, shade(lit > thr ? 1 : lit < -thr ? -1 : 2, d, x, y));
    }
  }
}

/** Paints pixels outside the mask that touch it (8-neighbourhood) — outlines and halos. */
function ring(m: Mask, box: [number, number, number, number], c: (x: number, y: number) => number, grow = 1, only?: (x: number, y: number) => boolean): void {
  const [x0, y0, x1, y1] = box;
  const out: number[] = [];
  for (let y = y0 - grow; y <= y1 + grow; y++) {
    for (let x = x0 - grow; x <= x1 + grow; x++) {
      if (m(x, y)) continue;
      let near = false;
      for (let oy = -grow; oy <= grow && !near; oy++) for (let ox = -grow; ox <= grow && !near; ox++) if (m(x + ox, y + oy)) near = true;
      if (near && (!only || only(x, y))) out.push(x, y);
    }
  }
  for (let i = 0; i < out.length; i += 2) set(out[i], out[i + 1], c(out[i], out[i + 1]));
}

function grid(w: number, h: number, ox: number, oy: number, bits: Uint8Array): Mask {
  return (x, y) => {
    const lx = x - ox;
    const ly = y - oy;
    return lx >= 0 && ly >= 0 && lx < w && ly < h && bits[ly * w + lx] === 1;
  };
}

// ---------------------------------------------------------------- fonts

/** Game font (3×5), the glyphs used on the banner; I and '.' are narrowed here. */
const SMALL: Record<string, string> = {
  A: '.#.|#.#|###|#.#|#.#',
  B: '##.|#.#|##.|#.#|##.',
  C: '.##|#..|#..|#..|.##',
  E: '###|#..|##.|#..|###',
  G: '.##|#..|#.#|#.#|.##',
  H: '#.#|#.#|###|#.#|#.#',
  I: '#|#|#|#|#',
  K: '#.#|#.#|##.|#.#|#.#',
  L: '#..|#..|#..|#..|###',
  M: '#.#|###|###|#.#|#.#',
  N: '##.|#.#|#.#|#.#|#.#',
  O: '.#.|#.#|#.#|#.#|.#.',
  P: '##.|#.#|##.|#..|#..',
  R: '##.|#.#|##.|#.#|#.#',
  S: '.##|#..|.#.|..#|##.',
  T: '###|.#.|.#.|.#.|.#.',
  U: '#.#|#.#|#.#|#.#|###',
  V: '#.#|#.#|#.#|#.#|.#.',
  Z: '###|..#|.#.|#..|###',
  Ä: '#.#|.#.|#.#|###|#.#',
  '.': '.|.|.|.|#',
  ' ': '.|.|.|.|.',
};

/** Bold 5×7 for "DIE", "DIE ÜBERGABE" and "7C" (Ü has its dots two rows above). */
const MID: Record<string, string> = {
  D: '####.|##.##|##.##|##.##|##.##|##.##|####.',
  I: '##|##|##|##|##|##|##',
  E: '#####|##...|##...|####.|##...|##...|#####',
  B: '####.|##.##|##.##|####.|##.##|##.##|####.',
  R: '####.|##.##|##.##|####.|##.#.|##.##|##.##',
  G: '.####|##...|##...|##.##|##.##|##.##|.####',
  A: '.###.|##.##|##.##|#####|##.##|##.##|##.##',
  Ü: '##.##|##.##|##.##|##.##|##.##|##.##|.###.',
  C: '.####|##...|##...|##...|##...|##...|.####',
  '7': '#####|...##|..##.|..##.|.##..|.##..|.##..',
  ' ': '..|..|..|..|..|..|..',
};

/** Title font: bold condensed capitals, 16 rows, 3 px stems, chamfered corners. */
const BIG: Record<string, string[]> = {
  K: [
    '###...###', '###...###', '###..###.', '###..###.', '###.###..', '###.###..', '######...', '#####....',
    '#####....', '######...', '###.###..', '###.###..', '###..###.', '###..###.', '###...###', '###...###',
  ],
  A: [
    '.#######.', '#########', '#########', '###...###', '###...###', '###...###', '###...###', '###...###',
    '#########', '#########', '#########', '###...###', '###...###', '###...###', '###...###', '###...###',
  ],
  L: [
    '###.....', '###.....', '###.....', '###.....', '###.....', '###.....', '###.....', '###.....',
    '###.....', '###.....', '###.....', '###.....', '###.....', '########', '########', '########',
  ],
  I: ['###', '###', '###', '###', '###', '###', '###', '###', '###', '###', '###', '###', '###', '###', '###', '###'],
  B: [
    '########.', '#########', '#########', '###...###', '###...###', '###...###', '########.', '#######..',
    '########.', '###...###', '###...###', '###...###', '###...###', '#########', '#########', '########.',
  ],
  R: [
    '########.', '#########', '#########', '###...###', '###...###', '###...###', '#########', '########.',
    '#######..', '###.###..', '###..###.', '###..###.', '###...###', '###...###', '###...###', '###...###',
  ],
  E: [
    '########', '########', '########', '###.....', '###.....', '###.....', '#######.', '#######.',
    '#######.', '###.....', '###.....', '###.....', '###.....', '########', '########', '########',
  ],
  U: [
    '###...###', '###...###', '###...###', '###...###', '###...###', '###...###', '###...###', '###...###',
    '###...###', '###...###', '###...###', '###...###', '###...###', '#########', '#########', '.#######.',
  ],
  N: [
    '#####..###', '#####..###', '#####..###', '###.##.###', '###.##.###', '###.##.###', '###.##.###', '###.##.###',
    '###..#####', '###..#####', '###..#####', '###..#####', '###...####', '###...####', '###...####', '###...####',
  ],
  G: [
    '.#######.', '#########', '#########', '###...###', '###......', '###......', '###......', '###..####',
    '###..####', '###...###', '###...###', '###...###', '###...###', '#########', '#########', '.#######.',
  ],
  S: [
    '.#######.', '#########', '#########', '###...###', '###......', '###......', '########.', '#########',
    '.########', '......###', '......###', '......###', '###...###', '#########', '#########', '.#######.',
  ],
};

interface Glyph { w: number; h: number; bits: Uint8Array }

function parse(rows: string[]): Glyph {
  const h = rows.length;
  const w = rows[0].length;
  const bits = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) bits[y * w + x] = rows[y][x] === '#' ? 1 : 0;
  return { w, h, bits };
}

const SMALL_G = new Map<string, Glyph>();
for (const k of Object.keys(SMALL)) SMALL_G.set(k, parse(SMALL[k].split('|')));
const MID_G = new Map<string, Glyph>();
for (const k of Object.keys(MID)) MID_G.set(k, parse(MID[k].split('|')));
const BIG_G = new Map<string, Glyph>();
for (const k of Object.keys(BIG)) BIG_G.set(k, parse(BIG[k]));

/** Lays out text into a 0/1 bitmap; returns it with its width. */
function layout(s: string, font: Map<string, Glyph>, track: number, space: number): Glyph {
  const gs = [...s].map((ch) => font.get(ch) ?? null);
  const h = [...font.values()][0].h;
  let w = 0;
  gs.forEach((g, i) => {
    w += g ? g.w : space;
    if (i < gs.length - 1) w += track;
  });
  const bits = new Uint8Array(w * h);
  let cx = 0;
  gs.forEach((g, i) => {
    if (g) {
      for (let y = 0; y < g.h; y++) for (let x = 0; x < g.w; x++) if (g.bits[y * g.w + x]) bits[y * w + cx + x] = 1;
      cx += g.w;
    } else cx += space;
    if (i < gs.length - 1) cx += track;
  });
  return { w, h, bits };
}

function smallText(s: string, x: number, y: number, c: number, track = 1, space = 3): number {
  const g = layout(s, SMALL_G, track, space);
  for (let ly = 0; ly < g.h; ly++) for (let lx = 0; lx < g.w; lx++) if (g.bits[ly * g.w + lx]) set(x + lx, y + ly, c);
  return g.w;
}

function smallWidth(s: string, track = 1, space = 3): number {
  return layout(s, SMALL_G, track, space).w;
}

/** Bold mid text: white upper half, light steel lower half, hard drop shadow. */
function midText(s: string, x: number, y: number, track: number, space: number, top = 27, bottom = 10, shadow = 0): number {
  const g = layout(s, MID_G, track, space);
  const m = grid(g.w, g.h, x, y, g.bits);
  for (let ly = 0; ly < g.h; ly++) for (let lx = 0; lx < g.w; lx++) {
    if (!g.bits[ly * g.w + lx]) continue;
    if (!m(x + lx + 1, y + ly + 1)) set(x + lx + 1, y + ly + 1, shadow);
  }
  for (let ly = 0; ly < g.h; ly++) for (let lx = 0; lx < g.w; lx++) {
    if (g.bits[ly * g.w + lx]) set(x + lx, y + ly, ly < 3 ? top : bottom);
  }
  // Umlaut dots two rows above Ü.
  let cx = x;
  for (const ch of s) {
    const gl = MID_G.get(ch);
    if (ch === 'Ü') {
      for (const ox of [0, 1, 3, 4]) {
        set(cx + ox, y - 2, top);
        if (ox === 1 || ox === 4) set(cx + ox + 1, y - 1, shadow);
      }
      set(cx + 1, y - 1, shadow);
      set(cx + 4, y - 1, shadow);
    }
    cx += (gl ? gl.w : space) + track;
  }
  return g.w;
}

// ---------------------------------------------------------------- steel shaders

/** Generic raised steel: lit/shadow/neutral colours per bevel depth plus a face. */
function steel(lit: number[], sh: number[], md: number[], face: (x: number, y: number) => number): Shade {
  return (k, d, x, y) => (k === 0 ? face(x, y) : k === 1 ? lit[d - 1] : k === -1 ? sh[d - 1] : md[d - 1] ?? face(x, y));
}

// ---------------------------------------------------------------- frame parts

const BODY = [66, 9, 292, 9, 318, 35, 318, 70, 286, 102, 40, 102, 40, 84, 66, 84];
const INNER = [70, 12, 291, 12, 308, 29, 308, 72, 282, 98, 70, 98];

function leftBracket(): void {
  const pts = [28, 16, 8, 16, 2, 22, 2, 68, 8, 74, 28, 74];
  bevel(poly(pts), bbox(pts), 2, steel([9, 7], [2, 3], [6, 5], (_x, y) => (y < 30 ? 6 : 5)));
  // Red indicator slots in a dark recess.
  rect(3, 38, 6, 16, 0);
  vline(3, 38, 53, 1);
  hline(3, 8, 53, 6);
  for (let i = 0; i < 4; i++) {
    const y = 40 + i * 4;
    set(4, y, red(2.3));
    set(5, y, red(3.6));
    set(6, y, red(3.6));
    set(7, y, red(2.3));
    set(5, y + 1, red(1.2));
    set(6, y + 1, red(1.2));
  }
}

function body(): void {
  const m = poly(BODY);
  bevel(m, bbox(BODY), 3, steel([9, 10, 8], [1, 3, 4], [5, 7, 6], () => 6));
  // Dark gunmetal inner field, recessed.
  const mi = poly(INNER);
  bevel(mi, bbox(INNER), 1, steel([1], [7], [3], (_x, y) => (y < 60 ? 3 : 3)), true);
}

function topTab(): void {
  const pts = [158, 10, 165, 2, 213, 2, 220, 10];
  bevel(poly(pts), bbox(pts), 2, steel([10, 9], [3, 5], [7, 7], (_x, y) => (y < 5 ? 8 : 7)));
  // Long slot.
  const slot = [171, 4, 207, 4, 207, 8, 171, 8];
  bevel(poly(slot), bbox(slot), 1, steel([1], [8], [2], () => 0), true);
  // Bolts.
  for (const bx of [167, 210]) {
    set(bx, 5, 10);
    set(bx, 6, 4);
  }
}

function coil(): void {
  // Cable from the tab into a little spring coil, then a pipe bending down into the frame.
  hline(219, 223, 6, 6);
  hline(219, 223, 7, 3);
  for (let i = 0; i < 6; i++) {
    const x = 224 + i * 2;
    set(x, 3, 6);
    set(x, 4, 10);
    set(x, 5, 9);
    set(x, 6, 8);
    set(x, 7, 6);
    set(x, 8, 3);
    set(x + 1, 4, 2);
    set(x + 1, 5, 3);
    set(x + 1, 6, 4);
    set(x + 1, 7, 2);
  }
  hline(236, 241, 5, 9);
  hline(236, 241, 6, 5);
  set(242, 5, 8);
  set(242, 6, 6);
  set(243, 6, 7);
  set(242, 7, 6);
  set(243, 7, 4);
  set(242, 8, 6);
  set(243, 8, 3);
}

function lamp(x: number, y: number, w: number, isRed: boolean): void {
  // Housing (dark lens bezel) with steel end caps; lens rows y+1..y+3.
  const L = isRed ? red : grn;
  hline(x + 1, x + w - 2, y, 1);
  hline(x + 1, x + w - 2, y + 4, 4);
  for (let r = 1; r <= 3; r++) {
    set(x, y + r, r === 1 ? 10 : r === 2 ? 8 : 5);
    set(x + w - 1, y + r, r === 1 ? 9 : r === 2 ? 7 : 4);
  }
  for (let lx = x + 1; lx <= x + w - 2; lx++) {
    const edge = lx === x + 1 || lx === x + w - 2;
    set(lx, y + 1, L(edge ? 2.2 : 3.3));
    set(lx, y + 2, L(edge ? 3.2 : lx === x + 2 || lx === x + w - 3 ? 3.8 : 4.6));
    set(lx, y + 3, L(edge ? 1.6 : 2.6));
  }
}

function taglinePlate(): void {
  const pts = [96, 12, 291, 12, 299, 20, 96, 20];
  bevel(poly(pts), bbox(pts), 1, steel([10], [5], [8], (_x, y) => (y < 14 ? 10 : y < 18 ? 9 : 8)));
  lamp(100, 13, 11, true);
  lamp(272, 13, 11, false);
  const s = 'TESTEN. MESSEN. VERBESSERN.';
  const w = smallWidth(s, 2, 4);
  const x0 = 191 - (w >> 1);
  smallText(s, x0, 14, 3, 2, 4);
  hline(114, x0 - 4, 16, 5);
  hline(x0 + w + 3, 268, 16, 5);
}

const WELL = [84, 23, 293, 23, 306, 36, 306, 57, 303, 60, 84, 60];

function well(): void {
  const m = poly(WELL);
  bevel(m, bbox(WELL), 1, steel([6], [0], [1], (_x, y) => (y < 26 ? 1 : y < 56 ? 2 : 3)), true);
  // Separator under "DIE": steel lines with a green triangle marker in the middle.
  hline(120, 184, 29, 5);
  hline(120, 184, 30, 2);
  hline(200, 300, 29, 5);
  hline(200, 300, 30, 2);
  // Down-pointing triangle in a steel V.
  for (let r = 0; r < 8; r++) {
    const half = 7 - r;
    for (let dx = -half; dx <= half; dx++) {
      const x = 192 + dx;
      const y = 23 + r;
      const edge = Math.abs(dx) >= half - 1;
      if (edge) set(x, y, dx < 0 ? 9 : 6);
      else set(x, y, grn(r < 3 ? 4.5 : 3.4));
    }
  }
  set(192, 31, 6);
  // Up-pointing small triangle under the title.
  for (let r = 0; r < 3; r++) for (let dx = -r; dx <= r; dx++) set(192 + dx, 57 + r, grn(r === 0 ? 4.5 : 3.5 - Math.abs(dx) * 0.5));
}

function titleText(): void {
  const g = layout('KALIBRIERUNGSANLAGE', BIG_G, 1, 4);
  const x0 = 101;
  const y0 = 37;
  const m = grid(g.w, g.h, x0, y0, g.bits);
  const box: [number, number, number, number] = [x0, y0, x0 + g.w - 1, y0 + g.h - 1];
  // Drop shadow then outline.
  const sh = grid(g.w, g.h, x0 + 1, y0 + 1, g.bits);
  ring(sh, [x0 + 1, y0 + 1, x0 + g.w, y0 + g.h], () => 0, 1, (x, y) => !m(x, y));
  ring(m, box, () => 0);
  bevel(m, box, 1, (k, _d, _x, y) => {
    const ty = y - y0;
    if (k === 1) return ty < 8 ? 27 : 10;
    if (k === -1) return ty < 8 ? 7 : 6;
    return ty < 6 ? 10 : ty < 11 ? 9 : 8;
  });
}

function numeral(): void {
  // Roman III with continuous serif bars: 25×24, three 5 px stems with 3 px gaps.
  const rows: string[] = [];
  for (let y = 0; y < 24; y++) {
    if (y < 3 || y > 20) rows.push('#'.repeat(25));
    else rows.push('..#####...#####...#####..');
  }
  const x0 = 280;
  const y0 = 32;
  const g = parse(rows);
  const m = grid(g.w, g.h, x0, y0, g.bits);
  const box: [number, number, number, number] = [x0, y0, x0 + g.w - 1, y0 + g.h - 1];
  ring(m, box, () => grn(2.4), 2, (x, y) => get(x, y) <= 3);
  ring(m, box, () => grn(3.4), 1);
  bevel(m, box, 1, (k, _d, _x, y) => {
    const ty = y - y0;
    if (k === 1) return ty < 12 ? 27 : 10;
    if (k === -1) return grn(2.6);
    return ty < 8 ? 10 : ty < 15 ? 9 : 8;
  });
}

function subtitlePlate(): void {
  const pts = [130, 63, 254, 63, 263, 72, 263, 73, 254, 82, 130, 82, 121, 73, 121, 72];
  bevel(poly(pts), bbox(pts), 3, steel([10, 9, 1], [5, 6, 1], [8, 7, 1], (_x, y) => (y < 66 ? 4 : y < 72 ? 3 : 2)));
  const s = 'DIE ÜBERGABE';
  const w = layout(s, MID_G, 3, 6).w;
  midText(s, 192 - (w >> 1), 69, 3, 6);
  // Screws at both ends.
  for (const sx of [131, 253]) {
    set(sx, 71, 9);
    set(sx - 1, 72, 9);
    set(sx, 72, 1);
    set(sx + 1, 72, 6);
    set(sx, 73, 6);
  }
}

function chevronLight(side: number): void {
  // Arrow-shaped steel housing pointing outward with a green bar light inside.
  const cx = side < 0 ? 0 : 384;
  const f = (x: number) => (side < 0 ? x : cx - x);
  const raw = [99, 72, 108, 63, 119, 63, 119, 82, 108, 82, 99, 73];
  const pts: number[] = [];
  for (let i = 0; i < raw.length; i += 2) pts.push(f(raw[i]), raw[i + 1]);
  bevel(poly(pts), bbox(pts), 2, steel([9, 7], [2, 4], [6, 5], () => 5));
  // Light slot.
  for (let x = 103; x <= 116; x++) {
    const tip = x === 103;
    const X = side < 0 ? x : cx - x;
    set(X, 71, tip ? 1 : 0);
    set(X, 72, tip ? 1 : 0);
    set(X, 73, tip ? 1 : 0);
  }
  for (let x = 104; x <= 115; x++) {
    const X = side < 0 ? x : cx - x;
    const end = x === 104 || x === 115;
    set(X, 71, x === 104 ? 0 : grn(end ? 2.3 : 3.3));
    set(X, 72, grn(end ? 3.2 : 4.6));
    set(X, 73, x === 104 ? 0 : grn(end ? 1.6 : 2.6));
  }
}

function bottomStrip(): void {
  const pts = [104, 87, 251, 87, 251, 96, 100, 96];
  bevel(poly(pts), bbox(pts), 1, steel([10], [4], [7], (_x, y) => (y < 90 ? 9 : 8)));
  const s = 'EINRICHTUNG ZUR PRÄZISIONSKALIBRIERUNG';
  const w = smallWidth(s, 1, 3);
  const x0 = 176 - (w >> 1);
  smallText(s, x0, 89, 3, 1, 3);
  set(x0 - 4, 91, 4);
  set(x0 + w + 3, 91, 4);
}

function badge(): void {
  const pts = [255, 84, 279, 84, 280, 85, 280, 99, 279, 100, 255, 100, 254, 99, 254, 85];
  bevel(poly(pts), bbox(pts), 1, steel([9], [3], [6], () => 2));
  smallText('SEKTOR', 256, 86, 9, 1, 3);
  midText('7C', 261, 92, 1, 3, 27, 10, 0);
}

function vents(): void {
  // Left: green-lit slanted vents next to the medallion; right: dark vents.
  for (let i = 0; i < 4; i++) {
    for (let r = 0; r < 8; r++) {
      const y = 88 + r;
      const x = 85 + i * 4 + ((7 - r) >> 1);
      set(x, y, grn(r < 2 ? 1.5 : 2.5));
      set(x + 1, y, r === 7 ? 6 : 1);
    }
  }
  for (let i = 0; i < 3; i++) {
    for (let r = 0; r < 8; r++) {
      const y = 88 + r;
      const x = 283 + i * 4 + ((7 - r) >> 1);
      set(x, y, 0);
      set(x + 1, y, r === 0 ? 1 : 2);
    }
  }
}

function rightBracket(): void {
  // Hinge block at the top-right chamfer and bolts down the side.
  for (const by of [42, 62]) {
    set(313, by, 10);
    set(312, by + 1, 9);
    set(313, by + 1, 3);
    set(314, by + 1, 4);
    set(313, by + 2, 2);
  }
  vline(311, 46, 58, 2);
  vline(312, 46, 58, 8);
}

// ---------------------------------------------------------------- medallion

const MX = 54;
const MY = 48;
const DEG = Math.PI / 180;

function angDist(a: number, b: number): number {
  let d = Math.abs(a - b) % 360;
  return d > 180 ? 360 - d : d;
}

function inArc(a: number, from: number, to: number): boolean {
  return from <= to ? a >= from && a <= to : a >= from || a <= to;
}

function medallion(): void {
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < 112; x++) {
      const dx = x - MX;
      const dy = y - MY;
      const r = Math.hypot(dx, dy);
      if (r > 44.5) continue;
      let a = Math.atan2(-dy, dx) / DEG;
      if (a < 0) a += 360;
      const ux = r ? dx / r : 0;
      const uy = r ? dy / r : 0;
      const ld = ux * LX + uy * LY; // outward radial direction vs light
      const conic = Math.cos(2 * (a - 135) * DEG);
      let c: number;
      if (r > 43.5) c = 0;
      else if (r > 37.5) {
        const t = r - 37.5;
        if (t > 5) c = ld > 0.45 ? 10 : ld > 0 ? 9 : ld > -0.5 ? 6 : 4;
        else if (t <= 1) c = ld < -0.45 ? 9 : ld < 0 ? 7 : ld < 0.5 ? 4 : 2;
        else {
          const v = 0.5 + 0.32 * conic + 0.22 * ld;
          c = v > 0.85 ? 10 : v > 0.66 ? 9 : v > 0.47 ? 8 : v > 0.3 ? 7 : 6;
        }
      } else if (r > 36.5) c = 1;
      else if (r > 32.5) {
        const t = r - 32.5;
        if (t > 3) c = ld > 0.3 ? 7 : ld > -0.3 ? 5 : 3;
        else if (t <= 1) c = ld < -0.3 ? 8 : ld < 0.3 ? 5 : 2;
        else c = conic > 0.3 ? 6 : 5;
        // Segment seams on the inner ring.
        for (const s of [45, 135, 225, 315]) if (angDist(a, s) < 0.9) c = 2;
      } else {
        c = interior(x, y, r, a, dx);
      }
      set(x, y, c);
    }
  }
  innerRingLights();
  press();
}

function interior(x: number, y: number, r: number, a: number, dx: number): number {
  const left = dx < 0;
  // Arc light segments (3 px band just inside the inner ring).
  const segs: [number, number, number][] = [
    [100, 166, 1], [196, 252, 0.55],
    [14, 80, 1], [288, 344, 0.55],
  ];
  for (const [from, to, k] of segs) {
    if (!inArc(a, from, to)) continue;
    const isRed = from >= 90 && from < 270;
    const LL = isRed ? red : grn;
    if (r > 28.5) {
      const core = Math.abs(r - 30) < 0.5;
      const end = angDist(a, from) < 2 || angDist(a, to) < 2;
      if (k === 1) return LL(core && !end ? 4.6 : end ? 2.5 : 3.4);
      return LL(core && !end ? 3.5 : 2.2);
    }
    if (r > 27.5) return LL(k === 1 ? 1.6 : 1.2);
  }
  // Faint scale rings and ticks.
  if (Math.abs(r - 24) < 0.5) {
    const tick = Math.round(a / 7.5);
    if (Math.abs(a - tick * 7.5) < 1.6 && tick % 2 === 0) return left ? 12 : 22;
  }
  if (Math.abs(r - 17.5) < 0.5 && Math.floor(a / 6) % 2 === 0) return left ? 11 : 21;
  // Backdrop: void with a tinted glow toward the arcs.
  const glow = Math.max(0, (r - 18) / 10);
  if (glow > 0.5) return left ? 11 : 21;
  return glow > 0.15 && ((x + y) & 1) === 0 ? (left ? 11 : 21) : 0;
}

function innerRingLights(): void {
  // Small window lights in the inner ring at 180° (red), 0° and 270° (green).
  const win = (x0: number, y0: number, w: number, h: number, L: (l: number) => number): void => {
    rect(x0 - 1, y0 - 1, w + 2, h + 2, 0);
    for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) {
      const core = (w > 2 ? x > x0 && x < x0 + w - 1 : true) && (h > 2 ? y > y0 && y < y0 + h - 1 : true);
      set(x, y, L(core ? 4.4 : 3.2));
    }
  };
  win(MX - 36 + 1, MY - 1, 3, 3, red);
  win(MX + 34, MY - 1, 3, 3, grn);
  win(MX - 1, MY + 34, 3, 2, grn);
  // Extra red pip lower left, as on the reference.
  win(MX - 33, MY + 8, 2, 2, red);
}

function cyl(x0: number, w: number, y0: number, h: number, profile: number[], top = true, bottom = true): void {
  for (let y = y0; y < y0 + h; y++) {
    for (let i = 0; i < w; i++) {
      const p = profile[Math.min(profile.length - 1, Math.floor((i / w) * profile.length))];
      let c = p;
      if (top && y === y0) c = Math.min(27, p >= 9 ? 27 : p + 2);
      if (bottom && y === y0 + h - 1) c = Math.max(1, p - 3);
      set(x0 + i, y, c);
    }
  }
}

function press(): void {
  const PROF = [6, 8, 9, 10, 10, 9, 8, 7, 6, 5, 4];
  // Piston housing through the top of the bezel.
  rect(49, 1, 11, 10, 0);
  cyl(50, 9, 2, 8, PROF);
  hline(50, 58, 5, 3);
  // Collar 1.
  rect(48, 11, 13, 1, 0);
  cyl(49, 11, 11, 4, PROF);
  // Neck.
  cyl(52, 5, 15, 2, [8, 10, 8, 6, 4], false, false);
  // Collar 2 with the engraved III.
  rect(47, 17, 15, 8, 0);
  cyl(48, 13, 17, 7, PROF);
  for (const yy of [19, 22]) hline(52, 56, yy, 2);
  for (const xx of [52, 54, 56]) vline(xx, 20, 21, 2);
  // Rod down to the sphere.
  for (let y = 24; y < 40; y++) {
    set(52, y, 0);
    set(53, y, 10);
    set(54, y, 8);
    set(55, y, 5);
    set(56, y, 0);
  }
  vline(54, 40, 41, 9);
  set(53, 40, 0);
  set(55, 40, 0);

  // Holder: side arms around the sphere down to the base.
  const arm = (side: number): void => {
    const X = (o: number) => MX + side * o;
    const lit = side < 0 ? 9 : 6;
    const dark = side < 0 ? 6 : 4;
    // Top shoulders from the rod outward.
    for (let i = 0; i < 4; i++) set(X(3 + i), 34 + (i >> 1), lit);
    for (let i = 0; i < 4; i++) set(X(3 + i), 35 + (i >> 1), dark);
    // Vertical arm around the sphere.
    for (let y = 36; y < 58; y++) {
      const o = y < 38 ? 7 + (y - 36) : y < 55 ? 9 : 9 - (y - 54);
      set(X(o), y, lit);
      set(X(o + 1), y, dark);
      set(X(o + 2), y, 0);
      set(X(o - 1), y, get(X(o - 1), y) === 255 ? 0 : get(X(o - 1), y));
    }
    // Lower stem walls.
    for (let y = 58; y < 63; y++) {
      set(X(5), y, lit);
      set(X(6), y, dark);
    }
  };
  arm(-1);
  arm(1);

  // Base platform: elliptical top face with a green target, steel side.
  const bx = MX;
  const by = 65;
  for (let y = 60; y < 74; y++) {
    for (let x = bx - 19; x <= bx + 19; x++) {
      const ex = (x - bx) / 18.5;
      const top = ex * ex + ((y - by) / 4.5) ** 2;
      const bot = ex * ex + ((y - (by + 3)) / 4.5) ** 2;
      if (top <= 1) {
        const tr = Math.hypot((x - bx) / 2.6, y - by);
        let c = top > 0.72 ? (y < by ? 9 : 7) : 6;
        if (Math.abs(tr - 3.6) < 0.5) c = grn(3.3);
        else if (Math.abs(tr - 2) < 0.45) c = grn(2.4);
        else if (tr < 1.2) c = grn(4.6);
        else if (tr < 5.5) c = 21;
        set(x, y, c);
      } else if (bot <= 1) {
        const u = (x - bx) / 18.5;
        const c = u < -0.6 ? 8 : u < -0.1 ? 7 : u < 0.4 ? 5 : 4;
        set(x, y, bot > 0.8 && y > by + 3 ? 2 : c);
      }
    }
  }
  // Green beam from the sphere down to the target.
  for (let y = 55; y < 65; y++) {
    set(MX, y, grn(y < 58 ? 4.5 : 3.7));
    if (get(MX - 1, y) <= 1 || get(MX - 1, y) === 21) set(MX - 1, y, grn(1.5));
    if (get(MX + 1, y) <= 1 || get(MX + 1, y) === 21) set(MX + 1, y, grn(1.5));
  }

  // Crosshair and arrows.
  for (let x = MX - 30; x <= MX + 30; x++) {
    if (Math.abs(x - MX) < 8) continue;
    const c = get(x, MY);
    if (c === 0 || c === 1 || c === 11 || c === 21 || c === 12 || c === 22) set(x, MY, x < MX ? red(1.7) : grn(1.7));
  }
  const arrow = (side: number): void => {
    const L = side < 0 ? red : grn;
    const tip = MX + side * 8;
    for (let o = 1; o <= 16; o++) set(tip + side * o, MY, L(o < 5 ? 4.4 : o < 12 ? 3.4 : 2.4));
    set(tip, MY, L(4.7));
    for (let k = 1; k <= 2; k++) {
      set(tip + side * k, MY - k, L(3.6));
      set(tip + side * k, MY + k, L(3.6));
      if (k === 2) {
        set(tip + side * 1, MY - 1, L(4.5));
        set(tip + side * 1, MY + 1, L(4.5));
      }
    }
  };

  // Chrome sphere.
  for (let y = MY - 7; y <= MY + 7; y++) {
    for (let x = MX - 7; x <= MX + 7; x++) {
      const dx = (x - MX) / 6.5;
      const dy = (y - MY) / 6.5;
      const rr = dx * dx + dy * dy;
      if (rr > 1) {
        if (rr <= 1.33) set(x, y, 0);
        continue;
      }
      let c: number;
      if (dy < -0.15) c = dy < -0.6 ? 10 : 9;
      else if (dy < 0.2) c = 5;
      else c = dy < 0.6 ? 7 : 6;
      if (rr > 0.62) c = dx < 0 ? red(dy < 0.3 ? 3.3 : 2.4) : grn(dy < 0.3 ? 3.3 : 2.4);
      set(x, y, c);
    }
  }
  set(MX - 3, MY - 3, 27);
  set(MX - 2, MY - 3, 27);
  set(MX - 3, MY - 2, 27);
  vline(MX, MY - 6, MY - 3, 4);
  arrow(-1);
  arrow(1);
}

// ---------------------------------------------------------------- assembly

function draw(): void {
  buf.fill(T);
  leftBracket();
  body();
  topTab();
  coil();
  taglinePlate();
  well();
  titleText();
  numeral();
  chevronLight(-1);
  chevronLight(1);
  subtitlePlate();
  bottomStrip();
  badge();
  vents();
  rightBracket();
  medallion();
}

export function bannerPixels(opts: BannerOpts = {}): IndexedPixels {
  redAmt = Math.max(0, Math.min(1, opts.red ?? 0));
  grnAmt = Math.max(0, Math.min(1, opts.green ?? 0));
  buf = new Uint8Array(W * H);
  draw();
  return { w: W, h: H, data: buf };
}
