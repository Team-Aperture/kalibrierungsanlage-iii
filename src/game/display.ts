/**
 * Responsive pixel-perfect display policy.
 *
 * The internal resolution adapts to the available area so that every game pixel
 * maps to an integer number of *device* pixels (crisp, never blurred):
 *
 *   landscape  ≈ 384 × 216  (width 352…512, height 198…288)
 *   portrait   ≈ 272 × 290  (game view on top, controls below)
 *
 * The composition was authored for 384 × 216. In portrait we deliberately use a
 * narrower, taller window onto the same world: a 16:9 strip would be tiny on a phone.
 */

export interface DisplayLayout {
  portrait: boolean;
  /** Internal resolution in game pixels. */
  gameW: number;
  gameH: number;
  /** Device pixels per game pixel. */
  scale: number;
  /** CSS size of the canvas. */
  cssW: number;
  cssH: number;
  /** CSS size of one game pixel. */
  cssPx: number;
}

export interface Area {
  width: number;
  height: number;
}

export function computeLayout(area: Area, dpr: number, portrait: boolean): DisplayLayout {
  const devW = Math.max(1, Math.floor(area.width * dpr));
  const devH = Math.max(1, Math.floor(area.height * dpr));
  const minW = portrait ? 256 : 352;
  const minH = portrait ? 230 : 198;
  const maxW = portrait ? 320 : 512;
  const maxH = portrait ? 360 : 288;
  const scale = Math.max(1, Math.floor(Math.min(devW / minW, devH / minH)));
  const gameW = Math.max(160, Math.min(maxW, Math.floor(devW / scale)));
  const gameH = Math.max(120, Math.min(maxH, Math.floor(devH / scale)));
  const cssPx = scale / dpr;
  return { portrait, gameW, gameH, scale, cssW: gameW * cssPx, cssH: gameH * cssPx, cssPx };
}

export function isPortraitViewport(w: number, h: number): boolean {
  return h > w * 1.1;
}
