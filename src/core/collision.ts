/**
 * Continuous collision in world space. The player is an axis-aligned square of
 * half-size `r` on the floor plane; solids are axis-aligned rectangles. Movement is
 * resolved one axis at a time, which gives natural sliding along walls and machines.
 */

export interface Rect {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

export interface CollisionWorld {
  /** Walkable bounds of the room (inner faces of the walls). */
  bounds: Rect;
  /** Solid rectangles (machines, walls segments, closed doors…). */
  solids: Rect[];
}

function overlaps(x: number, y: number, r: number, s: Rect): boolean {
  return x + r > s.x0 && x - r < s.x1 && y + r > s.y0 && y - r < s.y1;
}

export function isFree(world: CollisionWorld, x: number, y: number, r: number): boolean {
  const b = world.bounds;
  if (x - r < b.x0 || x + r > b.x1 || y - r < b.y0 || y + r > b.y1) return false;
  for (const s of world.solids) if (overlaps(x, y, r, s)) return false;
  return true;
}

/**
 * Moves (x, y) by (dx, dy) with sliding. Returns the new position.
 * Large steps are subdivided so thin solids cannot be tunnelled through.
 */
export function moveWithCollision(
  world: CollisionWorld,
  x: number,
  y: number,
  dx: number,
  dy: number,
  r: number,
  out: { x: number; y: number },
): { x: number; y: number } {
  const steps = Math.max(1, Math.ceil(Math.max(Math.abs(dx), Math.abs(dy)) / (r * 0.5)));
  const sx = dx / steps;
  const sy = dy / steps;
  let px = x;
  let py = y;
  for (let i = 0; i < steps; i++) {
    px = resolveAxis(world, px, py, sx, r, true);
    py = resolveAxis(world, px, py, sy, r, false);
  }
  out.x = px;
  out.y = py;
  return out;
}

function resolveAxis(world: CollisionWorld, x: number, y: number, d: number, r: number, isX: boolean): number {
  if (d === 0) return isX ? x : y;
  const b = world.bounds;
  let nx = isX ? x + d : x;
  let ny = isX ? y : y + d;
  if (isX) {
    if (nx - r < b.x0) nx = b.x0 + r;
    if (nx + r > b.x1) nx = b.x1 - r;
  } else {
    if (ny - r < b.y0) ny = b.y0 + r;
    if (ny + r > b.y1) ny = b.y1 - r;
  }
  for (const s of world.solids) {
    if (!overlaps(nx, ny, r, s)) continue;
    if (isX) nx = d > 0 ? s.x0 - r - 0.001 : s.x1 + r + 0.001;
    else ny = d > 0 ? s.y0 - r - 0.001 : s.y1 + r + 0.001;
  }
  return isX ? nx : ny;
}

/** Distance from a point to a rectangle (0 when inside). */
export function distToRect(x: number, y: number, s: Rect): number {
  const dx = Math.max(s.x0 - x, 0, x - s.x1);
  const dy = Math.max(s.y0 - y, 0, y - s.y1);
  return Math.hypot(dx, dy);
}
