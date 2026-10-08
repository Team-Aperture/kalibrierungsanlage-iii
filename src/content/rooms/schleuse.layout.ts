/**
 * Spatial layout of Location 2 – "Hinter der Schleuse": an observation catwalk
 * along the back wall of a deep machine hall. The catwalk runs along x; the hall
 * (pit) lies in front of it on the +y side, its floor far below.
 */

import type { Box3 } from './wartungszelle.layout';

export const SL = {
  L: 320,
  /** Catwalk width (y 0…W). */
  Wd: 40,
  H: 96,
  /** Pit: y Wd…PY, floor at z = −PD. */
  PY: 200,
  PD: 96,
  entrance: { y0: 10, y1: 32, h: 44 },
  railing: [0, 38, 0, 320, 41, 13] as Box3,
  gate: [176, 0, 0, 184, 38, 46] as Box3,
  gateBox: [128, 0, 14, 140, 7, 34] as Box3,
  locker: [56, 0, 0, 76, 12, 46] as Box3,
  clipboard: [86, 0, 24, 96, 2, 38] as Box3,
  sensor: [104, 0, 58, 112, 6, 64] as Box3,
  terminal: [252, 0, 0, 284, 20, 40] as Box3,
  door2: { x0: 292, x1: 318, open0: 296, open1: 314, openH: 42 },
  door2Box: [292, -2, 0, 318, 5, 50] as Box3,
  crates: [204, 0, 0, 222, 14, 18] as Box3,
  columns: [
    [92, 52, -96, 102, 62, 118],
    [212, 52, -96, 222, 62, 118],
  ] as Box3[],
  gantry: [92, 52, 104, 222, 62, 112] as Box3,
  fan: { cx: 64, cz: -50, r: 30 },
  pistons: [118, 178, 238] as number[],
  pistonY: 92,
  tanks: { y: 160, z: -80, r: 14, x0: 12, x1: 108 },
  lamps: [40, 140, 240] as number[],
  spawn: { x: 12, y: 21 },
} as const;
