/**
 * Isometric depth sorting by ground footprint.
 *
 * Every sortable thing is described by a world-space bounding box
 * (x0..x1, y0..y1, z0..z1). Sorting by sprite centre fails for large objects, so we
 * build a "drawn-before" graph from separating axes and topologically sort it:
 *
 *   A is behind B when A.x1 <= B.x0, or A.y1 <= B.y0, or A.z1 <= B.z0
 *
 * Because the view direction is (1, 1, 1), an object entirely on the low side of any
 * axis can never occlude the other one. Edges are only created for pairs whose screen
 * rectangles overlap, which keeps the graph small. If two boxes intersect (decorative
 * overlap) we fall back to comparing their centres along the view direction.
 */

import { boxScreenBounds } from './projection';

export interface SortBox {
  x0: number;
  y0: number;
  z0: number;
  x1: number;
  y1: number;
  z1: number;
}

export interface Sortable {
  box: SortBox;
  /** Cached screen bounds; recomputed by `updateBounds`. */
  sb?: { sx0: number; sy0: number; sx1: number; sy1: number };
  /** Optional bias for ties (larger draws later). */
  bias?: number;
}

export function updateBounds(item: Sortable): void {
  const b = item.box;
  item.sb = boxScreenBounds(b.x0, b.y0, b.z0, b.x1, b.y1, b.z1);
}

const EPS = 0.001;

/** Returns -1 if a must be drawn before b, 1 if after, 0 if independent. */
export function compareBoxes(a: SortBox, b: SortBox): number {
  if (a.x1 <= b.x0 + EPS) return -1;
  if (b.x1 <= a.x0 + EPS) return 1;
  if (a.y1 <= b.y0 + EPS) return -1;
  if (b.y1 <= a.y0 + EPS) return 1;
  if (a.z1 <= b.z0 + EPS) return -1;
  if (b.z1 <= a.z0 + EPS) return 1;
  // Intersecting boxes: compare centres along the view direction.
  const da = a.x0 + a.x1 + a.y0 + a.y1 + a.z0 + a.z1;
  const db = b.x0 + b.x1 + b.y0 + b.y1 + b.z0 + b.z1;
  return da < db ? -1 : da > db ? 1 : 0;
}

function screenOverlap(a: Sortable, b: Sortable): boolean {
  const p = a.sb!;
  const q = b.sb!;
  return p.sx0 < q.sx1 && q.sx0 < p.sx1 && p.sy0 < q.sy1 && q.sy0 < p.sy1;
}

/**
 * Topologically sorts items so that every item is drawn after everything behind it.
 * `out` is filled with the ordered items (reused to avoid per-frame allocation).
 */
export class DepthSorter<T extends Sortable> {
  private behind: number[][] = [];
  private state: Uint8Array = new Uint8Array(0);

  sort(items: T[], out: T[]): T[] {
    const n = items.length;
    out.length = 0;
    if (this.behind.length < n) {
      for (let i = this.behind.length; i < n; i++) this.behind.push([]);
    }
    if (this.state.length < n) this.state = new Uint8Array(n * 2);
    for (let i = 0; i < n; i++) {
      this.behind[i].length = 0;
      if (!items[i].sb) updateBounds(items[i]);
    }
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        if (!screenOverlap(items[i], items[j])) continue;
        let c = compareBoxes(items[i].box, items[j].box);
        if (c === 0) c = (items[i].bias ?? 0) <= (items[j].bias ?? 0) ? -1 : 1;
        if (c < 0) this.behind[j].push(i);
        else this.behind[i].push(j);
      }
    }
    this.state.fill(0, 0, n);
    // Visit in a stable baseline order (view depth) so unrelated items keep a
    // consistent relative order between frames.
    const order = this.baseline(items);
    for (const i of order) this.visit(i, items, out);
    return out;
  }

  private baselineIdx: number[] = [];

  private baseline(items: T[]): number[] {
    const idx = this.baselineIdx;
    idx.length = items.length;
    for (let i = 0; i < items.length; i++) idx[i] = i;
    idx.sort((a, b) => {
      const A = items[a].box;
      const B = items[b].box;
      return A.x0 + A.x1 + A.y0 + A.y1 - (B.x0 + B.x1 + B.y0 + B.y1);
    });
    return idx;
  }

  private visit(i: number, items: T[], out: T[]): void {
    const s = this.state[i];
    if (s === 2) return;
    if (s === 1) return; // cycle: break it here
    this.state[i] = 1;
    const deps = this.behind[i];
    for (let k = 0; k < deps.length; k++) this.visit(deps[k], items, out);
    this.state[i] = 2;
    out.push(items[i]);
  }
}
