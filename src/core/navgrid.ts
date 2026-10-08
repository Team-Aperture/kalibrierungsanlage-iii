/**
 * Grid navigation for click/tap-to-move.
 *
 * The walkable floor is sampled into cells (default 4 wu). A cell is walkable when
 * the player square fits at its centre according to the same collision world used
 * for continuous movement, so paths never ask the player to stand somewhere the
 * mover would reject. A* runs 8-connected without corner cutting; the resulting
 * cell path is shortened by line-of-sight string pulling.
 */

import { isFree, type CollisionWorld } from './collision';
import type { Vec2 } from './projection';

export interface PathResult {
  points: Vec2[];
  /** False when the requested target was unreachable and we aimed for the closest spot. */
  reachedTarget: boolean;
}

export class NavGrid {
  readonly cols: number;
  readonly rows: number;
  readonly walk: Uint8Array;
  private readonly ox: number;
  private readonly oy: number;

  constructor(
    private world: CollisionWorld,
    readonly radius: number,
    readonly cell = 4,
  ) {
    const b = world.bounds;
    this.ox = b.x0;
    this.oy = b.y0;
    this.cols = Math.ceil((b.x1 - b.x0) / cell);
    this.rows = Math.ceil((b.y1 - b.y0) / cell);
    this.walk = new Uint8Array(this.cols * this.rows);
    this.rebuild();
  }

  /** Re-sample walkability (call after doors open, gates move…). */
  rebuild(world?: CollisionWorld): void {
    if (world) this.world = world;
    for (let r = 0; r < this.rows; r++) {
      for (let c = 0; c < this.cols; c++) {
        const p = this.center(c, r);
        this.walk[r * this.cols + c] = isFree(this.world, p.x, p.y, this.radius) ? 1 : 0;
      }
    }
  }

  center(c: number, r: number): Vec2 {
    return { x: this.ox + (c + 0.5) * this.cell, y: this.oy + (r + 0.5) * this.cell };
  }

  cellOf(x: number, y: number): { c: number; r: number } {
    return {
      c: Math.min(this.cols - 1, Math.max(0, Math.floor((x - this.ox) / this.cell))),
      r: Math.min(this.rows - 1, Math.max(0, Math.floor((y - this.oy) / this.cell))),
    };
  }

  isWalkableCell(c: number, r: number): boolean {
    return c >= 0 && r >= 0 && c < this.cols && r < this.rows && this.walk[r * this.cols + c] === 1;
  }

  /** Walkable cell closest to (x, y) among cells reachable from `from` (BFS flood). */
  nearestReachable(from: Vec2, x: number, y: number): { c: number; r: number } | null {
    const start = this.startCell(from);
    if (!start) return null;
    const seen = new Uint8Array(this.cols * this.rows);
    const queue = new Int32Array(this.cols * this.rows);
    let head = 0;
    let tail = 0;
    queue[tail++] = start.r * this.cols + start.c;
    seen[queue[0]] = 1;
    let best = queue[0];
    let bestD = Infinity;
    while (head < tail) {
      const idx = queue[head++];
      const c = idx % this.cols;
      const r = (idx - c) / this.cols;
      const p = this.center(c, r);
      const d = (p.x - x) ** 2 + (p.y - y) ** 2;
      if (d < bestD) {
        bestD = d;
        best = idx;
      }
      for (let k = 0; k < 4; k++) {
        const nc = c + (k === 0 ? 1 : k === 1 ? -1 : 0);
        const nr = r + (k === 2 ? 1 : k === 3 ? -1 : 0);
        if (!this.isWalkableCell(nc, nr)) continue;
        const ni = nr * this.cols + nc;
        if (seen[ni]) continue;
        seen[ni] = 1;
        queue[tail++] = ni;
      }
    }
    return { c: best % this.cols, r: Math.floor(best / this.cols) };
  }

  /** The player may stand slightly off-grid; find the closest walkable cell to start from. */
  private startCell(from: Vec2): { c: number; r: number } | null {
    const s = this.cellOf(from.x, from.y);
    if (this.isWalkableCell(s.c, s.r)) return s;
    let best: { c: number; r: number } | null = null;
    let bestD = Infinity;
    for (let dr = -3; dr <= 3; dr++) {
      for (let dc = -3; dc <= 3; dc++) {
        const c = s.c + dc;
        const r = s.r + dr;
        if (!this.isWalkableCell(c, r)) continue;
        const p = this.center(c, r);
        const d = (p.x - from.x) ** 2 + (p.y - from.y) ** 2;
        if (d < bestD) {
          bestD = d;
          best = { c, r };
        }
      }
    }
    return best;
  }

  /**
   * Finds a path from `from` to `to`. If `to` is not reachable the path leads to the
   * closest reachable spot instead and `reachedTarget` is false. Returns null only if
   * the player itself is not on any walkable cell.
   */
  findPath(from: Vec2, to: Vec2): PathResult | null {
    const start = this.startCell(from);
    if (!start) return null;
    let goal = this.cellOf(to.x, to.y);
    let exact = this.isWalkableCell(goal.c, goal.r) && isFree(this.world, to.x, to.y, this.radius);
    const cells = this.astar(start, goal);
    let path = cells;
    if (!path) {
      const near = this.nearestReachable(from, to.x, to.y);
      if (!near) return null;
      goal = near;
      exact = false;
      path = this.astar(start, goal);
      if (!path) return null;
    }
    const pts = path.map((i) => this.center(i % this.cols, Math.floor(i / this.cols)));
    if (exact) pts[pts.length - 1] = { x: to.x, y: to.y };
    // Begin the path at the actual player position.
    pts.unshift({ x: from.x, y: from.y });
    const smooth = this.smooth(pts);
    smooth.shift();
    return { points: smooth, reachedTarget: exact };
  }

  private astar(start: { c: number; r: number }, goal: { c: number; r: number }): number[] | null {
    if (!this.isWalkableCell(goal.c, goal.r)) return null;
    const n = this.cols * this.rows;
    const g = new Float32Array(n).fill(Infinity);
    const came = new Int32Array(n).fill(-1);
    const closed = new Uint8Array(n);
    const heap = new MinHeap();
    const s = start.r * this.cols + start.c;
    const t = goal.r * this.cols + goal.c;
    g[s] = 0;
    heap.push(s, this.h(start.c, start.r, goal.c, goal.r));
    while (heap.size > 0) {
      const cur = heap.pop();
      if (cur === t) break;
      if (closed[cur]) continue;
      closed[cur] = 1;
      const c = cur % this.cols;
      const r = (cur - c) / this.cols;
      for (let dr = -1; dr <= 1; dr++) {
        for (let dc = -1; dc <= 1; dc++) {
          if (!dr && !dc) continue;
          const nc = c + dc;
          const nr = r + dr;
          if (!this.isWalkableCell(nc, nr)) continue;
          if (dc && dr && (!this.isWalkableCell(c + dc, r) || !this.isWalkableCell(c, r + dr))) continue;
          const ni = nr * this.cols + nc;
          if (closed[ni]) continue;
          const cost = g[cur] + (dc && dr ? Math.SQRT2 : 1);
          if (cost < g[ni]) {
            g[ni] = cost;
            came[ni] = cur;
            heap.push(ni, cost + this.h(nc, nr, goal.c, goal.r));
          }
        }
      }
    }
    if (s !== t && came[t] === -1) return null;
    const out: number[] = [];
    for (let i = t; i !== -1; i = came[i]) {
      out.push(i);
      if (i === s) break;
    }
    return out.reverse();
  }

  private h(c: number, r: number, gc: number, gr: number): number {
    const dx = Math.abs(c - gc);
    const dy = Math.abs(r - gr);
    return dx + dy + (Math.SQRT2 - 2) * Math.min(dx, dy);
  }

  /** Line of sight in continuous space, sampled at a fraction of the player size. */
  lineOfSight(a: Vec2, b: Vec2): boolean {
    const d = Math.hypot(b.x - a.x, b.y - a.y);
    const steps = Math.max(1, Math.ceil(d / (this.radius * 0.5)));
    for (let i = 1; i <= steps; i++) {
      const t = i / steps;
      if (!isFree(this.world, a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t, this.radius)) return false;
    }
    return true;
  }

  private smooth(pts: Vec2[]): Vec2[] {
    if (pts.length <= 2) return pts;
    const out: Vec2[] = [pts[0]];
    let anchor = 0;
    while (anchor < pts.length - 1) {
      let next = anchor + 1;
      for (let k = pts.length - 1; k > anchor + 1; k--) {
        if (this.lineOfSight(pts[anchor], pts[k])) {
          next = k;
          break;
        }
      }
      out.push(pts[next]);
      anchor = next;
    }
    return out;
  }
}

class MinHeap {
  private ids: number[] = [];
  private keys: number[] = [];
  get size(): number {
    return this.ids.length;
  }
  push(id: number, key: number): void {
    this.ids.push(id);
    this.keys.push(key);
    let i = this.ids.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (this.keys[p] <= this.keys[i]) break;
      this.swap(i, p);
      i = p;
    }
  }
  pop(): number {
    const top = this.ids[0];
    const lastId = this.ids.pop()!;
    const lastKey = this.keys.pop()!;
    if (this.ids.length > 0) {
      this.ids[0] = lastId;
      this.keys[0] = lastKey;
      let i = 0;
      for (;;) {
        const l = i * 2 + 1;
        const r = l + 1;
        let m = i;
        if (l < this.ids.length && this.keys[l] < this.keys[m]) m = l;
        if (r < this.ids.length && this.keys[r] < this.keys[m]) m = r;
        if (m === i) break;
        this.swap(i, m);
        i = m;
      }
    }
    return top;
  }
  private swap(a: number, b: number): void {
    [this.ids[a], this.ids[b]] = [this.ids[b], this.ids[a]];
    [this.keys[a], this.keys[b]] = [this.keys[b], this.keys[a]];
  }
}
