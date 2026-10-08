/**
 * Overlay art generated from baked G-buffers: animated screens, glowing slots and
 * indicator lamps are drawn exactly over the pixels of the surface they belong to,
 * so they stay in perspective and inherit the object's occlusion.
 */

import type { Vec3 } from '../core/projection';
import { bayer } from './dither';
import { PALETTE_U32 } from './palette';
import type { Surface } from './surface';

function canvasOf(w: number, h: number): { cv: HTMLCanvasElement; img: ImageData; u32: Uint32Array; ctx: CanvasRenderingContext2D } {
  const cv = document.createElement('canvas');
  cv.width = w;
  cv.height = h;
  const ctx = cv.getContext('2d')!;
  const img = ctx.createImageData(w, h);
  return { cv, img, u32: new Uint32Array(img.data.buffer), ctx };
}

/** Maps the pixels of a planar face of a surface to a small face raster. */
export class FaceMapper {
  private readonly src: Int32Array;
  private readonly dst: Int32Array;
  readonly count: number;

  constructor(
    readonly surf: Surface,
    O: Vec3,
    U: Vec3,
    V: Vec3,
    readonly fw: number,
    readonly fh: number,
    filter?: (mat: number) => boolean,
  ) {
    const uu = U.x * U.x + U.y * U.y + U.z * U.z;
    const vv = V.x * V.x + V.y * V.y + V.z * V.z;
    const src: number[] = [];
    const dst: number[] = [];
    for (let i = 0; i < surf.w * surf.h; i++) {
      const m = surf.mat[i];
      if (!m || (filter && !filter(m))) continue;
      const px = surf.pos[i * 3] - O.x;
      const py = surf.pos[i * 3 + 1] - O.y;
      const pz = surf.pos[i * 3 + 2] - O.z;
      const a = (px * U.x + py * U.y + pz * U.z) / uu;
      const b = (px * V.x + py * V.y + pz * V.z) / vv;
      if (a < -0.02 || a > 1.02 || b < -0.02 || b > 1.02) continue;
      const ex = px - a * U.x - b * V.x;
      const ey = py - a * U.y - b * V.y;
      const ez = pz - a * U.z - b * V.z;
      if (ex * ex + ey * ey + ez * ez > 0.5) continue;
      const fx = Math.min(fw - 1, Math.max(0, Math.floor(a * fw)));
      const fy = Math.min(fh - 1, Math.max(0, fh - 1 - Math.floor(b * fh)));
      src.push(i);
      dst.push(fy * fw + fx);
    }
    this.src = Int32Array.from(src);
    this.dst = Int32Array.from(dst);
    this.count = src.length;
  }

  private img: ImageData | null = null;

  /** Renders a face raster (palette indices, 255 = transparent) into a surface-sized canvas context. */
  renderInto(ctx: CanvasRenderingContext2D, face: Uint8Array): void {
    if (!this.img) this.img = ctx.createImageData(this.surf.w, this.surf.h);
    const u32 = new Uint32Array(this.img.data.buffer);
    u32.fill(0);
    for (let k = 0; k < this.count; k++) {
      const c = face[this.dst[k]];
      if (c !== 255) u32[this.src[k]] = PALETTE_U32[c];
    }
    ctx.putImageData(this.img, 0, 0);
  }

  render(face: Uint8Array): HTMLCanvasElement {
    const { cv, ctx } = canvasOf(this.surf.w, this.surf.h);
    this.renderInto(ctx, face);
    return cv;
  }
}

/**
 * Builds an overlay from the surface pixels accepted by `pick`, coloured by `color`
 * (return a palette index or 255 to skip). Coordinates passed are absolute screen
 * pixels and world positions.
 */
export function maskOverlay(
  surf: Surface,
  pick: (mat: number, x: number, y: number, z: number) => boolean,
  color: (px: number, py: number, x: number, y: number, z: number) => number,
): HTMLCanvasElement {
  const { cv, img, u32, ctx } = canvasOf(surf.w, surf.h);
  for (let py = 0; py < surf.h; py++) {
    for (let px = 0; px < surf.w; px++) {
      const i = py * surf.w + px;
      const m = surf.mat[i];
      if (!m) continue;
      const x = surf.pos[i * 3];
      const y = surf.pos[i * 3 + 1];
      const z = surf.pos[i * 3 + 2];
      if (!pick(m, x, y, z)) continue;
      const c = color(surf.ox + px, surf.oy + py, x, y, z);
      if (c !== 255) u32[i] = PALETTE_U32[c];
    }
  }
  ctx.putImageData(img, 0, 0);
  return cv;
}

/**
 * Volumetric light cone below a hanging lamp, as a dithered additive overlay.
 * Returns the canvas and the screen position of its top-left pixel.
 */
export function lightCone(
  lx: number,
  ly: number,
  lz: number,
  floorRadius: number,
  colors: [number, number, number],
  strength = 0.55,
): { cv: HTMLCanvasElement; ox: number; oy: number } {
  const sx0 = lx - ly;
  const sy0 = (lx + ly) / 2 - lz;
  const h = lz;
  const rx = floorRadius * Math.SQRT2;
  const ry = rx / 2;
  const ox = Math.floor(sx0 - rx - 2);
  const oy = Math.floor(sy0);
  const w = Math.ceil(rx * 2 + 4);
  const hh = Math.ceil(h + ry + 2);
  const { cv, img, u32, ctx } = canvasOf(w, hh);
  for (let y = 0; y < hh; y++) {
    for (let x = 0; x < w; x++) {
      const px = ox + x + 0.5;
      const py = oy + y + 0.5;
      const t = (py - sy0) / h;
      if (t <= 0.02) continue;
      const halfW = rx * Math.min(1, t);
      const dx = Math.abs(px - sx0);
      let d: number;
      if (t <= 1) {
        if (dx > halfW) continue;
        d = Math.pow(1 - dx / halfW, 0.8) * (0.35 + 0.65 * (1 - t)) * Math.min(1, t * 6);
      } else {
        // Below the floor line: the far half of the floor ellipse.
        const ey = (py - (sy0 + h)) / ry;
        const ex = dx / rx;
        const e = ex * ex + ey * ey;
        if (e > 1) continue;
        d = (1 - e) * 0.3;
      }
      d *= strength;
      const b = bayer(ox + x, oy + y);
      let c = -1;
      if (d > b + 0.55) c = colors[2];
      else if (d > b * 0.9 + 0.22) c = colors[1];
      else if (d > b * 0.75) c = colors[0];
      if (c >= 0) u32[y * w + x] = PALETTE_U32[c];
    }
  }
  ctx.putImageData(img, 0, 0);
  return { cv, ox, oy };
}

/** Soft dithered disc used for darkness "holes" (veil) and glows. */
export function ditherDisc(radius: number, color: number, levels = 1): HTMLCanvasElement {
  const size = radius * 2;
  const { cv, img, u32, ctx } = canvasOf(size, size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const d = Math.hypot(x + 0.5 - radius, y + 0.5 - radius) / radius;
      if (d >= 1) continue;
      const v = (1 - d) * levels;
      if (v > bayer(x, y) * 0.999) u32[y * size + x] = PALETTE_U32[color];
    }
  }
  ctx.putImageData(img, 0, 0);
  return cv;
}

/** 1-pixel canvas of a palette colour (particles, markers). */
export function pixelTexture(color: number, w = 1, h = 1): HTMLCanvasElement {
  const { cv, img, u32, ctx } = canvasOf(w, h);
  u32.fill(PALETTE_U32[color]);
  ctx.putImageData(img, 0, 0);
  return cv;
}
