/**
 * PUZZLE 01 – "Der Energiepfad" (pure logic, no rendering).
 *
 * A 3×3 grid of conduit segments inside distribution panel V-2. Power enters from
 * the QUELLE on the left of the middle row and must reach the exit on the right of
 * the middle row (feeding Schleuse 0-1).
 *
 * Rules (shown to the player in the panel):
 *  1. Segments conduct only where their openings meet exactly.
 *  2. The welded middle segment cannot be rotated.
 *  3. The burnt segment (bottom middle) must stay dead: feeding power into it
 *     causes a short circuit and nothing reaches the exit.
 *
 * Every tile rotates in quarter turns both ways, so every configuration can always
 * be turned into a solution – there is no softlock by construction.
 */

export const N = 1;
export const E = 2;
export const S = 4;
export const W = 8;

export type Side = 'N' | 'E' | 'S' | 'W';
export type TileKind = 'L' | 'I' | 'T' | 'X';

export interface TileDef {
  kind: TileKind;
  fixed?: boolean;
  damaged?: boolean;
}

export interface BoardDef {
  size: number;
  tiles: TileDef[];
  source: { r: number; c: number; side: Side };
  dest: { r: number; c: number; side: Side };
  start: number[];
  /** One verified solution (documented, used by tests and the final hint). */
  solution: number[];
}

const BASE: Record<TileKind, number> = { L: N | E, I: N | S, T: E | S | W, X: N | E | S | W };
const SIDE_BIT: Record<Side, number> = { N, E, S, W };

export function rotateMask(mask: number, quarterTurns: number): number {
  let m = mask;
  const q = ((quarterTurns % 4) + 4) % 4;
  for (let i = 0; i < q; i++) m = ((m << 1) | (m >> 3)) & 15;
  return m;
}

export function maskOf(tile: TileDef, rot: number): number {
  return rotateMask(BASE[tile.kind], rot);
}

export function opposite(bit: number): number {
  return bit === N ? S : bit === S ? N : bit === E ? W : E;
}

export const ENERGIEPFAD: BoardDef = {
  size: 3,
  tiles: [
    { kind: 'L' },
    { kind: 'T' },
    { kind: 'L' },
    { kind: 'T' },
    { kind: 'I', fixed: true },
    { kind: 'T' },
    { kind: 'L' },
    { kind: 'X', fixed: true, damaged: true },
    { kind: 'L' },
  ],
  source: { r: 1, c: 0, side: 'W' },
  dest: { r: 1, c: 2, side: 'E' },
  //        (0,0) (0,1) (0,2) (1,0) (1,1) (1,2) (2,0) (2,1) (2,2)
  start: [2, 0, 0, 0, 0, 0, 1, 0, 3],
  solution: [1, 2, 2, 1, 0, 2, 1, 0, 3],
};

export interface FlowResult {
  powered: boolean[];
  /** Index of the damaged tile that received power, or -1. */
  shortAt: number;
  solved: boolean;
}

/** Simulates power flow from the source. */
export function evaluate(def: BoardDef, rot: number[]): FlowResult {
  const n = def.size;
  const powered = new Array<boolean>(n * n).fill(false);
  let shortAt = -1;
  const startIdx = def.source.r * n + def.source.c;
  const queue: number[] = [];
  if (maskOf(def.tiles[startIdx], rot[startIdx]) & SIDE_BIT[def.source.side]) {
    powered[startIdx] = true;
    queue.push(startIdx);
  }
  while (queue.length) {
    const i = queue.shift()!;
    if (def.tiles[i].damaged) {
      shortAt = i;
      continue; // a burnt segment does not pass power on
    }
    const r = Math.floor(i / n);
    const c = i % n;
    const m = maskOf(def.tiles[i], rot[i]);
    for (const [bit, dr, dc] of [
      [N, -1, 0],
      [E, 0, 1],
      [S, 1, 0],
      [W, 0, -1],
    ] as const) {
      if (!(m & bit)) continue;
      const nr = r + dr;
      const nc = c + dc;
      if (nr < 0 || nc < 0 || nr >= n || nc >= n) continue;
      const j = nr * n + nc;
      if (powered[j]) continue;
      if (maskOf(def.tiles[j], rot[j]) & opposite(bit)) {
        powered[j] = true;
        queue.push(j);
      }
    }
  }
  const destIdx = def.dest.r * n + def.dest.c;
  const reaches = powered[destIdx] && (maskOf(def.tiles[destIdx], rot[destIdx]) & SIDE_BIT[def.dest.side]) !== 0;
  return { powered, shortAt, solved: reaches && shortAt < 0 };
}

/** Returns a new rotation array with tile i turned by `dir` (+1 clockwise, −1 counter-clockwise). */
export function rotateTile(def: BoardDef, rot: number[], i: number, dir: 1 | -1 = 1): number[] {
  const out = rot.slice();
  if (def.tiles[i].fixed) return out;
  out[i] = (((out[i] + dir) % 4) + 4) % 4;
  return out;
}

export function isValidRotation(def: BoardDef, rot: unknown): rot is number[] {
  return (
    Array.isArray(rot) &&
    rot.length === def.tiles.length &&
    rot.every((v, i) => Number.isInteger(v) && v >= 0 && v < 4 && (!def.tiles[i].fixed || v === def.start[i]))
  );
}

/** Human-readable description of a tile for screen readers. */
export function describeTile(def: BoardDef, rot: number[], i: number, powered: boolean): string {
  const t = def.tiles[i];
  const m = maskOf(t, rot[i]);
  const names: string[] = [];
  if (m & N) names.push('oben');
  if (m & E) names.push('rechts');
  if (m & S) names.push('unten');
  if (m & W) names.push('links');
  const kind = t.damaged ? 'Verbranntes Segment' : t.kind === 'L' ? 'Winkelstück' : t.kind === 'I' ? 'Gerades Stück' : t.kind === 'T' ? 'T-Stück' : 'Kreuzstück';
  const r = Math.floor(i / def.size) + 1;
  const c = (i % def.size) + 1;
  return `Reihe ${r}, Spalte ${c}: ${kind}${t.fixed && !t.damaged ? ' (verschweißt)' : ''}, offen nach ${names.join(', ')}${powered ? ', führt Strom' : ''}.`;
}
