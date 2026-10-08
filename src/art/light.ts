/**
 * Baked lighting. A LightingState is a list of point/spot lights plus ambient light.
 * `shade` turns a G-buffer Surface into palette indices: it sums Lambert-lit light
 * contributions, applies shadows from occluder boxes, then quantises onto the
 * material ramp with Bayer dithering. Where coloured light dominates, pixels are
 * dithered over onto that light's ramp – the speckled CRT glow of the prototype.
 */

import type { SortBox } from '../core/depthSort';
import { bayer, quantize, quantizeFlat } from './dither';
import { MATERIALS } from './materials';
import { RAMP } from './palette';
import type { Surface } from './surface';

export type Hue = 'neutral' | 'green' | 'amber' | 'red' | 'cold';

export interface Light {
  x: number;
  y: number;
  z: number;
  radius: number;
  intensity: number;
  hue: Hue;
  /** Spotlight: direction (normalised) and cosine cone limits. */
  spot?: { dx: number; dy: number; dz: number; inner: number; outer: number };
  shadows?: boolean;
  /** Half-Lambert wrap (0 = hard, 1 = very soft). */
  wrap?: number;
}

export interface Occluder extends SortBox {
  id: number;
}

export interface LightingState {
  id: string;
  ambient: number;
  lights: Light[];
  occluders: Occluder[];
  /** Global strength of coloured tint takeover. */
  tintGain?: number;
}

const HUE_INDEX: Record<Hue, number> = { neutral: 0, green: 1, amber: 2, red: 3, cold: 4 };
const HUE_RAMPS: ReadonlyArray<ReadonlyArray<number> | null> = [null, RAMP.green, RAMP.amber, RAMP.red, RAMP.cold];

const hueAcc = new Float32Array(5);

/** Total light arriving at a point, ignoring orientation. Used for sprites (player). */
export function lightLevelAt(state: LightingState, x: number, y: number, z: number): { level: number; hue: Hue; hueShare: number } {
  let total = state.ambient;
  hueAcc.fill(0);
  for (const L of state.lights) {
    const dx = L.x - x;
    const dy = L.y - y;
    const dz = L.z - z;
    const d = Math.hypot(dx, dy, dz);
    if (d >= L.radius) continue;
    let a = 1 - d / L.radius;
    a = a * a * (3 - 2 * a);
    if (L.spot) {
      const c = -(dx * L.spot.dx + dy * L.spot.dy + dz * L.spot.dz) / (d || 1);
      a *= coneFactor(c, L.spot.inner, L.spot.outer);
    }
    if (L.shadows && occluded(state.occluders, x, y, z, L.x, L.y, L.z, -1)) a *= 0.25;
    const c = L.intensity * a * 0.8;
    total += c;
    hueAcc[HUE_INDEX[L.hue]] += c;
  }
  let best = 0;
  let bi = 0;
  for (let h = 1; h < 5; h++) if (hueAcc[h] > best) (best = hueAcc[h]), (bi = h);
  const hue = (Object.keys(HUE_INDEX) as Hue[])[bi];
  return { level: total, hue, hueShare: total > 0 ? best / total : 0 };
}

function coneFactor(c: number, inner: number, outer: number): number {
  if (c <= outer) return 0;
  if (c >= inner) return 1;
  const t = (c - outer) / (inner - outer);
  return t * t * (3 - 2 * t);
}

/** Segment–box test (slab method) for shadows. */
function occluded(occ: Occluder[], px: number, py: number, pz: number, lx: number, ly: number, lz: number, ownId: number): boolean {
  const dx = lx - px;
  const dy = ly - py;
  const dz = lz - pz;
  for (let k = 0; k < occ.length; k++) {
    const b = occ[k];
    if (b.id === ownId) continue;
    let t0 = 0.002;
    let t1 = 0.998;
    // x slab
    if (Math.abs(dx) < 1e-9) {
      if (px < b.x0 || px > b.x1) continue;
    } else {
      let ta = (b.x0 - px) / dx;
      let tb = (b.x1 - px) / dx;
      if (ta > tb) [ta, tb] = [tb, ta];
      if (ta > t0) t0 = ta;
      if (tb < t1) t1 = tb;
      if (t0 > t1) continue;
    }
    if (Math.abs(dy) < 1e-9) {
      if (py < b.y0 || py > b.y1) continue;
    } else {
      let ta = (b.y0 - py) / dy;
      let tb = (b.y1 - py) / dy;
      if (ta > tb) [ta, tb] = [tb, ta];
      if (ta > t0) t0 = ta;
      if (tb < t1) t1 = tb;
      if (t0 > t1) continue;
    }
    if (Math.abs(dz) < 1e-9) {
      if (pz < b.z0 || pz > b.z1) continue;
    } else {
      let ta = (b.z0 - pz) / dz;
      let tb = (b.z1 - pz) / dz;
      if (ta > tb) [ta, tb] = [tb, ta];
      if (ta > t0) t0 = ta;
      if (tb < t1) t1 = tb;
      if (t0 > t1) continue;
    }
    return true;
  }
  return false;
}

/** Converts a G-buffer into palette indices (255 = transparent) for one lighting state. */
export function shade(surf: Surface, state: LightingState): Uint8Array {
  const out = new Uint8Array(surf.w * surf.h).fill(255);
  const lights = state.lights;
  const tintGain = state.tintGain ?? 1.6;
  for (let py = 0; py < surf.h; py++) {
    for (let px = 0; px < surf.w; px++) {
      const i = py * surf.w + px;
      const m = surf.mat[i];
      if (!m) continue;
      const sx = surf.ox + px;
      const sy = surf.oy + py;
      const e = surf.emi[i];
      if (e >= 0) {
        out[i] = e;
        continue;
      }
      const mat = MATERIALS[m];
      const X = surf.pos[i * 3];
      const Y = surf.pos[i * 3 + 1];
      const Z = surf.pos[i * 3 + 2];
      const nx = surf.nrm[i * 3];
      const ny = surf.nrm[i * 3 + 1];
      const nz = surf.nrm[i * 3 + 2];
      let total = state.ambient * (0.75 + 0.25 * nz) + (mat.glow ?? 0);
      hueAcc.fill(0);
      for (let k = 0; k < lights.length; k++) {
        const L = lights[k];
        const dx = L.x - X;
        const dy = L.y - Y;
        const dz = L.z - Z;
        const d2 = dx * dx + dy * dy + dz * dz;
        if (d2 >= L.radius * L.radius) continue;
        const d = Math.sqrt(d2) || 1;
        let a = 1 - d / L.radius;
        a = a * a * (3 - 2 * a);
        const wrap = L.wrap ?? 0.25;
        let ndl = (dx * nx + dy * ny + dz * nz) / d;
        ndl = (ndl + wrap) / (1 + wrap);
        if (ndl <= 0) continue;
        a *= ndl;
        if (L.spot) a *= coneFactor(-(dx * L.spot.dx + dy * L.spot.dy + dz * L.spot.dz) / d, L.spot.inner, L.spot.outer);
        if (a <= 0.0005) continue;
        if (L.shadows && occluded(state.occluders, X + nx * 0.75, Y + ny * 0.75, Z + nz * 0.75, L.x, L.y, L.z, surf.owner[i])) {
          a *= 0.12;
        }
        const c = L.intensity * a;
        total += c;
        hueAcc[HUE_INDEX[L.hue]] += c;
      }
      const v = surf.alb[i] * total;
      let ramp = mat.ramp;
      if (mat.tint > 0 && total > 0) {
        let best = 0;
        let bi = 0;
        for (let h = 1; h < 5; h++) if (hueAcc[h] > best) (best = hueAcc[h]), (bi = h);
        if (bi > 0) {
          const share = best / total;
          const ramped = Math.min(1, Math.max(0, (share - 0.3) / 0.45));
          const strength = Math.min(1, ramped * mat.tint * tintGain * 0.7 * Math.min(1, best * 1.8));
          if (strength > bayer(sx + 3, sy + 5)) ramp = HUE_RAMPS[bi]!;
        }
      }
      out[i] = mat.flat ? quantizeFlat(v, ramp) : quantize(v, ramp, sx, sy);
    }
  }
  return out;
}

/** Indices → RGBA canvas. */
export function indicesToCanvas(idx: Uint8Array, w: number, h: number, palette: Uint32Array): HTMLCanvasElement {
  const cv = document.createElement('canvas');
  cv.width = w;
  cv.height = h;
  const ctx = cv.getContext('2d')!;
  const img = ctx.createImageData(w, h);
  const u32 = new Uint32Array(img.data.buffer);
  for (let i = 0; i < idx.length; i++) {
    const c = idx[i];
    u32[i] = c === 255 ? 0 : palette[c];
  }
  ctx.putImageData(img, 0, 0);
  return cv;
}
