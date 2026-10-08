/**
 * The locked 28-colour palette of Die Kalibrierungsanlage III.
 *
 * Derived from the render prototype "Zelle 07": a long blue-grey steel ramp, a
 * rust/brown ramp, a sparse red ramp for warnings, a green CRT ramp and amber light.
 * Every pixel the game draws comes from this table; gradients are produced by
 * ordered (Bayer 8×8) dithering across ramps, never by blending.
 */

export const PALETTE_HEX = [
  '#07080d', //  0 void
  '#0c0f17', //  1
  '#121723', //  2
  '#19202e', //  3
  '#212a3b', //  4
  '#2b3549', //  5
  '#374259', //  6
  '#47526a', //  7
  '#5c6780', //  8
  '#77819a', //  9
  '#979fb3', // 10 light steel
  '#261a17', // 11 dark brown
  '#3b281e', // 12
  '#563a24', // 13
  '#74502b', // 14
  '#946833', // 15
  '#b6893f', // 16 ochre
  '#a8343a', // 17 warning red (dark)
  '#f22f2f', // 18 warning red
  '#ff7a6b', // 19 salmon
  '#ffd5c2', // 20 peach
  '#0d1d18', // 21 green black
  '#1a3d30', // 22 dark green
  '#2a7d5c', // 23 green
  '#52d39c', // 24 mint
  '#3cf2e2', // 25 cyan
  '#e9b44c', // 26 amber
  '#f3f1ea', // 27 white
] as const;

export const PALETTE_RGB: ReadonlyArray<readonly [number, number, number]> = PALETTE_HEX.map((h) => {
  const v = parseInt(h.slice(1), 16);
  return [(v >> 16) & 255, (v >> 8) & 255, v & 255] as const;
});

/** 32-bit little-endian ABGR values for fast ImageData writes. */
export const PALETTE_U32 = new Uint32Array(
  PALETTE_RGB.map(([r, g, b]) => ((255 << 24) | (b << 16) | (g << 8) | r) >>> 0),
);

export const C = {
  VOID: 0,
  S1: 1,
  S2: 2,
  S3: 3,
  S4: 4,
  S5: 5,
  S6: 6,
  S7: 7,
  S8: 8,
  S9: 9,
  S10: 10,
  BR0: 11,
  BR1: 12,
  BR2: 13,
  BR3: 14,
  BR4: 15,
  OCHRE: 16,
  RED_D: 17,
  RED: 18,
  SALMON: 19,
  PEACH: 20,
  G0: 21,
  G1: 22,
  G2: 23,
  MINT: 24,
  CYAN: 25,
  AMBER: 26,
  WHITE: 27,
} as const;

/** Ramps are ordered dark → light lists of palette indices. */
export const RAMP = {
  steel: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
  steelDark: [0, 1, 2, 3, 4, 5, 6, 7, 8],
  steelHi: [1, 3, 5, 7, 8, 9, 10, 27],
  rust: [0, 11, 12, 13, 14, 15, 16],
  wood: [0, 11, 12, 13, 14, 15, 16, 26],
  amber: [11, 13, 15, 16, 26, 20, 27],
  hazard: [0, 11, 13, 15, 16, 26],
  red: [0, 11, 17, 18, 19, 20],
  green: [0, 21, 22, 23, 24, 25],
  screen: [21, 22, 23, 24, 25, 27],
  skin: [11, 12, 13, 15, 19, 20],
  cold: [2, 4, 6, 8, 9, 10, 27],
  white: [7, 9, 10, 27],
} as const;

export type RampName = keyof typeof RAMP;

export function hexOf(index: number): string {
  return PALETTE_HEX[index] ?? '#ff00ff';
}

export function rgbNumber(index: number): number {
  const [r, g, b] = PALETTE_RGB[index];
  return (r << 16) | (g << 8) | b;
}
