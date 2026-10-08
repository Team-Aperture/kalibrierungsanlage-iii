/**
 * Material table. A material picks the ramp that its lit value is quantised onto,
 * and how strongly coloured light (green CRT glow, amber lamps, red warnings) may
 * take over its pixels.
 */

import { RAMP } from './palette';

export interface Material {
  ramp: ReadonlyArray<number>;
  /** 0…1: susceptibility to coloured light tint. */
  tint: number;
  /** Disable dithering (rounded quantisation) for crisp small details. */
  flat?: boolean;
  /** Extra brightness independent of lights (self-lit paint, e.g. warning labels). */
  glow?: number;
}

export const M = {
  STEEL: 1,
  STEEL_DARK: 2,
  RUST: 3,
  WOOD: 4,
  HAZARD: 5,
  RED_PAINT: 6,
  RUBBER: 7,
  GLASS: 8,
  COPPER: 9,
  CLOTH: 10,
  SKIN: 11,
  PAPER: 12,
  COLD: 13,
  STEEL_FLAT: 14,
  CLOTH_DARK: 15,
  AMBER_FLAT: 16,
  RED_FLAT: 17,
  GREEN_FLAT: 18,
} as const;

export const MATERIALS: Record<number, Material> = {
  [M.STEEL]: { ramp: RAMP.steel, tint: 1 },
  [M.STEEL_DARK]: { ramp: RAMP.steelDark, tint: 0.9 },
  [M.RUST]: { ramp: RAMP.rust, tint: 0.6 },
  [M.WOOD]: { ramp: RAMP.wood, tint: 0.5 },
  [M.HAZARD]: { ramp: RAMP.hazard, tint: 0.35 },
  [M.RED_PAINT]: { ramp: RAMP.red, tint: 0.3 },
  [M.RUBBER]: { ramp: RAMP.steelDark, tint: 0.4 },
  [M.GLASS]: { ramp: RAMP.green, tint: 1 },
  [M.COPPER]: { ramp: RAMP.amber, tint: 0.4 },
  [M.CLOTH]: { ramp: RAMP.rust, tint: 0.5, flat: true },
  [M.SKIN]: { ramp: RAMP.skin, tint: 0.3, flat: true },
  [M.PAPER]: { ramp: RAMP.cold, tint: 0.7 },
  [M.COLD]: { ramp: RAMP.cold, tint: 0.8 },
  [M.STEEL_FLAT]: { ramp: RAMP.steel, tint: 0.6, flat: true },
  [M.CLOTH_DARK]: { ramp: RAMP.steelDark, tint: 0.4, flat: true },
  [M.AMBER_FLAT]: { ramp: RAMP.amber, tint: 0, flat: true },
  [M.RED_FLAT]: { ramp: RAMP.red, tint: 0, flat: true },
  [M.GREEN_FLAT]: { ramp: RAMP.green, tint: 0, flat: true },
};
