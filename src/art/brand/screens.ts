/** The emblem on in-world monitor face rasters (palette indices, 255 = transparent). */

import { brandPulse, emblem, emblemBoot } from './index';

export interface ScreenEmblemOpts {
  /** Scene time in ms (drives the pulse). */
  ms: number;
  /** CRT boot progress 0…1 (omit for a settled picture). */
  boot?: number;
  /** Top-left position; centred by default. */
  x?: number;
  y?: number;
  still?: boolean;
}

/** Draws the badge emblem into a monitor raster of size w × h. */
export function drawScreenEmblem(r: Uint8Array, w: number, h: number, o: ScreenEmblemOpts): void {
  const px = o.boot !== undefined && o.boot < 1 ? emblemBoot('badge', o.boot) : emblem('badge', brandPulse(o.ms, o.still));
  const x0 = o.x ?? Math.floor((w - px.w) / 2);
  const y0 = o.y ?? Math.floor((h - px.h) / 2);
  for (let y = 0; y < px.h; y++) {
    const ry = y0 + y;
    if (ry < 0 || ry >= h) continue;
    for (let x = 0; x < px.w; x++) {
      const rx = x0 + x;
      if (rx < 0 || rx >= w) continue;
      const c = px.data[y * px.w + x];
      if (c !== 255) r[ry * w + rx] = c;
    }
  }
}
