/**
 * Ordered dithering with an 8×8 Bayer matrix: the signature texture of the
 * Kalibrierungsanlage look. Light falloff, rust and dirt are produced by quantising
 * continuous values onto palette ramps with these thresholds.
 */

const BAYER8_RAW = [
  0, 32, 8, 40, 2, 34, 10, 42,
  48, 16, 56, 24, 50, 18, 58, 26,
  12, 44, 4, 36, 14, 46, 6, 38,
  60, 28, 52, 20, 62, 30, 54, 22,
  3, 35, 11, 43, 1, 33, 9, 41,
  51, 19, 59, 27, 49, 17, 57, 25,
  15, 47, 7, 39, 13, 45, 5, 37,
  63, 31, 55, 23, 61, 29, 53, 21,
];

export const BAYER8 = new Float32Array(BAYER8_RAW.map((v) => (v + 0.5) / 64));

/** Threshold in (0, 1) for an integer pixel coordinate. */
export function bayer(x: number, y: number): number {
  return BAYER8[((y & 7) << 3) | (x & 7)];
}

/**
 * Quantises v ∈ [0, 1] onto a ramp using the Bayer threshold at (x, y).
 * Values outside the range clamp to the ramp ends.
 */
export function quantize(v: number, ramp: ReadonlyArray<number>, x: number, y: number): number {
  const n = ramp.length - 1;
  if (v <= 0) return ramp[0];
  if (v >= 1) return ramp[n];
  const p = v * n;
  const i = Math.floor(p);
  const f = p - i;
  return ramp[f > bayer(x, y) ? i + 1 : i];
}

/** Quantise without dithering (rounding) – used for tiny sprites where noise hurts. */
export function quantizeFlat(v: number, ramp: ReadonlyArray<number>): number {
  const n = ramp.length - 1;
  const i = Math.round(Math.max(0, Math.min(1, v)) * n);
  return ramp[i];
}
