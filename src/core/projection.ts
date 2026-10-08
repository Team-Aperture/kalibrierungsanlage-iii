/**
 * World ↔ screen projection.
 *
 * Gameplay runs in a flat world plane (x, y) measured in world units (wu) plus an
 * optional height z. Rendering uses a 2:1 dimetric projection:
 *
 *   sx = x − y
 *   sy = (x + y) / 2 − z
 *
 * One floor tile is 16 × 16 wu and becomes a 32 × 16 px diamond. Heights map 1:1 to
 * screen pixels. The view direction (towards the viewer) is (1, 1, 1), so a larger
 * x + y + z means "closer to the camera".
 */

export const TILE = 16;

export interface Vec2 {
  x: number;
  y: number;
}

export interface Vec3 extends Vec2 {
  z: number;
}

export interface ScreenPoint {
  sx: number;
  sy: number;
}

export function toScreen(x: number, y: number, z = 0): ScreenPoint {
  return { sx: x - y, sy: (x + y) / 2 - z };
}

/** Inverse projection onto the horizontal plane at height z. */
export function toWorld(sx: number, sy: number, z = 0): Vec2 {
  const s = sy + z;
  return { x: s + sx / 2, y: s - sx / 2 };
}

/** Depth key along the view direction; larger is closer to the viewer. */
export function viewDepth(x: number, y: number, z = 0): number {
  return x + y + z;
}

/** Screen-space bounding rectangle of a world-space axis-aligned box. */
export function boxScreenBounds(
  x0: number,
  y0: number,
  z0: number,
  x1: number,
  y1: number,
  z1: number,
): { sx0: number; sy0: number; sx1: number; sy1: number } {
  // Extreme corners: leftmost is (x0, y1), rightmost is (x1, y0),
  // top is (x0, y0, z1), bottom is (x1, y1, z0).
  return {
    sx0: x0 - y1,
    sx1: x1 - y0,
    sy0: (x0 + y0) / 2 - z1,
    sy1: (x1 + y1) / 2 - z0,
  };
}

export type Facing8 = 'S' | 'SE' | 'E' | 'NE' | 'N' | 'NW' | 'W' | 'SW';

const FACINGS: Facing8[] = ['E', 'SE', 'S', 'SW', 'W', 'NW', 'N', 'NE'];

/** Facing from a screen-space direction vector (y grows downwards). */
export function facingFromScreen(dx: number, dy: number): Facing8 {
  const a = Math.atan2(dy, dx); // 0 = east, +π/2 = south
  const idx = Math.round(a / (Math.PI / 4));
  return FACINGS[((idx % 8) + 8) % 8];
}

/** Facing from a world-space movement vector. */
export function facingFromWorld(dx: number, dy: number): Facing8 {
  // Use the projected direction, with vertical screen motion stretched back to
  // its true proportion so diagonal world moves map to diagonal facings.
  const sx = dx - dy;
  const sy = dx + dy; // (x + y) / 2 scaled ×2 to undo foreshortening
  return facingFromScreen(sx, sy);
}

/**
 * World-space unit vector for a screen-space input direction (keyboard / joystick).
 * Cardinal keys move straight up/down/left/right on screen; diagonal keys follow the
 * isometric world axes, so walking along walls feels natural (classic iso mapping).
 */
export function worldDirFromScreen(dx: number, dy: number): Vec2 {
  if (dx === 0 && dy === 0) return { x: 0, y: 0 };
  const wx = dx + dy;
  const wy = dy - dx;
  const len = Math.hypot(wx, wy);
  return { x: wx / len, y: wy / len };
}
