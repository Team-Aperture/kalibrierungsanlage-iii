/**
 * Team_Aperture / KA-III logo system.
 *
 * One source of truth for every logo in the game, all generated as palette-indexed
 * pixel art (no image files):
 *
 *   emblem 'full'    95 px  Team_Aperture emblem, boot splash
 *   emblem 'simple'  47 px  menu marks, the hall mural, ending credit
 *   emblem 'screen'  31 px  CRT / monitor version (boot reveal, scanlines)
 *   emblem 'badge'   15 px  favicon, HUD, stickers, tiny in-world monitors
 *   banner                  the KA-III game logo ("DIE ÜBERGABE" banner), see
 *                           ui/brandBanner.ts (kept out of the boot bundle)
 *
 * Animation is driven by `brandPulse(ms)`: the red and green halves breathe in turns
 * and the high-five sparks briefly whenever the two meet in the middle. Values are
 * quantised so rasters can be cached and redrawn only when they change.
 */

import { PALETTE_U32 } from '../palette';
import { emblemPixels, type EmblemVariant } from './emblem';
import { blank, bootFrame, type IndexedPixels } from './fx';

export type { EmblemVariant, IndexedPixels };
export { bootFrame, scanlines, stepped, blit, blank } from './fx';

export interface BrandPulse {
  red: number;
  green: number;
  spark: number;
}

/** Number of discrete animation levels per channel (cache granularity). */
const LEVELS = 4;
const q = (v: number) => Math.round(Math.max(0, Math.min(1, v)) * LEVELS) / LEVELS;

/** Breathing period of the red/green halves, in ms. */
export const PULSE_PERIOD = 5200;

/** The resting look used when motion is reduced. */
export const STILL: BrandPulse = { red: 0.25, green: 0.25, spark: 0.25 };

/**
 * Brand light state at time `ms`. Red and green breathe in anti-phase; at every second
 * crossing (once per period) the high-five flares for about half a second.
 */
export function brandPulse(ms: number, still = false): BrandPulse {
  if (still) return STILL;
  const a = ((ms % PULSE_PERIOD) / PULSE_PERIOD) * Math.PI * 2;
  const red = 0.5 + 0.5 * Math.sin(a);
  const green = 0.5 - 0.5 * Math.sin(a);
  // Crossing at a = 0 (red rising): spark envelope with a fast rise and slow decay.
  const tc = ms % PULSE_PERIOD;
  const since = tc < PULSE_PERIOD / 2 ? tc : tc - PULSE_PERIOD;
  const spark = since < 0 ? Math.max(0, 1 + since / 90) : Math.max(0, 1 - since / 520);
  return { red: q(red * 0.85), green: q(green * 0.85), spark: q(spark) };
}

/** Raster sizes per variant (checked against emblemPixels by the unit tests). */
export const EMBLEM_SIZE: Record<EmblemVariant, number> = { full: 95, simple: 47, screen: 31, badge: 15 };

const cache = new Map<string, IndexedPixels>();

export function cached(key: string, make: () => IndexedPixels): IndexedPixels {
  let px = cache.get(key);
  if (!px) {
    px = make();
    if (cache.size > 256) cache.clear();
    cache.set(key, px);
  }
  return px;
}

export function emblem(variant: EmblemVariant, p: BrandPulse = STILL): IndexedPixels {
  const r = q(p.red);
  const g = q(p.green);
  const s = q(p.spark);
  return cached(`e:${variant}:${r}:${g}:${s}`, () => emblemPixels(variant, { red: r, green: g, spark: s }));
}

/** Quantises a pulse channel to the cache levels. */
export const quantise = q;

/** Emblem during a CRT boot: `p` 0…1 (see bootFrame), quantised to 24 frames. */
export function emblemBoot(variant: EmblemVariant, p: number, pulse: BrandPulse = STILL): IndexedPixels {
  if (p >= 1) return emblem(variant, pulse);
  const f = Math.max(0, Math.floor(p * 24));
  // A dark screen needs no emblem yet: the (first-call) geometry build of 'full' is
  // deferred until the reveal actually starts, after the boot screen has painted.
  if (f === 0) return cached(`eb:${variant}:0`, () => blank(EMBLEM_SIZE[variant], EMBLEM_SIZE[variant]));
  return cached(`eb:${variant}:${f}`, () => bootFrame(emblem(variant, STILL), f / 24, 3));
}

/** Writes indexed pixels into a canvas of the same size (creating it if needed). */
export function paint(px: IndexedPixels, cv?: HTMLCanvasElement): HTMLCanvasElement {
  const c = cv ?? document.createElement('canvas');
  if (c.width !== px.w) c.width = px.w;
  if (c.height !== px.h) c.height = px.h;
  const ctx = c.getContext('2d')!;
  const img = ctx.createImageData(px.w, px.h);
  const u32 = new Uint32Array(img.data.buffer);
  for (let i = 0; i < px.data.length; i++) {
    const v = px.data[i];
    u32[i] = v === 255 ? 0 : PALETTE_U32[v];
  }
  ctx.putImageData(img, 0, 0);
  return c;
}
