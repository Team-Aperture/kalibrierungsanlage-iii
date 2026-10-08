/**
 * Spatial layout of Location 1 – "Die Wartungszelle" (world units, 16 wu = 1 tile).
 * Shared by the art generator (geometry, shadows) and the gameplay layer
 * (collision, interaction points). x runs down-right on screen, y down-left.
 */

export type Box3 = [x0: number, y0: number, z0: number, x1: number, y1: number, z1: number];

export const WZ = {
  W: 192,
  D: 160,
  H: 72,
  /** Wall vertical zones. */
  kick: 5,
  band0: 50,
  band1: 58,
  terminal: [24, 0, 0, 58, 20, 42] as Box3,
  panel: [72, 0, 10, 104, 9, 52] as Box3,
  door: { x0: 120, x1: 164, open0: 127, open1: 157, openH: 46, lintel: 56 },
  doorBox: [120, -4, 0, 164, 7, 58] as Box3,
  shelf: [0, 22, 0, 15, 62, 42] as Box3,
  fan: [0, 92, 22, 5, 118, 46] as Box3,
  machine: [74, 58, 0, 118, 102, 66] as Box3,
  transformer: [156, 84, 0, 188, 118, 58] as Box3,
  bench: [0, 124, 0, 20, 156, 21] as Box3,
  crates: [166, 6, 0, 190, 32, 28] as Box3,
  tally: [0, 128, 24, 2, 154, 46] as Box3,
  /** Wall columns (solid, baked into the background). */
  columnsLeft: [[0, 66, 0, 4, 72, 72]] as Box3[],
  columnsRight: [[62, 0, 0, 68, 4, 72], [110, 0, 0, 116, 4, 72]] as Box3[],
  /** Hanging lamp (fixture centre, bottom of the shade). */
  lampA: { x: 64, y: 136, z: 90 },
  /** Wall floodlights (powered only): right wall above the crates, left wall above the fan. */
  lampB: [176, 0, 60, 188, 5, 65] as Box3,
  lampC: [0, 76, 60, 5, 88, 65] as Box3,
  grate: [40, 132, 56, 148] as const,
  spawn: { x: 54, y: 118 },
} as const;
