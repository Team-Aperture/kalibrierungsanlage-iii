/**
 * Palette-safe effects for brand rasters: ramp stepping (brighten / dim without
 * leaving the locked palette), the CRT boot reveal used by monitors, and scanlines.
 * All functions work on indexed pixels (palette indices, 255 = transparent).
 */

import { C } from '../palette';

export interface IndexedPixels {
  w: number;
  h: number;
  data: Uint8Array;
}

const T = 255;

/** One ramp step brighter / darker for every palette index (stays on its own ramp). */
export const UP = new Uint8Array(256).fill(T);
export const DOWN = new Uint8Array(256).fill(T);
{
  const chains: number[][] = [
    [C.VOID, C.S1, C.S2, C.S3, C.S4, C.S5, C.S6, C.S7, C.S8, C.S9, C.S10, C.WHITE],
    [C.VOID, C.BR0, C.BR1, C.BR2, C.BR3, C.BR4, C.OCHRE, C.AMBER, C.PEACH, C.WHITE],
    [C.VOID, C.BR0, C.RED_D, C.RED, C.SALMON, C.PEACH, C.WHITE],
    [C.VOID, C.G0, C.G1, C.G2, C.MINT, C.CYAN, C.WHITE],
  ];
  for (const ch of chains) {
    for (let i = 0; i < ch.length; i++) {
      const c = ch[i];
      // Earlier chains win for shared entries (void, brown-black, white).
      if (UP[c] === T) UP[c] = ch[Math.min(ch.length - 1, i + 1)];
      if (DOWN[c] === T) DOWN[c] = ch[Math.max(0, i - 1)];
    }
  }
}

export function stepped(c: number, steps: number): number {
  if (c === T) return T;
  let v = c;
  if (steps > 0) for (let i = 0; i < steps; i++) v = UP[v];
  else for (let i = 0; i < -steps; i++) v = DOWN[v];
  return v;
}

export function blank(w: number, h: number): IndexedPixels {
  return { w, h, data: new Uint8Array(w * h).fill(T) };
}

/** Copies `src` into `dst` at (x, y), skipping transparent pixels. */
export function blit(dst: IndexedPixels, src: IndexedPixels, x: number, y: number, map?: (c: number, sx: number, sy: number) => number): void {
  for (let sy = 0; sy < src.h; sy++) {
    const dy = y + sy;
    if (dy < 0 || dy >= dst.h) continue;
    for (let sx = 0; sx < src.w; sx++) {
      const dx = x + sx;
      if (dx < 0 || dx >= dst.w) continue;
      let c = src.data[sy * src.w + sx];
      if (c === T) continue;
      if (map) c = map(c, sx, sy);
      if (c !== T) dst.data[dy * dst.w + dx] = c;
    }
  }
}

/** Cheap deterministic hash for flicker noise. */
function hash(a: number, b: number): number {
  let h = (a * 374761393 + b * 668265263) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/**
 * CRT power-on reveal of a raster, `p` from 0 (off) to 1 (settled):
 * a beam line opens from the centre, the picture rolls open over-exposed, a scan bar
 * passes once, then one short flicker. Transparent pixels stay transparent except for
 * the beam itself.
 */
export function bootFrame(src: IndexedPixels, p: number, seed = 1): IndexedPixels {
  const { w, h } = src;
  if (p >= 1) return src;
  const out = blank(w, h);
  if (p <= 0) return out;
  const cy = Math.floor(h / 2);
  if (p < 0.14) {
    // Phase 1: horizontal beam line widening from the centre.
    const half = Math.max(1, Math.round((p / 0.14) * (w / 2)));
    for (let x = Math.floor(w / 2) - half; x < Math.ceil(w / 2) + half; x++) {
      if (x < 0 || x >= w) continue;
      const edge = Math.abs(x - w / 2) > half - 2;
      out.data[cy * w + x] = edge ? C.CYAN : C.WHITE;
    }
    return out;
  }
  if (p < 0.42) {
    // Phase 2: the picture rolls open vertically, over-exposed, with jittering rows.
    const k = (p - 0.14) / 0.28;
    const open = Math.max(1, k * (h / 2 + 1));
    for (let y = 0; y < h; y++) {
      const d = Math.abs(y - cy);
      if (d > open) continue;
      const jitter = hash(y, Math.floor(p * 60) + seed) < 0.18 ? 1 : 0;
      for (let x = 0; x < w; x++) {
        const c = src.data[y * w + Math.min(w - 1, x + jitter)];
        if (c === T) continue;
        out.data[y * w + x] = stepped(c, d > open - 1.5 ? 3 : 2 - Math.round(k));
      }
    }
    return out;
  }
  if (p < 0.78) {
    // Phase 3: full picture; one bright scan bar travels down, rows below it still dim.
    const bar = Math.floor(((p - 0.42) / 0.36) * (h + 2)) - 1;
    for (let y = 0; y < h; y++) {
      const steps = y === bar ? 2 : y === bar - 1 ? 1 : y > bar ? -1 : 0;
      for (let x = 0; x < w; x++) {
        const c = src.data[y * w + x];
        if (c !== T) out.data[y * w + x] = stepped(c, steps);
      }
    }
    return out;
  }
  // Phase 4: a single short dip, then settle.
  const dip = p > 0.84 && p < 0.89;
  for (let i = 0; i < w * h; i++) {
    const c = src.data[i];
    if (c !== T) out.data[i] = dip ? DOWN[c] : c;
  }
  return out;
}

/** Darkens every second row by one ramp step (CRT scanlines in palette space). */
export function scanlines(src: IndexedPixels, phase = 1): IndexedPixels {
  const out = { w: src.w, h: src.h, data: src.data.slice() };
  for (let y = phase; y < src.h; y += 2) {
    for (let x = 0; x < src.w; x++) {
      const i = y * src.w + x;
      if (out.data[i] !== T) out.data[i] = DOWN[out.data[i]];
    }
  }
  return out;
}
