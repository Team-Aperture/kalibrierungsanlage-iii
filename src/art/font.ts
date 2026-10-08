/**
 * Tiny 3×5 bitmap font for in-world signage and terminal screens (supports ÄÖÜß).
 * Glyphs are upright; on isometric faces each glyph is stepped along the 2:1 slope
 * instead of being sheared, which keeps letters readable at this size.
 */

const RAW: Record<string, string> = {
  A: '.#.|#.#|###|#.#|#.#',
  B: '##.|#.#|##.|#.#|##.',
  C: '.##|#..|#..|#..|.##',
  D: '##.|#.#|#.#|#.#|##.',
  E: '###|#..|##.|#..|###',
  F: '###|#..|##.|#..|#..',
  G: '.##|#..|#.#|#.#|.##',
  H: '#.#|#.#|###|#.#|#.#',
  I: '###|.#.|.#.|.#.|###',
  J: '..#|..#|..#|#.#|.#.',
  K: '#.#|#.#|##.|#.#|#.#',
  L: '#..|#..|#..|#..|###',
  M: '#.#|###|###|#.#|#.#',
  N: '##.|#.#|#.#|#.#|#.#',
  O: '.#.|#.#|#.#|#.#|.#.',
  P: '##.|#.#|##.|#..|#..',
  Q: '.#.|#.#|#.#|##.|.##',
  R: '##.|#.#|##.|#.#|#.#',
  S: '.##|#..|.#.|..#|##.',
  T: '###|.#.|.#.|.#.|.#.',
  U: '#.#|#.#|#.#|#.#|###',
  V: '#.#|#.#|#.#|#.#|.#.',
  W: '#.#|#.#|###|###|#.#',
  X: '#.#|#.#|.#.|#.#|#.#',
  Y: '#.#|#.#|.#.|.#.|.#.',
  Z: '###|..#|.#.|#..|###',
  Ä: '#.#|.#.|#.#|###|#.#',
  Ö: '#.#|.#.|#.#|#.#|.#.',
  Ü: '#.#|...|#.#|#.#|###',
  ß: '##.|#.#|##.|#.#|##.',
  '0': '###|#.#|#.#|#.#|###',
  '1': '.#.|##.|.#.|.#.|###',
  '2': '##.|..#|.#.|#..|###',
  '3': '##.|..#|.#.|..#|##.',
  '4': '#.#|#.#|###|..#|..#',
  '5': '###|#..|##.|..#|##.',
  '6': '.##|#..|###|#.#|###',
  '7': '###|..#|.#.|.#.|.#.',
  '8': '###|#.#|###|#.#|###',
  '9': '###|#.#|###|..#|##.',
  '.': '...|...|...|...|.#.',
  ',': '...|...|...|.#.|#..',
  ':': '...|.#.|...|.#.|...',
  ';': '...|.#.|...|.#.|#..',
  '-': '...|...|###|...|...',
  '+': '...|.#.|###|.#.|...',
  '/': '..#|..#|.#.|#..|#..',
  '%': '#.#|..#|.#.|#..|#.#',
  '!': '.#.|.#.|.#.|...|.#.',
  '?': '##.|..#|.#.|...|.#.',
  '(': '.#.|#..|#..|#..|.#.',
  ')': '.#.|..#|..#|..#|.#.',
  '[': '##.|#..|#..|#..|##.',
  ']': '.##|..#|..#|..#|.##',
  '>': '#..|.#.|..#|.#.|#..',
  '<': '..#|.#.|#..|.#.|..#',
  _: '...|...|...|...|###',
  '=': '...|###|...|###|...',
  '#': '###|###|###|###|###',
  '*': '...|#.#|.#.|#.#|...',
  '"': '#.#|#.#|...|...|...',
  "'": '.#.|.#.|...|...|...',
  '|': '.#.|.#.|.#.|.#.|.#.',
  '·': '...|...|.#.|...|...',
  '°': '.#.|#.#|.#.|...|...',
  '▮': '###|###|###|###|###',
  '▯': '###|#.#|#.#|#.#|###',
  ' ': '...|...|...|...|...',
};

const GLYPHS = new Map<string, Uint8Array>();
for (const [ch, rows] of Object.entries(RAW)) {
  const bits = new Uint8Array(15);
  rows.split('|').forEach((row, y) => {
    for (let x = 0; x < 3; x++) bits[y * 3 + x] = row[x] === '#' ? 1 : 0;
  });
  GLYPHS.set(ch, bits);
}

export const GLYPH_W = 3;
export const GLYPH_H = 5;
export const ADVANCE = 4;

export function glyphBits(ch: string): Uint8Array {
  return GLYPHS.get(ch.toUpperCase()) ?? GLYPHS.get('?')!;
}

export function textWidth(s: string): number {
  return s.length ? s.length * ADVANCE - 1 : 0;
}

/** Is the integer pixel (lx, ly) relative to the text's top-left set? */
export function textPixel(s: string, lx: number, ly: number): boolean {
  if (ly < 0 || ly >= GLYPH_H || lx < 0) return false;
  const gi = Math.floor(lx / ADVANCE);
  if (gi >= s.length) return false;
  const gx = lx - gi * ADVANCE;
  if (gx >= GLYPH_W) return false;
  return glyphBits(s[gi])[ly * GLYPH_W + gx] === 1;
}

/**
 * Text on an isometric wall face. `u`, `v` are the fragment's face coordinates,
 * (u0, vTop) is where the text starts, `slope` is +1 for faces whose u runs
 * down-right on screen (+y faces) and −1 for faces running up-right (+x faces).
 * Each glyph is placed upright, stepped along the slope.
 */
export function faceTextPixel(s: string, u: number, v: number, u0: number, vTop: number, slope: 1 | -1): boolean {
  const du = u - u0;
  if (du < 0) return false;
  const gi = Math.floor(du / ADVANCE);
  if (gi >= s.length) return false;
  const gx = Math.floor(du - gi * ADVANCE);
  if (gx >= GLYPH_W) return false;
  // Rows are measured in screen pixels relative to the glyph's own top-left corner.
  const ly = Math.floor(vTop - v + slope * 0.5 * (du - gi * ADVANCE) + 0.5);
  if (ly < 0 || ly >= GLYPH_H) return false;
  return glyphBits(s[gi])[ly * GLYPH_W + gx] === 1;
}

/** Draws text into an index buffer (screen-aligned), e.g. for terminal screens. */
export function drawText(
  buf: Uint8Array,
  bw: number,
  bh: number,
  s: string,
  x: number,
  y: number,
  color: number,
): void {
  for (let i = 0; i < s.length; i++) {
    const g = glyphBits(s[i]);
    for (let gy = 0; gy < GLYPH_H; gy++) {
      for (let gx = 0; gx < GLYPH_W; gx++) {
        if (!g[gy * GLYPH_W + gx]) continue;
        const px = x + i * ADVANCE + gx;
        const py = y + gy;
        if (px < 0 || py < 0 || px >= bw || py >= bh) continue;
        buf[py * bw + px] = color;
      }
    }
  }
}
