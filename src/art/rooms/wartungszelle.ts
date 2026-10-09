/**
 * Art for Location 1 – "Die Wartungszelle".
 * Geometry and materials of the room shell and every prop, plus the room's
 * lighting states. Nothing here knows about gameplay; positions come from the
 * shared layout file.
 */

import { WZ, type Box3 } from '../../content/rooms/wartungszelle.layout';
import { clamp, fbm, hash2, smoothstep, valueNoise } from '../../core/rng';
import type { Light, LightingState, Occluder } from '../light';
import { M } from '../materials';
import { C } from '../palette';
import { emblemDecal } from '../brand/decal';
import { bevel, darkPaint, grime, hazard, inRect, rivets, rustStreaks, seam, stencil, steel, vent } from '../shaders';
import { FACE, NO_EMI, Surface, TAG, type Frag, type Shader } from '../surface';

const { W, D, H } = WZ;

// ---------------------------------------------------------------------------
// Shared wall treatment
// ---------------------------------------------------------------------------

function wallPanel(f: Frag, u: number, v: number, seed: number): void {
  if (v < WZ.kick) {
    darkPaint(f, 0.42, seed);
    if (v > WZ.kick - 1) f.alb += 0.22;
    if (seam(u, 12, 1)) f.alb -= 0.12;
    return;
  }
  if (v >= WZ.band0 && v < WZ.band1) {
    steel(f, 0.6, seed);
    if (v < WZ.band0 + 1) f.alb -= 0.22;
    else if (v > WZ.band1 - 1) f.alb += 0.22;
    else if (Math.abs(v - (WZ.band0 + WZ.band1) / 2) < 0.6 && seam(u, 12, 1, 6)) f.alb += 0.32;
    return;
  }
  if (v >= WZ.band1) {
    darkPaint(f, 0.36, seed + 3);
    if (seam(u, 16, 1)) f.alb -= 0.1;
    rustStreaks(f, H, 0.1, seed + 9);
    return;
  }
  // Main panels.
  steel(f, 0.54, seed);
  const pu = ((u % 24) + 24) % 24;
  if (pu < 1) f.alb = 0.2;
  else if (pu < 2) f.alb += 0.12;
  else if (pu > 23) f.alb -= 0.08;
  if (Math.abs(v - 27) < 0.5) f.alb = 0.24;
  else if (Math.abs(v - 28) < 0.5) f.alb += 0.1;
  rivets(f, Math.round(u / 24) * 24 + 2.5, 6, 2);
  rustStreaks(f, WZ.band0, 0.18, seed + 5);
  rustStreaks(f, 27, 0.08, seed + 6);
  grime(f, 16, seed + 2);
  // Subtle large-scale tonal variation, so walls are never flat.
  f.alb *= 0.92 + fbm(u * 0.03, v * 0.03, seed + 1, 2) * 0.16;
}

/**
 * Scratched tally marks above the workbench: groups of five (four strokes and a
 * slash), three groups per row, four rows; the last group is unfinished → 58 marks.
 * Returns true for scratch pixels. Face space of the left wall: u = D − y.
 */
export const TALLY_COUNT = 58;
function tallyMark(u: number, v: number): boolean {
  const u0 = 5;
  const rows = [46, 39, 32, 25];
  for (let r = 0; r < rows.length; r++) {
    const dv = rows[r] - v;
    if (dv < 0 || dv >= 5) continue;
    const du = u - u0;
    const g = Math.floor(du / 10);
    if (g < 0 || g > 2) return false;
    const groupIndex = r * 3 + g;
    const marks = groupIndex < 11 ? 5 : groupIndex === 11 ? 3 : 0;
    const lx = du - g * 10;
    for (let m = 0; m < Math.min(4, marks); m++) if (lx >= m * 2 && lx < m * 2 + 1) return true;
    if (marks === 5 && lx >= -0.5 && lx < 7.5 && Math.abs(dv - (4 - lx * 0.5)) < 0.55) return true;
  }
  return false;
}

// ---------------------------------------------------------------------------
// Background: floor, walls, doorway recess
// ---------------------------------------------------------------------------

interface FootRect {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

const FOOTPRINTS: FootRect[] = [
  WZ.terminal,
  WZ.panel,
  WZ.shelf,
  WZ.machine,
  WZ.transformer,
  WZ.bench,
  WZ.crates,
  [120, 0, 0, 127, 7, 0],
  [157, 0, 0, 164, 7, 0],
  ...WZ.columnsLeft,
  ...WZ.columnsRight,
].map((b) => ({ x0: b[0], y0: b[1], x1: b[3], y1: b[4] }));

function rectDist(x: number, y: number, r: FootRect): number {
  const dx = Math.max(r.x0 - x, 0, x - r.x1);
  const dy = Math.max(r.y0 - y, 0, y - r.y1);
  return Math.hypot(dx, dy);
}

const WEAR: Array<[number, number, number, number]> = [
  [54, 118, 41, 30],
  [41, 30, 88, 24],
  [88, 24, 142, 20],
  [54, 118, 28, 46],
  [54, 118, 120, 110],
];

function segDist(px: number, py: number, s: [number, number, number, number]): number {
  const [ax, ay, bx, by] = s;
  const dx = bx - ax;
  const dy = by - ay;
  const t = clamp(((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy), 0, 1);
  return Math.hypot(px - ax - t * dx, py - ay - t * dy);
}

const floorShader: Shader = (f) => {
  const x = f.x;
  const y = f.y;
  steel(f, 0.5, 3);
  const pxm = ((x % 32) + 32) % 32;
  const pym = ((y % 32) + 32) % 32;
  const plateX = Math.floor(x / 32);
  const plateY = Math.floor(y / 32);
  f.alb += (hash2(plateX, plateY, 4) - 0.5) * 0.1;
  // Plate seams with a lit lip.
  if (pxm < 1 || pym < 1) f.alb = 0.16;
  else if (pxm < 2 || pym < 2) f.alb += 0.12;
  // Corner bolts.
  for (const bx of [4, 28]) {
    for (const by of [4, 28]) {
      const d = Math.hypot(pxm - bx, pym - by);
      if (d < 0.9) f.alb += 0.32;
      else if (d < 1.6 && pxm + pym > bx + by) f.alb -= 0.16;
    }
  }
  // A single long scratch on some plates.
  if (hash2(plateX, plateY, 9) < 0.45) {
    const a = hash2(plateX, plateY, 10) * Math.PI;
    const cx = 16 + (hash2(plateX, plateY, 11) - 0.5) * 12;
    const cy = 16 + (hash2(plateX, plateY, 12) - 0.5) * 12;
    const along = (pxm - cx) * Math.cos(a) + (pym - cy) * Math.sin(a);
    const across = -(pxm - cx) * Math.sin(a) + (pym - cy) * Math.cos(a);
    if (Math.abs(across) < 0.45 && Math.abs(along) < 7) f.alb += 0.14;
  }
  // Polished walking paths.
  let wear = 0;
  for (const s of WEAR) wear = Math.max(wear, 1 - segDist(x, y, s) / 10);
  f.alb += Math.max(0, wear) * 0.08;
  // Dirt along the walls.
  const dw = Math.min(x, y);
  if (dw < 16) {
    const n = fbm(x * 0.15, y * 0.15, 21, 3);
    f.alb *= 1 - (1 - dw / 16) * (0.35 + n * 0.4) * (1 - wear);
  }
  // Contact shadows around machines.
  let dmin = Infinity;
  for (const r of FOOTPRINTS) dmin = Math.min(dmin, rectDist(x, y, r));
  f.alb *= 0.5 + 0.5 * smoothstep(0, 7, dmin);
  // Hazard strip in front of the door.
  if (x >= 122 && x <= 162 && y >= 7 && y < 15) {
    const s = ((x % 8) + 8) % 8 < 4;
    const worn = fbm(x * 0.25, y * 0.5, 31, 2) > 0.62 || wear > 0.6 && hash2(x | 0, y | 0, 3) > 0.6;
    if (!worn) {
      f.mat = M.HAZARD;
      f.alb = s ? 0.88 : 0.2;
    }
    if (y < 8) f.alb -= 0.12;
  }
  // Painted safety line around the machine (dashed).
  {
    const r = { x0: 68, y0: 52, x1: 124, y1: 108 };
    const inside = x > r.x0 && x < r.x1 && y > r.y0 && y < r.y1;
    const edge = Math.min(Math.abs(x - r.x0), Math.abs(x - r.x1), Math.abs(y - r.y0), Math.abs(y - r.y1));
    const onEdge = (inside || edge < 1.2) && edge < 1.2 && x > r.x0 - 1.2 && x < r.x1 + 1.2 && y > r.y0 - 1.2 && y < r.y1 + 1.2;
    if (onEdge) {
      const along = Math.abs(x - r.x0) < 1.2 || Math.abs(x - r.x1) < 1.2 ? y : x;
      if (((along % 8) + 8) % 8 < 5 && fbm(x * 0.3, y * 0.3, 41, 2) < 0.66) {
        f.mat = M.HAZARD;
        f.alb = 0.78;
      }
    }
  }
  // Drain grate.
  {
    const [gx0, gy0, gx1, gy1] = WZ.grate;
    if (x >= gx0 && x < gx1 && y >= gy0 && y < gy1) {
      const fx = Math.min(x - gx0, gx1 - x);
      const fy = Math.min(y - gy0, gy1 - y);
      const frame = Math.min(fx, fy);
      f.mat = M.STEEL;
      if (frame < 1.6) f.alb = frame < 0.8 ? 0.2 : 0.62;
      else if (((y % 3) + 3) % 3 < 1.2) f.alb = 0.52;
      else {
        f.mat = M.STEEL_DARK;
        f.alb = 0.08 + valueNoise(x * 0.5, y * 0.5, 2) * 0.06;
      }
    }
  }
  // Oil stain near the machine.
  {
    const d = Math.hypot(x - 116, y - 110);
    const edge = 6 + fbm(x * 0.2, y * 0.2, 51, 3) * 6;
    if (d < edge) {
      f.alb *= d > edge - 1 ? 1.15 : 0.5;
    }
  }
  return true;
};

const leftWallShader: Shader = (f) => {
  // RIGHT face of the left wall box: u = D − y.
  const u = f.u;
  const v = f.v;
  wallPanel(f, u, v, 100);
  // Stencilled room name on the band.
  if (v >= WZ.band0 && v < WZ.band1 && stencil(f, 'WARTUNGSZELLE 03', 22, WZ.band1 - 2)) {
    f.mat = M.STEEL;
    f.alb = 0.95;
  }
  // Panel numbers.
  if (stencil(f, 'R-2', 116, 47)) {
    f.mat = M.STEEL;
    f.alb = 0.9;
  }
  if (stencil(f, 'W-03', 72, 46)) f.alb += 0.18;
  // Tally marks (engraved: bright scratch, dark lower edge).
  if (u > 0 && v > 18 && v < 48 && u < 40) {
    if (tallyMark(u, v)) {
      f.mat = M.STEEL;
      f.alb = 0.92;
    } else if (tallyMark(u, v + 1)) {
      f.alb -= 0.18;
    }
  }
  return true;
};

const rightWallShader: Shader = (f) => {
  // LEFT face of the right wall box: u = x.
  const u = f.u;
  const v = f.v;
  const { open0, open1, openH } = WZ.door;
  if (u >= open0 && u <= open1 && v < openH) return false;
  wallPanel(f, u, v, 200);
  if (v >= WZ.band0 && v < WZ.band1 && stencil(f, 'SEKTOR 0', 4, WZ.band1 - 2)) {
    f.alb = 0.95;
  }
  if (stencil(f, 'W-01', 5, 46) || stencil(f, 'W-02', 170, 46)) f.alb += 0.18;
  // Wall junction box above the terminal.
  if (inRect(f, 33, 44, 14, 6)) {
    darkPaint(f, 0.48, 5);
    if (f.v < 45 || f.u < 34 || f.u > 46) f.alb -= 0.15;
    if (f.v > 49) f.alb += 0.2;
  }
  return true;
};

const capShader: Shader = (f) => {
  darkPaint(f, 0.3, 8);
  bevel(f, 0.3);
  return true;
};

const cutShader: Shader = (f) => {
  // Cut section of a wall end: hatched like a technical drawing.
  f.mat = M.STEEL_DARK;
  f.alb = ((((f.u + f.v) % 4) + 4) % 4) < 1 ? 0.42 : 0.2;
  bevel(f, 0.25);
  return true;
};

const slabShader: Shader = (f) => {
  darkPaint(f, 0.34, 9);
  if (f.v > f.h - 2) {
    hazard(f, 6);
    if (f.v > f.h - 1) f.alb += 0.1;
  } else if (f.v > f.h - 3) f.alb = 0.12;
  if (seam(f.u, 32, 1)) f.alb -= 0.12;
  return true;
};

const columnShader: Shader = (f) => {
  steel(f, 0.5, 13);
  if (f.tag === FACE.TOP) {
    f.alb = 0.4;
    bevel(f, 0.3);
    return true;
  }
  // I-beam: bright flanges, recessed web.
  const flange = f.u < 1.5 || f.u > f.w - 1.5;
  if (!flange) f.alb -= 0.2;
  else if (f.u < 0.8 || f.u > f.w - 0.8) f.alb += 0.15;
  rivets(f, f.w / 2, 8, 3);
  if (Math.abs(f.v - WZ.band0) < 1 || Math.abs(f.v - WZ.band1) < 1) f.alb += 0.15;
  grime(f, 12, 14);
  bevel(f, 0.18);
  return true;
};

const pipeShader = (base: number, seed: number): Shader => (f) => {
  if (f.tag === TAG.PIPE_CAP) {
    f.mat = M.STEEL;
    f.alb = 0.45;
    return true;
  }
  steel(f, base, seed);
  // Flanges every 32 wu and brackets.
  const m = ((f.u % 32) + 32) % 32;
  if (m < 1.5) f.alb += 0.18;
  else if (m < 2.2) f.alb -= 0.15;
  if (valueNoise(f.u * 0.3, f.v * 0.5, seed) > 0.72) {
    f.mat = M.RUST;
    f.alb = 0.5;
  }
  return true;
};

const corridorShader: Shader = (f) => {
  darkPaint(f, 0.32, 17);
  if (f.tag === FACE.TOP) {
    if (seam(f.v, 8, 1)) f.alb -= 0.1;
  } else if (seam(f.u, 8, 1)) f.alb -= 0.08;
  return true;
};

const cableBridgeShader: Shader = (f) => {
  if (f.tag === FACE.TOP) {
    const s = ((f.v % 8) + 8) % 8 < 4;
    f.mat = M.HAZARD;
    f.alb = s ? 0.7 : 0.2;
    if (fbm(f.u, f.v * 0.4, 61, 2) > 0.65) {
      f.mat = M.RUBBER;
      f.alb = 0.35;
    }
    bevel(f, 0.15);
    return true;
  }
  f.mat = M.RUBBER;
  f.alb = 0.3;
  return true;
};

export function buildBackground(): Surface {
  const s = Surface.forBoxes([
    [-8, -32, -10, W, D, H + 2],
    [0, 0, 0, 0, 0, 120],
  ]);
  const { open0, open1, openH } = WZ.door;

  // Corridor beyond the door (visible once it opens).
  s.box(open0, -32, -1, open1, -8, 0, corridorShader, 1);
  s.quad({ x: open0, y: -8, z: 0 }, { x: 0, y: -24, z: 0 }, { x: 0, y: 0, z: openH }, corridorShader, FACE.RIGHT);
  s.quad({ x: open0, y: -32, z: 0 }, { x: open1 - open0, y: 0, z: 0 }, { x: 0, y: 0, z: openH }, corridorShader, FACE.LEFT);
  // Door jamb reveal (wall thickness inside the opening).
  s.quad({ x: open0, y: 0, z: 0 }, { x: 0, y: -8, z: 0 }, { x: 0, y: 0, z: openH }, (f) => {
    darkPaint(f, 0.3, 19);
    return true;
  }, FACE.RIGHT);

  // Floor and slab.
  s.box(0, 0, -10, W, D, 0, floorShader, 1);
  s.box(-8, 0, -10, W, D, 0, slabShader, 6);

  // Walls.
  s.box(-8, 0, 0, 0, D, H, leftWallShader, 4);
  s.box(0, -8, 0, W, 0, H, rightWallShader, 2);
  s.box(-8, 0, 0, 0, D, H, capShader, 1);
  s.box(0, -8, 0, W, 0, H, capShader, 1);
  s.box(-8, -8, 0, 0, 0, H, capShader, 1);
  // Cut wall ends facing the viewer.
  s.box(-8, D - 0.01, 0, 0, D, H, cutShader, 2);
  s.box(W - 0.01, -8, 0, W, 0, H, cutShader, 4);

  // Structural columns.
  for (const c of WZ.columnsLeft) s.box(c[0], c[1], c[2], c[3], c[4], c[5], columnShader);
  for (const c of WZ.columnsRight) s.box(c[0], c[1], c[2], c[3], c[4], c[5], columnShader);

  // Pipes along the upper walls, and the conduit from the distribution panel.
  s.pipe('y', 0, D, 4, 64, 3, pipeShader(0.5, 1));
  s.pipe('y', 0, D, 2.5, 69.5, 1.5, pipeShader(0.42, 2));
  s.pipe('x', 0, W, 4, 64, 3, pipeShader(0.5, 3));
  s.pipe('x', 0, W, 2.5, 69.5, 1.5, pipeShader(0.42, 4));
  s.cylV(80, 4, 1.8, 52, 64, pipeShader(0.5, 5));
  s.cylV(96, 4, 1.8, 52, 64, pipeShader(0.5, 6));
  s.cylV(40, 2.5, 1.2, 42, 44, pipeShader(0.4, 7));

  // Cable bridge from the panel to the machine.
  s.box(85, 9, 0, 91, WZ.machine[1], 2, cableBridgeShader, 3);

  return s;
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

function surfaceFor(box: Box3, extra: Box3[] = [], pad = 2): Surface {
  return Surface.forBoxes([box, ...extra], pad);
}

/** Terminal T-01: console desk with keyboard and a CRT monitor. */
export function buildTerminal(): Surface {
  const s = surfaceFor(WZ.terminal);
  const body: Shader = (f) => {
    darkPaint(f, 0.46, 31);
    if (f.tag === FACE.LEFT) {
      if (vent(f, 3, 2, 10, 6, 2)) return true;
      if (inRect(f, 18, 7, 8, 5)) {
        f.mat = M.STEEL;
        f.alb = 0.68;
        if (stencil(f, 'T01', 18.5, 11.5)) f.alb = 0.2;
        return true;
      }
      if (inRect(f, 26.5, 9, 1, 1)) {
        f.emi = C.AMBER;
        return true;
      }
      if (Math.abs(f.v - 13) < 0.5) f.alb += 0.12;
    }
    if (f.tag === FACE.RIGHT) grime(f, 8, 32);
    bevel(f, 0.24);
    return true;
  };
  s.box(26, 4, 0, 56, 20, 15, body);
  // Sloped keyboard deck.
  s.quad({ x: 26, y: 12, z: 15 }, { x: 30, y: 0, z: 0 }, { x: 0, y: 8, z: -2 }, (f) => {
    f.mat = M.STEEL_DARK;
    const ku = f.u - 3;
    const kv = f.v - 1;
    const key = ku > 0 && ku < 24 && kv > 0 && kv < 6 && ((Math.floor(ku) % 3) < 2) && ((Math.floor(kv) % 2) < 1);
    f.alb = key ? 0.62 : 0.28;
    if (f.v > f.h - 1) f.alb += 0.25;
    return true;
  });
  s.box(26, 4, 15, 56, 12, 15.5, body, 1);
  // CRT housing.
  const housing: Shader = (f) => {
    steel(f, 0.5, 33);
    if (f.tag === FACE.LEFT) {
      // Screen recess: u 3..23, v 5..22.
      if (inRect(f, 3, 5, 21, 17)) {
        f.mat = M.GLASS;
        const cu = (f.u - 13.5) / 10.5;
        const cv = (f.v - 13.5) / 8.5;
        f.alb = 0.3 - (cu * cu + cv * cv) * 0.12;
        return true;
      }
      if (inRect(f, 2, 4, 23, 19)) {
        f.alb = 0.22;
        return true;
      }
      if (inRect(f, 1, 1, 3, 2) || inRect(f, 22, 1, 3, 2)) {
        f.alb = 0.18;
        return true;
      }
      if (stencil(f, 'KA-WART', 3, 3.6)) {
        f.alb = 0.8;
        return true;
      }
    }
    if (f.tag === FACE.TOP && seam(f.u, 3, 1) && f.v > 3 && f.v < 9) f.alb = 0.2;
    if (f.tag === FACE.RIGHT && vent(f, 2, 12, 7, 8, 2)) return true;
    bevel(f, 0.26);
    return true;
  };
  s.box(28, 1, 16, 55, 13, 42, housing);
  // Tube neck behind.
  s.box(33, 0, 20, 50, 2, 38, (f) => {
    darkPaint(f, 0.3, 34);
    return true;
  });
  return s;
}

export const TERMINAL_SCREEN = { O: { x: 31, y: 13.02, z: 21 }, U: { x: 21, y: 0, z: 0 }, V: { x: 0, y: 0, z: 17 }, w: 21, h: 17 };

/** Distribution panel V-2 (wall cabinet). Variants: fuse missing / fuse inserted. */
export function buildPanel(withFuse: boolean): Surface {
  const s = surfaceFor(WZ.panel, [[72, 0, 0, 104, 9, 12]]);
  const cab: Shader = (f) => {
    steel(f, 0.52, 41);
    if (f.tag === FACE.LEFT) {
      const u = f.u;
      const v = f.v;
      // Two doors.
      if (Math.abs(u - 15) < 0.6) {
        f.alb = 0.16;
        return true;
      }
      if (u < 1 || u > 29 || v < 1 || v > 39) f.alb -= 0.06;
      // Warning plate (amber triangle with lightning).
      const tv = v - 24;
      const tu = u - 7.5;
      if (tv >= 0 && tv < 9 && Math.abs(tu) <= (9 - tv) * 0.55) {
        f.mat = M.HAZARD;
        f.alb = 0.9;
        const bolt = (Math.abs(tu - (tv - 4) * -0.5) < 0.8 && tv > 1 && tv < 8) || false;
        if (bolt) f.alb = 0.15;
        return true;
      }
      // Fuse holder: three sockets at v 16 / 12.5 / 9.
      if (inRect(f, 3, 6, 10, 13)) {
        f.mat = M.STEEL_DARK;
        f.alb = 0.3;
        const slots = [16, 12.5, 9];
        for (let k = 0; k < 3; k++) {
          const sv = slots[k];
          if (v >= sv && v < sv + 2 && u >= 4 && u < 12) {
            const present = k < 2 || withFuse;
            if (!present) {
              f.alb = 0.05;
              return true;
            }
            f.mat = u < 5 || u >= 11 ? M.COPPER : M.PAPER;
            f.alb = u < 5 || u >= 11 ? 0.7 : 0.75 + (v - sv) * 0.12;
            return true;
          }
        }
        return true;
      }
      // Indicator grid (puzzle mirror), lamps drawn by an overlay.
      if (inRect(f, 18, 26, 9, 9)) {
        f.mat = M.STEEL_DARK;
        f.alb = 0.18;
        const lu = (f.u - 18) % 3;
        const lv = (f.v - 26) % 3;
        if (lu >= 0.5 && lu < 2.5 && lv >= 0.5 && lv < 2.5) {
          f.mat = M.GLASS;
          f.alb = 0.2;
        }
        return true;
      }
      if (stencil(f, 'V-2', 19, 21)) {
        f.alb = 0.9;
        return true;
      }
      // Handles.
      if ((Math.abs(u - 13) < 0.6 || Math.abs(u - 17) < 0.6) && v > 17 && v < 23) {
        f.alb = 0.85;
        return true;
      }
      rustStreaks(f, 40, 0.25, 44);
      grime(f, 8, 45);
    }
    bevel(f, 0.26);
    return true;
  };
  s.box(73, 0, 12, 103, 8, 52, cab);
  s.box(72, 0, 51, 104, 9, 54, (f) => {
    steel(f, 0.46, 46);
    bevel(f, 0.3);
    return true;
  });
  s.cylV(80, 4, 1.6, 0, 12, (f) => {
    darkPaint(f, 0.42, 47);
    return true;
  }, false);
  s.cylV(96, 4, 1.6, 0, 12, (f) => {
    darkPaint(f, 0.42, 48);
    return true;
  }, false);
  return s;
}

/** Face mapping of the 3×3 indicator lamp grid on the panel door. */
export const PANEL_GRID = { x0: 73 + 18, y: 8.02, z0: 12 + 26 };
/** Where sparks leave the empty fuse socket. */
export const PANEL_SPARK = { x: 73 + 8, y: 9, z: 12 + 10 };

/**
 * Bulkhead door "Schleuse 0-1" with frame. `lift` (0…1) raises the leaf;
 * `bolts` (0…1) is how far the locking bolts are extended.
 */
export function buildDoor(lift: number, bolts: number): Surface {
  const s = surfaceFor(WZ.doorBox, [[120, -4, 0, 164, 7, 66]]);
  const { open0, open1, openH } = WZ.door;
  const jamb: Shader = (f) => {
    steel(f, 0.5, 51);
    if (f.tag === FACE.LEFT) {
      hazard(f, 6, 52);
      if (f.u < 1 || f.u > f.w - 1) f.alb -= 0.1;
    }
    bevel(f, 0.28);
    return true;
  };
  s.box(120, 0, 0, open0, 7, openH, jamb);
  s.box(open1, 0, 0, 164, 7, openH, jamb);
  s.box(120, 0, openH, 164, 7, WZ.door.lintel, (f) => {
    steel(f, 0.52, 53);
    if (f.tag === FACE.LEFT) {
      if (stencil(f, 'SCHLEUSE 0-1', 0, 8)) {
        f.alb = 0.95;
        return true;
      }
      if (f.v < 1) f.alb -= 0.15;
    }
    bevel(f, 0.3);
    return true;
  });
  // Indicator lamp housing on the lintel (lamp colour is an overlay).
  s.box(139, 3, WZ.door.lintel, 145, 8, WZ.door.lintel + 4, (f) => {
    darkPaint(f, 0.4, 54);
    if (f.tag === FACE.LEFT && inRect(f, 1.5, 0.8, 3, 2.4)) {
      f.mat = M.GLASS;
      f.alb = 0.25;
      return true;
    }
    bevel(f, 0.25);
    return true;
  });
  // Door leaf.
  const z0 = lift * openH;
  const leafH = openH;
  if (z0 < openH - 0.5) {
    const leaf: Shader = (f) => {
      if (f.z > openH) return false;
      steel(f, 0.46, 55);
      if (f.tag !== FACE.LEFT) {
        bevel(f, 0.2);
        return true;
      }
      const u = f.u;
      const v = f.v;
      // Bottom hazard edge.
      if (v < 4) {
        hazard(f, 6, 56);
        if (v < 1) f.alb -= 0.1;
        return true;
      }
      // Horizontal ribs.
      if (seam(v, 9, 1, 4)) f.alb += 0.16;
      else if (seam(v, 9, 1, 5)) f.alb -= 0.12;
      // Locking hub.
      const hu = u - 15;
      const hv = v - 22;
      const r = Math.hypot(hu, hv * 1.0);
      if (r < 6.5) {
        f.alb = r < 1.5 ? 0.75 : r < 3 ? 0.35 : r < 5 ? 0.58 : 0.25;
        if (r >= 3 && r < 5 && Math.abs(hu) < 0.6) f.alb = 0.2;
        return true;
      }
      // Bolts: bars from the hub towards both sides.
      if (Math.abs(hv) < 1.2) {
        const reach = 6.5 + bolts * 8;
        if (Math.abs(hu) < reach) {
          f.alb = Math.abs(hv) < 0.5 ? 0.8 : 0.55;
          return true;
        }
      }
      if (stencil(f, '0-1', 22, 36)) {
        f.mat = M.HAZARD;
        f.alb = 0.85;
        return true;
      }
      rustStreaks(f, 40, 0.25, 57);
      grime(f, 12, 58);
      return true;
    };
    s.box(open0, -3, z0, open1, 2, z0 + leafH, leaf);
  }
  return s;
}

export const DOOR_LAMP = { x: 142, y: 8.02, z: WZ.door.lintel + 2 };

/** Shelf R-2 with boxes, binders and the F-series fuse case. */
export function buildShelf(fuseTaken: boolean): Surface {
  const [x0, y0, , x1, y1, z1] = WZ.shelf;
  const s = surfaceFor(WZ.shelf);
  const post: Shader = (f) => {
    steel(f, 0.5, 61);
    if (seam(f.v, 4, 1)) f.alb -= 0.2;
    bevel(f, 0.2);
    return true;
  };
  for (const px of [x0, x1 - 1.5]) for (const py of [y0, y1 - 1.5]) s.box(px, py, 0, px + 1.5, py + 1.5, z1, post);
  const board: Shader = (f) => {
    f.mat = M.WOOD;
    f.alb = 0.62 + (fbm(f.u * 0.4, f.v * 0.1, 62, 2) - 0.5) * 0.12;
    if (f.tag !== FACE.TOP) f.alb = 0.75;
    bevel(f, 0.2);
    return true;
  };
  const levels = [2, 14, 27, 40];
  for (const z of levels) s.box(x0, y0, z, x1, y1, z + 1.5, board);
  const card = (seed: number, tone: number): Shader => (f) => {
    f.mat = M.WOOD;
    f.alb = tone + (hash2(Math.floor(f.u), Math.floor(f.v), seed) - 0.5) * 0.04;
    if (f.tag === FACE.TOP && Math.abs(f.v - f.h / 2) < 0.5) f.alb -= 0.15;
    if (f.tag === FACE.RIGHT && inRect(f, f.w / 2 - 2, f.h / 2 - 1, 4, 2)) f.alb += 0.25;
    bevel(f, 0.15);
    return true;
  };
  // Bottom shelf: cartons and a red canister.
  s.box(2, 25, 3.5, 12, 37, 12, card(63, 0.5));
  s.box(3, 39, 3.5, 13, 48, 10, card(64, 0.45));
  s.cylV(8, 55, 3.2, 3.5, 12.5, (f) => {
    f.mat = M.RED_PAINT;
    f.alb = 0.55;
    if (f.tag === TAG.CYL_SIDE && Math.abs(f.v - 6) < 0.6) f.alb = 0.8;
    return true;
  });
  // Second shelf: binders and the fuse case.
  for (let i = 0; i < 6; i++) {
    const by = 24 + i * 2.6;
    const tone = [0.5, 0.36, 0.6, 0.42, 0.55, 0.3][i];
    s.box(3, by, 15.5, 12, by + 2.2, 15.5 + 8 + (i % 2), (f) => {
      f.mat = i % 3 === 1 ? M.RED_PAINT : M.STEEL;
      f.alb = tone;
      if (f.tag === FACE.RIGHT && Math.abs(f.v - 5) < 0.6) f.alb += 0.3;
      bevel(f, 0.12);
      return true;
    });
  }
  // Fuse case "F": closed (with fuse) or open and empty.
  s.box(4, 44, 15.5, 13, 57, 20, (f) => {
    steel(f, 0.62, 65);
    if (f.tag === FACE.TOP && !fuseTaken && Math.abs(f.v - 6.5) < 0.6) f.alb = 0.3;
    if (f.tag === FACE.TOP && fuseTaken) {
      f.alb = 0.18;
      if (f.u < 1 || f.u > f.w - 1 || f.v < 1 || f.v > f.h - 1) f.alb = 0.55;
    }
    if (f.tag === FACE.RIGHT) {
      if (stencil(f, 'F', 5, 4)) f.alb = 0.15;
      if (inRect(f, 1, 1, 2, 1.5)) {
        f.mat = M.HAZARD;
        f.alb = 0.9;
      }
    }
    bevel(f, 0.25);
    return true;
  });
  if (fuseTaken) {
    // Opened lid leaning against the back.
    s.quad({ x: 4, y: 44, z: 20 }, { x: 0, y: 13, z: 0 }, { x: -1.5, y: 0, z: 8 }, (f) => {
      steel(f, 0.55, 66);
      return true;
    });
  }
  // Third shelf: cable coil, jars, manual.
  s.cylV(8, 30, 4, 28.5, 32, (f) => {
    f.mat = M.RUBBER;
    f.alb = ((Math.floor(f.v * 2) % 2) === 0 ? 0.42 : 0.25) + (f.tag === TAG.CYL_TOP ? (Math.hypot(f.u, f.v) < 1.6 ? -0.2 : 0.1) : 0);
    return true;
  });
  for (let i = 0; i < 3; i++) {
    s.cylV(6 + (i % 2) * 3, 41 + i * 4, 1.5, 28.5, 33, (f) => {
      f.mat = M.GLASS;
      f.alb = 0.3 + (f.tag === TAG.CYL_TOP ? 0.2 : 0);
      if (f.tag === TAG.CYL_SIDE && f.v > 3.5) {
        f.mat = M.COPPER;
        f.alb = 0.5;
      }
      return true;
    });
  }
  s.box(3, 51, 28.5, 12, 60, 30.5, (f) => {
    f.mat = M.PAPER;
    f.alb = f.tag === FACE.TOP ? 0.55 : 0.4;
    if (f.tag === FACE.TOP && Math.abs(f.u - f.w / 2) < 0.5) f.alb = 0.3;
    return true;
  });
  // Top: helmet-like canister and a box.
  s.box(3, 26, 41.5, 13, 40, 48, card(67, 0.4));
  return s;
}

/** Central machine "Messwerk M-3". */
export function buildMachine(): Surface {
  const s = surfaceFor(WZ.machine);
  const [x0, y0, , x1, y1] = WZ.machine;
  const cx = (x0 + x1) / 2;
  const cy = (y0 + y1) / 2;
  s.box(x0, y0, 0, x1, y1, 6, (f) => {
    darkPaint(f, 0.42, 71);
    if (f.tag !== FACE.TOP && f.v > 4) hazard(f, 6, 72);
    if (f.tag === FACE.TOP && (f.u < 2 || f.v < 2 || f.u > f.w - 2 || f.v > f.h - 2)) f.alb += 0.1;
    bevel(f, 0.22);
    return true;
  });
  const drum: Shader = (f) => {
    if (f.tag === TAG.CYL_TOP) {
      steel(f, 0.5, 73);
      const r = Math.hypot(f.u, f.v);
      if (r > f.w - 1) f.alb += 0.2;
      return true;
    }
    steel(f, 0.56, 74);
    const v = f.v;
    if (Math.abs(v - 4) < 1 || Math.abs(v - 36) < 1) f.alb += 0.18;
    if (Math.abs(v - 5) < 0.5 || Math.abs(v - 37) < 0.5) f.alb -= 0.2;
    // Viewing slot (rotor glow overlay when powered).
    if (v > 22 && v < 29) {
      f.mat = M.GLASS;
      f.alb = 0.22;
      if (v < 23 || v > 28) {
        f.mat = M.STEEL;
        f.alb = 0.3;
      }
      return true;
    }
    if (seam(f.u, 8, 0.8)) f.alb -= 0.15;
    rivets(f, Math.round(f.u / 8) * 8 + 1.5, 5, 1);
    rustStreaks(f, 36, 0.2, 75);
    return true;
  };
  s.cylV(cx, cy, 15, 6, 46, drum);
  s.cylV(cx, cy, 11, 46, 52, (f) => {
    darkPaint(f, 0.45, 76);
    if (f.tag === TAG.CYL_TOP && Math.hypot(f.u, f.v) > 10) f.alb += 0.2;
    return true;
  });
  // Calibration crown: four posts around a glass core, capped by a ring.
  for (let k = 0; k < 4; k++) {
    const a = (k / 4) * Math.PI * 2 + Math.PI / 4;
    s.cylV(cx + Math.cos(a) * 7.5, cy + Math.sin(a) * 7.5, 1.2, 52, 60, (f) => {
      steel(f, 0.66, 77);
      return true;
    }, false);
  }
  s.cylV(cx, cy, 3.2, 52, 61, (f) => {
    f.mat = M.GLASS;
    f.alb = f.tag === TAG.CYL_TOP ? 0.5 : 0.32 + (f.v % 3 < 1 ? 0.12 : 0);
    return true;
  });
  s.cylV(cx, cy, 9, 60, 61.5, (f) => {
    steel(f, 0.6, 78);
    if (f.tag === TAG.CYL_TOP) {
      const r = Math.hypot(f.u, f.v);
      if (r < 6.5) return false;
      if (r > 8.2) f.alb += 0.2;
    }
    return true;
  });
  // Front-left feed pipe.
  s.cylV(x0 + 4, y1 - 4, 2, 6, 40, (f) => {
    darkPaint(f, 0.48, 79);
    if (seam(f.tag === TAG.CYL_SIDE ? f.v : 0, 10, 1)) f.alb += 0.15;
    return true;
  });
  // Gauge box on the front.
  s.box(86, 96, 12, 106, 101, 26, (f) => {
    darkPaint(f, 0.5, 79);
    if (f.tag === FACE.LEFT) {
      for (const [gu, gv] of [
        [5.5, 7.5],
        [14.5, 7.5],
      ]) {
        const r = Math.hypot(f.u - gu, f.v - gv);
        if (r < 4) {
          f.mat = M.PAPER;
          f.alb = r > 3.2 ? 0.3 : 0.72;
          // Needle (at rest).
          const a = Math.atan2(f.v - gv, f.u - gu);
          if (r < 3 && Math.abs(a - 2.4) < 0.25) f.alb = 0.15;
          return true;
        }
      }
      if (stencil(f, 'M-3', 7, 13.5)) {
        f.alb = 0.9;
        return true;
      }
    }
    bevel(f, 0.24);
    return true;
  });
  // Control box on the front-left corner.
  s.box(76, 92, 8, 84, 102, 30, (f) => {
    darkPaint(f, 0.46, 80);
    if (f.tag === FACE.LEFT) {
      if (inRect(f, 3, 12, 18, 5)) {
        f.alb = 0.2;
        const k = Math.floor((f.u - 3) / 3);
        if (k >= 0 && k < 6 && (f.u - 3) % 3 < 2 && f.v > 13 && f.v < 16) {
          f.mat = M.STEEL;
          f.alb = 0.75;
        }
        return true;
      }
      if (inRect(f, 3, 5, 18, 4)) {
        f.mat = M.GLASS;
        f.alb = 0.18;
        return true;
      }
    }
    bevel(f, 0.24);
    return true;
  });
  return s;
}

export const MACHINE_SLOT = { cx: 96, cy: 80, r: 15.05, z0: 23, z1: 28 };
export const MACHINE_LAMPS = { x0: 76 + 3, y: 102.02, z: 8 + 7 };

/** Transformer TR-1 – the big foreground block the player can walk behind. */
export function buildTransformer(): Surface {
  const s = surfaceFor(WZ.transformer, [[WZ.transformer[0], WZ.transformer[1], 0, WZ.transformer[3], WZ.transformer[4], 70]]);
  const [x0, y0, , x1, y1] = WZ.transformer;
  s.box(x0, y0, 0, x1, y1, 4, (f) => {
    darkPaint(f, 0.3, 81);
    bevel(f, 0.2);
    return true;
  });
  const tank: Shader = (f) => {
    darkPaint(f, 0.48, 82);
    if (f.tag === FACE.TOP) {
      bevel(f, 0.25);
      return true;
    }
    const u = f.u;
    const v = f.v;
    // Cooling fins.
    if (v > 6 && v < 40) {
      const m = ((u % 4) + 4) % 4;
      f.alb = m < 1 ? 0.66 : m < 2 ? 0.48 : 0.24;
      if (v < 7 || v > 39) f.alb = 0.3;
    }
    if (f.tag === FACE.LEFT) {
      if (inRect(f, 4, 41, 16, 6)) {
        f.mat = M.HAZARD;
        f.alb = 0.9;
        if (stencil(f, '10 KV', 5.5, 45.5)) f.alb = 0.12;
        return true;
      }
    }
    if (f.tag === FACE.RIGHT) {
      if (stencil(f, 'TR-1', 3, 47)) {
        f.alb = 0.95;
        return true;
      }
      if (inRect(f, 16, 42, 9, 5)) {
        f.mat = M.STEEL;
        f.alb = 0.7;
        if (seam(f.v, 1.5, 0.5)) f.alb = 0.45;
        return true;
      }
    }
    rustStreaks(f, 50, 0.3, 83);
    grime(f, 10, 84);
    bevel(f, 0.2);
    return true;
  };
  s.box(x0 + 3, y0 + 3, 4, x1 - 3, y1 - 3, 50, tank);
  s.box(x0 + 2, y0 + 2, 50, x1 - 2, y1 - 2, 53, (f) => {
    darkPaint(f, 0.42, 85);
    bevel(f, 0.3);
    return true;
  });
  // Conservator tank.
  s.pipe('x', x0 + 6, x1 - 6, y0 + 7, 58, 3.5, (f) => {
    darkPaint(f, f.tag === TAG.PIPE_CAP ? 0.4 : 0.52, 86);
    if (f.tag === TAG.PIPE && seam(f.u, 10, 1)) f.alb += 0.12;
    return true;
  });
  s.box(x0 + 10, y0 + 6, 53, x0 + 12, y0 + 8, 55, (f) => {
    darkPaint(f, 0.4, 87);
    return true;
  });
  s.box(x1 - 12, y0 + 6, 53, x1 - 10, y0 + 8, 55, (f) => {
    darkPaint(f, 0.4, 87);
    return true;
  });
  // Ceramic bushings.
  for (const bx of [x0 + 12, x0 + 22, x0 + 32]) {
    s.cylV(bx, y0 + 21, 2.4, 53, 63, (f) => {
      f.mat = M.PAPER;
      const ring = ((Math.floor(f.v) % 2) + 2) % 2 === 0;
      f.alb = f.tag === TAG.CYL_TOP ? 0.6 : ring ? 0.72 : 0.42;
      return true;
    });
    s.cylV(bx, y0 + 21, 1.2, 63, 65, (f) => {
      f.mat = M.COPPER;
      f.alb = 0.75;
      return true;
    });
  }
  return s;
}

/** Workbench with the maintenance log. */
export function buildBench(): Surface {
  const s = surfaceFor(WZ.bench);
  const [x0, y0, , x1, y1] = WZ.bench;
  const leg: Shader = (f) => {
    darkPaint(f, 0.45, 91);
    bevel(f, 0.2);
    return true;
  };
  for (const lx of [x0 + 1, x1 - 3]) for (const ly of [y0 + 1, y1 - 3]) s.box(lx, ly, 0, lx + 2, ly + 2, 18, leg);
  s.box(x0 + 1, y0 + 1, 5, x1 - 1, y1 - 1, 6.5, (f) => {
    darkPaint(f, 0.4, 92);
    bevel(f, 0.15);
    return true;
  });
  s.box(x0 + 2, y0 + 3, 6.5, x0 + 10, y0 + 14, 11, (f) => {
    f.mat = M.RED_PAINT;
    f.alb = 0.45;
    bevel(f, 0.2);
    return true;
  });
  s.box(x0, y0, 18, x1, y1, 21, (f) => {
    f.mat = M.WOOD;
    f.alb = 0.58 + (fbm(f.u * 0.3, f.v * 0.08, 93, 2) - 0.5) * 0.16;
    if (f.tag === FACE.TOP && hash2(Math.floor(f.u), Math.floor(f.v), 94) > 0.94) f.alb -= 0.15;
    if (f.tag !== FACE.TOP) f.alb = 0.5;
    bevel(f, 0.22);
    return true;
  });
  // Open logbook.
  s.box(x0 + 5, y0 + 8, 21, x0 + 15, y0 + 21, 21.8, (f) => {
    f.mat = M.PAPER;
    f.alb = 0.85;
    if (f.tag === FACE.TOP) {
      if (Math.abs(f.v - f.h / 2) < 0.5) f.alb = 0.4;
      else if (Math.floor(f.u) % 2 === 0 && f.u > 1.5 && f.u < f.w - 1.5 && Math.abs(f.v - f.h / 2) > 1.5) f.alb = 0.55;
    } else f.alb = 0.5;
    return true;
  });
  // Mug.
  s.cylV(x0 + 12, y1 - 6, 1.6, 21, 25, (f) => {
    f.mat = M.STEEL;
    f.alb = f.tag === TAG.CYL_TOP ? (Math.hypot(f.u, f.v) < 1.1 ? 0.1 : 0.7) : 0.6;
    return true;
  });
  // Small toolbox.
  s.box(x0 + 2, y1 - 9, 21, x0 + 8, y1 - 2, 24.5, (f) => {
    f.mat = M.RED_PAINT;
    f.alb = 0.5;
    if (f.tag === FACE.TOP && Math.abs(f.u - f.w / 2) < 0.6) f.alb = 0.8;
    bevel(f, 0.2);
    return true;
  });
  return s;
}

/** Stacked transport crates by the door. */
export function buildCrates(): Surface {
  const s = surfaceFor(WZ.crates);
  const crate = (seed: number, label: string | null, sticker = false): Shader => (f) => {
    // Team_Aperture sticker on the side of the spare-parts crate.
    if (sticker && f.tag === FACE.RIGHT && emblemDecal(f, { variant: 'badge', u0: 5, vTop: 15.5, wear: 0.08, seed })) return true;
    f.mat = M.WOOD;
    f.alb = 0.48 + (fbm(f.u * 0.5, f.v * 0.08, seed, 2) - 0.5) * 0.14;
    const edge = f.u < 1.5 || f.u > f.w - 1.5 || f.v < 1.5 || f.v > f.h - 1.5;
    if (edge) {
      f.mat = M.STEEL;
      f.alb = 0.55;
    } else if (f.tag !== FACE.TOP && seam(f.v, 4, 0.6)) f.alb -= 0.16;
    if (label && f.tag === FACE.LEFT && stencil(f, label, 3, f.h - 4)) {
      f.mat = M.PAPER;
      f.alb = 0.2;
    }
    bevel(f, 0.2);
    return true;
  };
  s.box(166, 6, 0, 190, 32, 16, crate(101, 'ERSATZ', true));
  s.box(170, 10, 16, 186, 27, 28, crate(102, null));
  return s;
}

/** Wall fan; `frame` rotates the blades (4 frames per quarter turn). */
export function buildFan(frame: number): Surface {
  const s = surfaceFor(WZ.fan);
  const [, y0, z0, x1, y1, z1] = WZ.fan;
  const rot = (frame / 4) * (Math.PI / 2);
  s.box(0, y0, z0, x1, y1, z1, (f) => {
    darkPaint(f, 0.4, 111);
    if (f.tag !== FACE.RIGHT) {
      bevel(f, 0.25);
      return true;
    }
    const cu = f.u - f.w / 2;
    const cv = f.v - f.h / 2;
    const r = Math.hypot(cu, cv);
    if (r < 10.5) {
      if (Math.abs(r - 10) < 0.6 || Math.abs(r - 6.5) < 0.4) {
        f.mat = M.STEEL;
        f.alb = 0.62;
        return true;
      }
      if (Math.abs(cu) < 0.4 || Math.abs(cv) < 0.4) {
        f.mat = M.STEEL;
        f.alb = 0.5;
        return true;
      }
      if (r < 2) {
        f.mat = M.STEEL;
        f.alb = 0.7;
        return true;
      }
      const a = Math.atan2(cv, cu) + rot;
      const t = (((a / (Math.PI * 2)) * 4) % 1 + 1) % 1;
      if (t < 0.4) {
        f.mat = M.STEEL;
        f.alb = 0.3 + t * 0.6;
      } else {
        f.mat = M.STEEL_DARK;
        f.alb = 0.05;
      }
      return true;
    }
    for (const [bu, bv] of [
      [2, 2],
      [f.w - 2, 2],
      [2, f.h - 2],
      [f.w - 2, f.h - 2],
    ]) {
      if (Math.hypot(f.u - bu, f.v - bv) < 0.8) f.alb += 0.3;
    }
    bevel(f, 0.25);
    return true;
  });
  return s;
}

/** Hanging lamp fixture with cable. `on` lights the bulb (emissive). */
export function buildHangingLamp(lx: number, ly: number, lz: number, on: boolean): Surface {
  const s = Surface.forBoxes([[lx - 7, ly - 7, lz - 3, lx + 7, ly + 7, lz + 64]]);
  s.cylV(lx, ly, 0.5, lz + 8, lz + 64, (f) => {
    f.mat = M.RUBBER;
    f.alb = 0.3;
    return true;
  }, false);
  s.cylV(lx, ly, 2, lz + 5, lz + 8, (f) => {
    darkPaint(f, 0.5, 121);
    return true;
  });
  // Conical shade approximated by stacked rings.
  for (let i = 0; i < 4; i++) {
    const r = 6 - i * 1.1;
    s.cylV(lx, ly, r, lz + i * 1.3, lz + (i + 1) * 1.3, (f) => {
      steel(f, 0.5 + i * 0.05, 122);
      if (i === 0 && f.v < 0.8) f.alb += 0.2;
      return true;
    }, i === 3);
  }
  s.cylV(lx, ly, 2.4, lz - 2, lz, (f) => {
    f.mat = M.PAPER;
    f.alb = 0.4;
    if (on) f.emi = f.tag === TAG.CYL_TOP ? C.WHITE : f.v < 1 ? C.PEACH : C.WHITE;
    return true;
  }, false);
  return s;
}

/** Wall-mounted floodlight; `axis` is the wall it hangs on ('x' = right wall y=0, 'y' = left wall x=0). */
export function buildWallLamp(b: Box3, axis: 'x' | 'y', on: boolean): Surface {
  const s = surfaceFor(b, [[b[0], b[1], b[2] - 4, b[3], b[4], b[5]]]);
  const [x0, y0, z0, x1, y1, z1] = b;
  s.box(x0, y0, z0, x1, y1, z1, (f) => {
    darkPaint(f, 0.42, 131);
    const front = (axis === 'x' && f.tag === FACE.LEFT) || (axis === 'y' && f.tag === FACE.RIGHT);
    if (front && f.u > 1 && f.u < f.w - 1 && f.v > 1 && f.v < f.h - 1) {
      f.mat = M.PAPER;
      f.alb = 0.35;
      if (on) f.emi = (Math.floor(f.u) + Math.floor(f.v)) % 3 === 0 ? C.PEACH : C.WHITE;
      return true;
    }
    bevel(f, 0.25);
    return true;
  });
  // Bracket down to the wall.
  if (axis === 'x') s.box((x0 + x1) / 2 - 1, 0, z0 - 4, (x0 + x1) / 2 + 1, 2, z0, (f) => (darkPaint(f, 0.4, 132), true));
  else s.box(0, (y0 + y1) / 2 - 1, z0 - 4, 2, (y0 + y1) / 2 + 1, z0, (f) => (darkPaint(f, 0.4, 132), true));
  return s;
}

// ---------------------------------------------------------------------------
// Lighting
// ---------------------------------------------------------------------------

const OCC: Occluder[] = [
  { id: 1, x0: 26, y0: 2, z0: 0, x1: 56, y1: 20, z1: 42 },
  { id: 2, x0: 73, y0: 0, z0: 12, x1: 103, y1: 8, z1: 54 },
  { id: 3, x0: 0, y0: 22, z0: 0, x1: 15, y1: 62, z1: 42 },
  { id: 4, x0: 81, y0: 65, z0: 0, x1: 111, y1: 95, z1: 52 },
  { id: 5, x0: WZ.transformer[0] + 3, y0: WZ.transformer[1] + 3, z0: 0, x1: WZ.transformer[3] - 3, y1: WZ.transformer[4] - 3, z1: 53 },
  { id: 6, x0: 0, y0: 124, z0: 18, x1: 20, y1: 156, z1: 21 },
  { id: 7, x0: 166, y0: 6, z0: 0, x1: 190, y1: 32, z1: 16 },
  { id: 8, x0: 120, y0: 0, z0: 0, x1: 127, y1: 7, z1: 58 },
  { id: 9, x0: 157, y0: 0, z0: 0, x1: 164, y1: 7, z1: 58 },
];

export const OCCLUDER_ID = {
  terminal: 1,
  panel: 2,
  shelf: 3,
  machine: 4,
  transformer: 5,
  bench: 6,
  crates: 7,
  door: 8,
} as const;

const spot = (inner: number, outer: number) => ({ dx: 0, dy: 0, dz: -1, inner: Math.cos((inner * Math.PI) / 180), outer: Math.cos((outer * Math.PI) / 180) });

const termLight: Light = { x: 42, y: 24, z: 30, radius: 84, intensity: 1.05, hue: 'green', wrap: 0.45 };
const doorLight = (hue: Light['hue'], intensity: number): Light => ({ x: 142, y: 12, z: 60, radius: 54, intensity, hue, wrap: 0.3 });
const lampLight = (p: { x: number; y: number; z: number }, intensity: number): Light => ({
  x: p.x,
  y: p.y,
  z: p.z - 3,
  radius: 170,
  intensity,
  hue: 'neutral',
  spot: spot(28, 62),
  shadows: true,
  wrap: 0.15,
});
const flood = (x: number, y: number, z: number, dx: number, dy: number, dz: number, intensity: number): Light => {
  const l = Math.hypot(dx, dy, dz);
  return {
    x,
    y,
    z,
    radius: 190,
    intensity,
    hue: 'neutral',
    spot: { dx: dx / l, dy: dy / l, dz: dz / l, inner: Math.cos((30 * Math.PI) / 180), outer: Math.cos((72 * Math.PI) / 180) },
    shadows: true,
    wrap: 0.2,
  };
};
const fill = (x: number, y: number, z: number, i: number, hue: Light['hue'] = 'cold'): Light => ({ x, y, z, radius: 140, intensity: i, hue, wrap: 0.6 });

export const LIGHTING: Record<string, LightingState> = {
  dark: {
    id: 'dark',
    ambient: 0.22,
    occluders: OCC,
    lights: [termLight, doorLight('red', 0.85), lampLight(WZ.lampA, 1.7), fill(170, 170, 70, 0.3), fill(-20, 100, 60, 0.18)],
  },
  darkOff: {
    id: 'darkOff',
    ambient: 0.2,
    occluders: OCC,
    lights: [termLight, doorLight('red', 0.85), fill(170, 170, 70, 0.3), fill(-20, 100, 60, 0.18)],
  },
  lit: {
    id: 'lit',
    ambient: 0.34,
    occluders: OCC,
    lights: [
      termLight,
      doorLight('green', 0.9),
      lampLight(WZ.lampA, 1.55),
      flood(182, 8, 60, -0.35, 1, -0.9, 1.75),
      flood(8, 82, 60, 1, 0.1, -0.85, 1.6),
      { x: 96, y: 84, z: 26, radius: 70, intensity: 0.95, hue: 'amber', wrap: 0.5 },
      { x: 142, y: -20, z: 40, radius: 50, intensity: 0.9, hue: 'cold', wrap: 0.4 },
      { x: 172, y: 101, z: 66, radius: 40, intensity: 0.45, hue: 'amber', wrap: 0.5 },
      fill(210, 190, 80, 0.5),
    ],
  },
};

export { NO_EMI };
