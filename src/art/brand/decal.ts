/**
 * The emblem as part of baked world art: painted on walls and machine casings in
 * face space (so it shears with the surface like real paint), lit by the room, with
 * optional paint wear and luminous (emissive) arcs and eyes.
 */

import { fbm } from '../../core/rng';
import { M } from '../materials';
import { C, RAMP } from '../palette';
import type { Frag } from '../surface';
import { DOWN } from './fx';
import { emblem, type EmblemVariant } from './index';

export interface DecalOpts {
  variant: EmblemVariant;
  /** Face coordinates of the decal's top-left pixel. */
  u0: number;
  vTop: number;
  /** 0…1: share of paint worn away (wall shows through). */
  wear?: number;
  seed?: number;
  /** Luminous paint: the bright red and green pixels glow (one step dimmer) in the dark. */
  glow?: boolean;
  /** Mirror horizontally (for faces whose u runs right-to-left on screen). */
  flip?: boolean;
}

const RED = new Set<number>([C.RED_D, C.RED, C.SALMON]);
const GREEN = new Set<number>([C.G0, C.G1, C.G2, C.MINT, C.CYAN]);
const WARM = new Set<number>([C.PEACH, C.AMBER, C.WHITE]);
const GLOWS = new Set<number>([C.RED, C.SALMON, C.MINT, C.CYAN, C.PEACH, C.WHITE]);

const posIn = (ramp: ReadonlyArray<number>, c: number) => Math.max(0, ramp.indexOf(c));

// Shaders run per fragment: keep the resting rasters at hand without a cache lookup.
const resting = new Map<EmblemVariant, ReturnType<typeof emblem>>();
function still(v: EmblemVariant) {
  let px = resting.get(v);
  if (!px) resting.set(v, (px = emblem(v)));
  return px;
}

/** Paints the emblem pixel under the fragment. Returns true if the fragment was painted. */
export function emblemDecal(f: Frag, o: DecalOpts): boolean {
  const px = still(o.variant);
  let cx = Math.floor(f.u - o.u0);
  const cy = Math.floor(o.vTop - f.v);
  if (cx < 0 || cy < 0 || cx >= px.w || cy >= px.h) return false;
  if (o.flip) cx = px.w - 1 - cx;
  const c = px.data[cy * px.w + cx];
  if (c === 255) return false;
  if (o.wear && fbm(f.u * 0.21, f.v * 0.21, o.seed ?? 77, 3) < o.wear) return false;
  if (RED.has(c)) {
    f.mat = M.RED_PAINT;
    f.alb = (posIn(RAMP.red, c) + 0.6) / RAMP.red.length;
  } else if (GREEN.has(c)) {
    f.mat = M.GREEN_PAINT;
    f.alb = (posIn(RAMP.green, c) + 0.6) / RAMP.green.length;
  } else if (WARM.has(c)) {
    f.mat = M.PAPER;
    f.alb = 0.95;
  } else if (c >= C.BR0 && c <= C.OCHRE) {
    f.mat = M.RUST;
    f.alb = (posIn(RAMP.rust, c) + 0.6) / RAMP.rust.length;
  } else {
    f.mat = M.STEEL_FLAT;
    f.alb = 0.06 + (c / 10) * 0.9;
  }
  if (o.glow && GLOWS.has(c)) f.emi = DOWN[c];
  return true;
}
