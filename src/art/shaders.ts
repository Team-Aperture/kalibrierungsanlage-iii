/**
 * Reusable surface "shader" building blocks for industrial materials. They modify
 * the albedo/material of a fragment in face space; objects compose them.
 */

import { fbm, hash2, valueNoise } from '../core/rng';
import { faceTextPixel } from './font';
import { M } from './materials';
import { FACE, type Frag } from './surface';

/** Is u within `width` of a multiple of `period` (starting at `offset`)? */
export function seam(u: number, period: number, width = 1, offset = 0): boolean {
  const m = (((u - offset) % period) + period) % period;
  return m < width;
}

/** 1 px bevel highlights on the camera-facing edges of a box face. */
export function bevel(f: Frag, amount = 0.22): void {
  if (f.tag === FACE.TOP) {
    if (f.u > f.w - 1 || f.v > f.h - 1) f.alb += amount;
    else if (f.u < 1 || f.v < 1) f.alb += amount * 0.5;
  } else if (f.tag === FACE.LEFT) {
    if (f.u > f.w - 1) f.alb += amount * 0.7;
    if (f.v > f.h - 1) f.alb += amount * 0.4;
    if (f.v < 1) f.alb -= 0.15;
  } else if (f.tag === FACE.RIGHT) {
    if (f.u < 1) f.alb += amount * 0.7;
    if (f.v > f.h - 1) f.alb += amount * 0.4;
    if (f.v < 1) f.alb -= 0.15;
  }
}

/** Brushed / weathered steel base. */
export function steel(f: Frag, base = 0.62, seed = 1): void {
  f.mat = M.STEEL;
  const brushed = fbm(f.u * 0.12, f.v * 0.9 + seed * 13, seed, 2);
  f.alb = base + (brushed - 0.5) * 0.12;
}

/** Dark painted machinery. */
export function darkPaint(f: Frag, base = 0.5, seed = 2): void {
  f.mat = M.STEEL_DARK;
  f.alb = base + (fbm(f.u * 0.2, f.v * 0.2, seed, 2) - 0.5) * 0.1;
}

/**
 * Rust streaks running downwards from sources at height `top` – structured, not random:
 * streak columns come from a stable hash of the column, intensity grows towards the
 * source and is shaped by noise.
 */
export function rustStreaks(f: Frag, top: number, density = 0.2, seed = 5): void {
  const col = Math.floor(f.u);
  const h = hash2(col, 0, seed);
  if (h > density) return;
  const len = 5 + hash2(col, 1, seed) * 18;
  const dv = top - f.v;
  if (dv < 0 || dv > len) return;
  const t = 1 - dv / len;
  const n = valueNoise(f.u * 0.5, f.v * 0.18, seed);
  if (t * (0.55 + n * 0.6) > 0.42) {
    f.mat = M.RUST;
    f.alb = 0.4 + t * 0.3;
  }
}

/** Dirt / grime accumulation near the bottom of a wall face. */
export function grime(f: Frag, height = 14, seed = 7): void {
  if (f.v > height) return;
  const t = 1 - f.v / height;
  const n = fbm(f.u * 0.18, f.v * 0.3, seed, 3);
  f.alb *= 1 - t * 0.45 * (0.5 + n);
}

/** Rivet rows along a seam: bright head, dark shadow below. */
export function rivets(f: Frag, uSeam: number, period: number, offset: number): void {
  const du = f.u - uSeam;
  if (du < -1.5 || du > 1.5) return;
  const m = (((f.v - offset) % period) + period) % period;
  if (m < 1 && Math.abs(du) < 1) f.alb += 0.3;
  else if (m >= 1 && m < 2 && Math.abs(du) < 1) f.alb -= 0.2;
}

/** Hazard stripes (amber / black), diagonal in face space, with paint wear. */
export function hazard(f: Frag, period = 6, seed = 11): void {
  const s = (((f.u + f.v) % period) + period) % period < period / 2;
  const wear = fbm(f.u * 0.3, f.v * 0.3, seed, 2);
  if (wear > 0.68) {
    f.mat = M.STEEL;
    f.alb = 0.45;
    return;
  }
  f.mat = M.HAZARD;
  f.alb = s ? 0.92 : 0.18;
}

/** Stencilled text on a wall face. Returns true if the pixel belongs to a glyph. */
export function stencil(f: Frag, text: string, u0: number, vTop: number): boolean {
  const slope = f.tag === FACE.RIGHT ? -1 : 1;
  return faceTextPixel(text, f.u, f.v, u0, vTop, slope);
}

/** Horizontal slots / vents. */
export function vent(f: Frag, u0: number, v0: number, w: number, h: number, pitch = 2): boolean {
  if (f.u < u0 || f.u > u0 + w || f.v < v0 || f.v > v0 + h) return false;
  const inner = f.u > u0 + 1 && f.u < u0 + w - 1 && f.v > v0 + 0.5 && f.v < v0 + h - 0.5;
  if (!inner) {
    f.alb -= 0.12;
    return true;
  }
  const slot = Math.floor(f.v - v0) % pitch === 0;
  f.alb = slot ? 0.1 : f.alb - 0.05;
  return true;
}

/** Rectangle test in face space. */
export function inRect(f: Frag, u0: number, v0: number, w: number, h: number): boolean {
  return f.u >= u0 && f.u < u0 + w && f.v >= v0 && f.v < v0 + h;
}
