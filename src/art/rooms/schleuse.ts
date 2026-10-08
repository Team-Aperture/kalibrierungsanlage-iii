/**
 * Art for Location 2 – "Hinter der Schleuse": the observation catwalk above the
 * machine hall. Colder light, depth fog in the pit, moving pistons, a large wall
 * fan below the walkway, and foreground I-beams that the walkway passes behind.
 */

import { SL } from '../../content/rooms/schleuse.layout';
import type { Box3 } from '../../content/rooms/wartungszelle.layout';
import { fbm, hash2, smoothstep, valueNoise } from '../../core/rng';
import type { Light, LightingState, Occluder } from '../light';
import { M } from '../materials';
import { C } from '../palette';
import { bevel, darkPaint, grime, hazard, inRect, rivets, rustStreaks, seam, stencil, steel, vent } from '../shaders';
import { FACE, Surface, TAG, type Shader } from '../surface';

const { L, Wd, H, PY, PD } = SL;

function surfaceFor(box: Box3, extra: Box3[] = [], pad = 2): Surface {
  return Surface.forBoxes([box, ...extra], pad);
}

// ---------------------------------------------------------------------------
// Background
// ---------------------------------------------------------------------------

const catwalkShader: Shader = (f) => {
  const x = f.x;
  const y = f.y;
  if (f.tag !== FACE.TOP) {
    darkPaint(f, 0.36, 301);
    if (f.v > f.h - 2) hazard(f, 6, 302);
    return true;
  }
  // Frame rails every 20 wu and along both edges; grating in between.
  const fx = ((x % 20) + 20) % 20;
  const rail = fx < 1.6 || y < 2 || y > Wd - 2.5;
  if (rail) {
    steel(f, 0.58, 303);
    if (fx < 0.7 || y < 0.8) f.alb -= 0.18;
    return true;
  }
  // Solid tread plate down the middle of the walkway, grating at the sides.
  if (y > 13 && y < 27) {
    steel(f, 0.52, 304);
    const d = ((Math.floor(x / 3) + Math.floor(y / 3)) % 2) * 0.05;
    f.alb += d + (hash2(Math.floor(x / 20), 1, 305) - 0.5) * 0.06;
    if (Math.abs(y - 13.5) < 0.6 || Math.abs(y - 26.5) < 0.6) f.alb = 0.28;
    return true;
  }
  // Grating: holes reveal the void below.
  const gx = ((x + y) % 3 + 3) % 3;
  const gy = ((x - y) % 3 + 3) % 3;
  if (gx < 1.4 && gy < 1.4) return false;
  steel(f, 0.46, 306);
  return true;
};

const backWallShader: Shader = (f) => {
  // +y face of the back wall, u = x, v = z + PD.
  const u = f.u;
  const z = f.z;
  const ex = SL.door2;
  if (u >= ex.open0 && u <= ex.open1 && z >= 0 && z < ex.openH) {
    darkPaint(f, 0.12, 330);
    return true;
  }
  if (z < -6) {
    // Below the walkway: heavy concrete-like steel, drips, the big fan.
    darkPaint(f, 0.4, 331);
    if (seam(u, 32, 1)) f.alb -= 0.12;
    if (Math.abs(z + 40) < 0.6) f.alb -= 0.12;
    const fan = SL.fan;
    const du = u - fan.cx;
    const dv = z - fan.cz;
    const r = Math.hypot(du, dv);
    if (r < fan.r + 4) {
      // Fan shroud ring (blades are an animated prop).
      f.mat = M.STEEL;
      f.alb = r > fan.r + 2.5 ? 0.3 : r > fan.r ? 0.62 : 0.05;
      return true;
    }
    rustStreaks(f, -6, 0.22, 332);
    f.alb *= 0.85 + fbm(u * 0.05, z * 0.05, 333, 2) * 0.3;
    return true;
  }
  // Upper wall.
  if (z < 5) {
    darkPaint(f, 0.4, 334);
    if (z > 4) f.alb += 0.2;
    return true;
  }
  if (z > 60 && z < 68) {
    steel(f, 0.6, 335);
    if (z < 61) f.alb -= 0.2;
    if (z > 67) f.alb += 0.2;
    if (stencil(f, 'BEOBACHTUNGSGANG B-0', 8, 66)) f.alb = 0.95;
    if (stencil(f, 'SCHLEUSE 0-2 >', 236, 66)) f.alb = 0.95;
    if (stencil(f, 'ABSTURZGEFAHR', 104, 66)) {
      f.mat = M.HAZARD;
      f.alb = 0.9;
    }
    return true;
  }
  if (z >= 68) {
    darkPaint(f, 0.34, 336);
    if (seam(u, 16, 1)) f.alb -= 0.08;
    rustStreaks(f, H, 0.1, 337);
    return true;
  }
  steel(f, 0.52, 338);
  const pu = ((u % 32) + 32) % 32;
  if (pu < 1) f.alb = 0.2;
  else if (pu < 2) f.alb += 0.12;
  if (Math.abs(z - 32) < 0.5) f.alb = 0.24;
  rivets(f, Math.round(u / 32) * 32 + 2.5, 6, 2);
  rustStreaks(f, 60, 0.16, 339);
  grime(f, 14, 340);
  // Clipboard on the wall (pick volume is separate).
  const cb = SL.clipboard;
  if (u >= cb[0] && u < cb[3] && z >= cb[2] && z < cb[5]) {
    f.mat = M.WOOD;
    f.alb = 0.5;
    if (u >= cb[0] + 1 && u < cb[3] - 1 && z >= cb[2] + 1 && z < cb[5] - 2) {
      f.mat = M.PAPER;
      f.alb = Math.floor(z) % 2 === 0 && u > cb[0] + 2 && u < cb[3] - 2 ? 0.55 : 0.85;
    }
    if (z >= cb[5] - 2) {
      f.mat = M.STEEL;
      f.alb = 0.75;
    }
    return true;
  }
  f.alb *= 0.92 + fbm(u * 0.03, z * 0.03, 341, 2) * 0.16;
  return true;
};

const leftWallShader: Shader = (f) => {
  // +x face of the left wall: u = PY − y, v = z + PD.
  const y = f.y;
  const z = f.z;
  const e = SL.entrance;
  if (y >= e.y0 && y <= e.y1 && z >= 0 && z < e.h) return false;
  if (z < -6) {
    darkPaint(f, 0.38, 351);
    if (seam(f.u, 40, 1)) f.alb -= 0.12;
    if (y > Wd + 4 && z > -60 && z < -30 && ((y - 60) % 46 + 46) % 46 < 20) {
      // Hall wall windows into blackness, with a faint cold reflection.
      f.mat = M.COLD;
      f.alb = (Math.floor(z) + Math.floor(y)) % 7 === 0 ? 0.32 : 0.08;
      return true;
    }
    rustStreaks(f, -6, 0.2, 352);
    return true;
  }
  if (y > Wd) {
    // Upper hall wall beyond the walkway.
    darkPaint(f, 0.36, 353);
    if (seam(f.u, 40, 1)) f.alb -= 0.1;
    if (Math.abs(z - 64) < 4) {
      steel(f, 0.55, 354);
      if (stencil(f, 'HALLE 0', PY - 150, 66)) f.alb = 0.95;
    }
    return true;
  }
  steel(f, 0.5, 355);
  if (seam(f.u, 24, 1)) f.alb = 0.22;
  if (Math.abs(z - 64) < 4) {
    steel(f, 0.6, 356);
    if (stencil(f, '0-1', PY - e.y1 + 6, 66)) f.alb = 0.95;
  }
  // Hazard frame around the entrance.
  if (y > e.y0 - 4 && y < e.y1 + 4 && z < e.h + 4) {
    hazard(f, 6, 357);
    if (Math.abs(y - e.y0 + 4) < 0.6 || Math.abs(y - e.y1 - 4) < 0.6 || Math.abs(z - e.h - 4) < 0.6) f.alb = 0.2;
  }
  grime(f, 12, 358);
  return true;
};

const pitFloorShader: Shader = (f) => {
  const x = f.x;
  const y = f.y;
  darkPaint(f, 0.44, 361);
  const px = ((x % 40) + 40) % 40;
  const py = ((y % 40) + 40) % 40;
  if (px < 1 || py < 1) f.alb = 0.18;
  f.alb *= 0.8 + fbm(x * 0.04, y * 0.04, 362, 3) * 0.4;
  // Small oily puddles that catch the hall lamps.
  const pd = valueNoise(x * 0.09, y * 0.09, 363) * 0.7 + valueNoise(x * 0.3, y * 0.3, 364) * 0.3;
  if (pd > 0.8) {
    f.mat = M.COLD;
    f.alb = 0.22 + (pd - 0.8) * 1.5;
    if (pd < 0.815) f.alb = 0.5;
  }
  // Floor drains and cable trenches.
  if (Math.abs(y - 128) < 3 && x > 6) {
    f.alb = ((Math.floor(x) % 3) === 0 ? 0.4 : 0.1);
  }
  return true;
};

const slabShader: Shader = (f) => {
  darkPaint(f, 0.3, 371);
  if (f.v > f.h - 2) hazard(f, 6, 372);
  return true;
};

const cutShader: Shader = (f) => {
  f.mat = M.STEEL_DARK;
  f.alb = ((((f.u + f.v) % 4) + 4) % 4) < 1 ? 0.42 : 0.2;
  bevel(f, 0.25);
  return true;
};

const pipeShader = (base: number, seed: number): Shader => (f) => {
  steel(f, base, seed);
  if (f.tag === TAG.PIPE && seam(f.u, 24, 1.5)) f.alb += 0.16;
  if (valueNoise(f.u * 0.3, f.v * 0.5, seed) > 0.75) {
    f.mat = M.RUST;
    f.alb = 0.5;
  }
  return true;
};

const tankShader: Shader = (f) => {
  if (f.tag === TAG.PIPE_CAP) {
    darkPaint(f, 0.46, 381);
    const r = Math.hypot(f.u, f.v);
    if (r > SL.tanks.r - 1.5) f.alb += 0.2;
    if (r < 3) f.alb += 0.15;
    return true;
  }
  darkPaint(f, 0.5, 382);
  if (seam(f.u, 24, 1.2)) f.alb += 0.2;
  if (f.v > 30 && f.v < 40 && f.u > 30 && f.u < 60) {
    f.mat = M.HAZARD;
    f.alb = 0.8;
    if (stencil(f, 'DRUCK', 34, 38)) f.alb = 0.15;
  }
  return true;
};

export function buildBackground(): Surface {
  const e = SL.entrance;
  const s = Surface.forBoxes([
    [-8, -8, -PD - 8, L + 2, PY, H + 2],
    [-24, e.y0, 0, 0, e.y1, e.h],
  ]);
  // Pit floor and its slab edges.
  s.box(0, 0, -PD - 8, L, PY, -PD, pitFloorShader, 1);
  s.box(-8, 0, -PD - 8, L, PY, -PD, slabShader, 6);
  // Walls.
  s.box(-8, 0, -PD, 0, PY, H, leftWallShader, 4);
  s.box(0, -8, -PD, L, 0, H, backWallShader, 2);
  s.box(-8, 0, -PD, 0, PY, H, (f) => (darkPaint(f, 0.3, 391), bevel(f, 0.3), true), 1);
  s.box(0, -8, -PD, L, 0, H, (f) => (darkPaint(f, 0.3, 392), bevel(f, 0.3), true), 1);
  s.box(-8, -8, -PD, 0, 0, H, (f) => (darkPaint(f, 0.3, 393), true), 1);
  s.box(-8, PY - 0.01, -PD, 0, PY, H, cutShader, 2);
  s.box(L - 0.01, -8, -PD, L, 0, H, cutShader, 4);
  // Entrance recess (corridor back to the maintenance cell).
  s.quad({ x: -24, y: e.y0, z: 0 }, { x: 24, y: 0, z: 0 }, { x: 0, y: 0, z: e.h }, (f) => (darkPaint(f, 0.26, 394), true), FACE.LEFT);
  s.box(-24, e.y0, -1, 0, e.y1, 0, (f) => (darkPaint(f, 0.3, 395), seam(f.u, 8, 1) && (f.alb -= 0.1), true), 1);
  s.quad({ x: -24, y: e.y1, z: 0 }, { x: 0, y: e.y0 - e.y1, z: 0 }, { x: 0, y: 0, z: e.h }, (f) => (darkPaint(f, 0.22, 396), true), FACE.RIGHT);
  // Pipes along the back wall above the walkway and deep below it.
  s.pipe('x', 0, L, 4, 84, 3.5, pipeShader(0.5, 399));
  s.pipe('x', 0, L, 3, 90, 1.5, pipeShader(0.42, 400));
  s.pipe('x', 0, L, 5, -88, 4, pipeShader(0.4, 402));
  // Big pressure tanks in the hall.
  const t = SL.tanks;
  s.pipe('x', t.x0, t.x1, t.y, t.z, t.r, tankShader);
  s.pipe('x', t.x0, t.x1, t.y - 32, t.z, t.r, tankShader);
  for (const tx of [t.x0 + 16, t.x1 - 16]) {
    s.box(tx - 3, t.y - 46, -PD, tx + 3, t.y + 12, t.z - t.r + 2, (f) => (darkPaint(f, 0.36, 403), bevel(f, 0.2), true));
  }
  // Floor cables.
  s.pipe('x', 0, L, 120, -PD + 1.2, 1.2, pipeShader(0.3, 404), false);
  s.pipe('y', Wd, PY, 300, -PD + 1.5, 1.5, pipeShader(0.3, 405), false);
  return s;
}

/** The walkway (grating slab, struts, under-floor pipe) as a sorted prop above the wall fan. */
export const WALKWAY_BOX: Box3 = [0, 0, -40, L, Wd, 0];
export function buildWalkway(): Surface {
  const s = surfaceFor(WALKWAY_BOX);
  s.box(0, 0, -6, L, Wd, 0, catwalkShader);
  for (let x = 20; x < L; x += 40) {
    s.quad({ x: x - 1, y: 0, z: -34 }, { x: 2, y: 0, z: 0 }, { x: 0, y: Wd - 2, z: 28 }, (f) => (darkPaint(f, 0.42, 397), bevel(f, 0.2), true));
    s.box(x - 1.5, 0, -40, x + 1.5, 3, -30, (f) => (darkPaint(f, 0.4, 398), true));
  }
  s.pipe('x', 0, L, 6, -16, 4, pipeShader(0.44, 401));
  return s;
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export function buildRailing(): Surface {
  const [x0, y0, , x1, y1, z1] = SL.railing;
  const s = surfaceFor(SL.railing);
  const post: Shader = (f) => (steel(f, 0.6, 411), bevel(f, 0.2), true);
  for (let x = x0 + 4; x < x1; x += 16) s.box(x, y0 + 0.5, 0, x + 1.5, y0 + 2, z1, post);
  s.box(x1 - 1.5, y0 + 0.5, 0, x1, y0 + 2, z1, post);
  s.pipe('x', x0, x1, y0 + 1.25, z1 - 0.8, 0.9, (f) => {
    steel(f, 0.7, 412);
    return true;
  });
  s.pipe('x', x0, x1, y0 + 1.25, 6.5, 0.6, (f) => {
    steel(f, 0.55, 413);
    return true;
  });
  s.box(x0, y0, 0, x1, y1, 2.5, (f) => {
    hazard(f, 6, 414);
    return true;
  });
  return s;
}

/** End railing at the far end of the walkway. */
export function buildEndRailing(): Surface {
  const b: Box3 = [L - 2, 0, 0, L, Wd, 13];
  const s = surfaceFor(b);
  for (let y = 4; y < Wd; y += 12) s.box(L - 2, y, 0, L - 0.5, y + 1.5, 13, (f) => (steel(f, 0.6, 415), bevel(f, 0.2), true));
  s.pipe('y', 0, Wd, L - 1.25, 12.2, 0.9, (f) => (steel(f, 0.7, 416), true));
  s.pipe('y', 0, Wd, L - 1.25, 6.5, 0.6, (f) => (steel(f, 0.55, 417), true));
  return s;
}

/** Lattice gate across the walkway; `lift` 0…1 raises the grille into its header. */
export function buildGate(lift: number): Surface {
  const [x0, y0, , x1, y1, z1] = SL.gate;
  const s = surfaceFor(SL.gate, [[x0, y0, 0, x1, y1, z1 + 8]]);
  const post: Shader = (f) => {
    steel(f, 0.5, 421);
    if (f.tag !== FACE.TOP) hazard(f, 6, 422);
    bevel(f, 0.25);
    return true;
  };
  s.box(x0, y0, 0, x1, y0 + 3, z1, post);
  s.box(x0, y1 - 3, 0, x1, y1, z1, post);
  s.box(x0 - 1, y0, z1, x1 + 1, y1, z1 + 7, (f) => {
    darkPaint(f, 0.45, 423);
    if (f.tag === FACE.LEFT && stencil(f, 'B-0', 1, 6.5)) f.alb = 0.9;
    if (f.tag === FACE.RIGHT && stencil(f, 'SPERRE', 4, 6)) f.alb = 0.9;
    bevel(f, 0.3);
    return true;
  });
  const zb = lift * (z1 - 4);
  if (zb < z1 - 2) {
    // Grille: vertical and horizontal bars.
    const grille: Shader = (f) => {
      if (f.z > z1) return false;
      const yy = f.y - y0;
      const bar = seam(yy, 4, 1.2) || seam(f.z - zb, 6, 1.2) || f.z - zb < 2;
      if (!bar) return false;
      steel(f, 0.62, 424);
      if (f.z - zb < 2) hazard(f, 4, 425);
      return true;
    };
    s.box(x0 + 3, y0 + 3, zb, x1 - 3, y1 - 3, zb + z1, grille, 6);
  }
  return s;
}

/** Crank control box beside the gate; `crank` shows the inserted hand crank. */
export function buildGateBox(crank: boolean): Surface {
  const s = surfaceFor(SL.gateBox, [[SL.gateBox[0] - 2, 0, SL.gateBox[2], SL.gateBox[3], 16, SL.gateBox[5] + 2]]);
  const [x0, y0, z0, x1, y1, z1] = SL.gateBox;
  s.box(x0, y0, z0, x1, y1, z1, (f) => {
    steel(f, 0.5, 431);
    if (f.tag === FACE.LEFT) {
      if (inRect(f, 1, z1 - z0 - 6, 10, 4)) {
        f.mat = M.HAZARD;
        f.alb = 0.85;
        if (stencil(f, 'HAND', 2, z1 - z0 - 2.5)) f.alb = 0.15;
        return true;
      }
      const r = Math.hypot(f.u - 6, f.v - 7);
      if (r < 3) {
        f.alb = r < 1.3 ? 0.06 : 0.75;
        return true;
      }
      // Small gauge.
      const g = Math.hypot(f.u - 6, f.v - 12.5);
      if (g < 2) {
        f.mat = M.PAPER;
        f.alb = g > 1.5 ? 0.3 : 0.7;
        return true;
      }
    }
    bevel(f, 0.25);
    return true;
  });
  if (crank) {
    const cx = x0 + 6;
    const cz = z0 + 7;
    s.pipe('y', y1, y1 + 5, cx, cz, 0.8, (f) => (steel(f, 0.75, 432), true));
    s.box(cx - 0.8, y1 + 4.5, cz - 7, cx + 0.8, y1 + 6, cz + 0.8, (f) => (steel(f, 0.7, 433), true));
    s.pipe('y', y1 + 4, y1 + 9, cx, cz - 7, 1.2, (f) => {
      f.mat = M.RED_PAINT;
      f.alb = 0.6;
      return true;
    });
  }
  return s;
}

/** Steel locker: closed, open with the crank inside, or open and empty. */
export function buildLocker(state: 'closed' | 'crank' | 'empty'): Surface {
  const [x0, y0, z0, x1, y1, z1] = SL.locker;
  const s = surfaceFor(SL.locker, [[x0, y0, z0, x1, y1 + 18, z1]]);
  const body: Shader = (f) => {
    steel(f, 0.48, 441);
    if (f.tag === FACE.LEFT && state !== 'closed') {
      // Interior.
      if (f.u > 1 && f.u < f.w - 1 && f.v > 2 && f.v < f.h - 1) {
        darkPaint(f, 0.22, 442);
        if (Math.abs(f.v - 28) < 0.6) f.alb = 0.5;
        return true;
      }
    }
    if (f.tag === FACE.LEFT && state === 'closed') {
      if (vent(f, 4, 36, 12, 5, 2)) return true;
      if (Math.abs(f.u - 10) < 0.5) f.alb = 0.2;
      if (inRect(f, 14, 20, 1.5, 6)) f.alb = 0.85;
      if (inRect(f, 3, 30, 14, 4)) {
        f.mat = M.PAPER;
        f.alb = 0.7;
        if (stencil(f, 'SPIND 3', 3.5, 33.5)) f.alb = 0.2;
        return true;
      }
      rustStreaks(f, 36, 0.2, 443);
      grime(f, 10, 444);
    }
    bevel(f, 0.25);
    return true;
  };
  s.box(x0, y0, z0, x1, y1, z1, body);
  if (state !== 'closed') {
    // Shelf and a hard hat inside.
    s.box(x0 + 1.5, y0 + 1, 28, x1 - 1.5, y1 - 0.5, 29, (f) => (steel(f, 0.5, 445), true));
    s.cylV(x0 + 7, y0 + 6, 3.2, 29, 31.5, (f) => {
      f.mat = M.HAZARD;
      f.alb = f.tag === 11 ? 0.85 : 0.7;
      return true;
    });
    if (state === 'crank') {
      // Hand crank leaning in the locker (red grip).
      s.box(x0 + 12, y0 + 4, 3, x0 + 13.2, y0 + 5.2, 24, (f) => (steel(f, 0.78, 446), true));
      s.box(x0 + 12, y0 + 4, 21, x0 + 17, y0 + 5.2, 22.4, (f) => (steel(f, 0.78, 447), true));
      s.box(x0 + 16, y0 + 3.8, 14, x0 + 17.4, y0 + 5.4, 22, (f) => {
        f.mat = M.RED_PAINT;
        f.alb = 0.65;
        return true;
      });
    }
    // Swung-open door.
    s.quad({ x: x0, y: y1, z: z0 + 1 }, { x: 2, y: 17, z: 0 }, { x: 0, y: 0, z: z1 - z0 - 2 }, (f) => {
      steel(f, 0.52, 448);
      if (vent(f, 3, 34, 11, 5, 2)) return true;
      if (f.u < 1 || f.u > f.w - 1) f.alb -= 0.15;
      return true;
    });
  }
  return s;
}

/** Wall sensor with a lens (the eye is an overlay that follows the player). */
export function buildSensor(): Surface {
  const s = surfaceFor(SL.sensor, [[SL.sensor[0], 0, SL.sensor[2] - 4, SL.sensor[3], SL.sensor[4], SL.sensor[5]]]);
  const [x0, y0, z0, x1, y1, z1] = SL.sensor;
  s.box(x0 + 3, 0, z0 - 4, x1 - 3, 2, z0, (f) => (darkPaint(f, 0.4, 451), true));
  s.box(x0, y0, z0, x1, y1, z1, (f) => {
    darkPaint(f, 0.5, 452);
    if (f.tag === FACE.LEFT && inRect(f, 2, 1.5, 4, 3)) {
      f.mat = M.GLASS;
      f.alb = 0.15;
      return true;
    }
    bevel(f, 0.3);
    return true;
  });
  return s;
}
export const SENSOR_EYE = { x: SL.sensor[0] + 4, y: SL.sensor[4] + 0.02, z: SL.sensor[2] + 3 };

/** Terminal T-07 with a wide oscilloscope screen. */
export function buildTerminal07(): Surface {
  const s = surfaceFor(SL.terminal, [[SL.terminal[0], 0, 0, SL.terminal[3], 4, 70]]);
  const [x0, , , x1] = SL.terminal;
  s.box(x0 + 2, 4, 0, x1 - 2, 20, 18, (f) => {
    darkPaint(f, 0.44, 461);
    if (f.tag === FACE.LEFT) {
      if (vent(f, 3, 3, 10, 6, 2)) return true;
      if (inRect(f, 17, 8, 8, 5)) {
        f.mat = M.STEEL;
        f.alb = 0.68;
        if (stencil(f, 'T07', 17.5, 12.5)) f.alb = 0.2;
        return true;
      }
      for (let k = 0; k < 4; k++) {
        if (inRect(f, 3 + k * 3, 13, 1.5, 1.5)) {
          f.mat = M.GLASS;
          f.alb = 0.2;
          return true;
        }
      }
    }
    bevel(f, 0.24);
    return true;
  });
  s.box(x0 + 2, 1, 18, x1 - 2, 12, 40, (f) => {
    steel(f, 0.5, 462);
    if (f.tag === FACE.LEFT) {
      if (inRect(f, 3, 4, 22, 15)) {
        f.mat = M.GLASS;
        const cu = (f.u - 14) / 11;
        const cv = (f.v - 11.5) / 7.5;
        f.alb = 0.26 - (cu * cu + cv * cv) * 0.1;
        return true;
      }
      if (inRect(f, 2, 3, 24, 17)) {
        f.alb = 0.22;
        return true;
      }
    }
    bevel(f, 0.26);
    return true;
  });
  // Cable bundle up into the wall.
  for (const cx of [x0 + 8, x0 + 12]) s.cylV(cx, 2, 1, 40, 70, (f) => (f.mat = M.RUBBER, f.alb = 0.3, true), false);
  return s;
}
export const T07_SCREEN = { O: { x: SL.terminal[0] + 5, y: 12.02, z: 22 }, U: { x: 22, y: 0, z: 0 }, V: { x: 0, y: 0, z: 15 }, w: 22, h: 15 };

/** Sealed door "Schleuse 0-2" with a status display. */
export function buildDoor2(): Surface {
  const s = surfaceFor(SL.door2Box, [[SL.door2Box[0], 0, 0, SL.door2Box[3], 6, 58]]);
  const d = SL.door2;
  const jamb: Shader = (f) => {
    steel(f, 0.48, 471);
    if (f.tag === FACE.LEFT) hazard(f, 6, 472);
    bevel(f, 0.28);
    return true;
  };
  s.box(d.x0, 0, 0, d.open0, 5, d.openH, jamb);
  s.box(d.open1, 0, 0, d.x1, 5, d.openH, jamb);
  s.box(d.x0, 0, d.openH, d.x1, 5, 50, (f) => {
    steel(f, 0.5, 473);
    if (f.tag === FACE.LEFT && stencil(f, '0-2', 7, 6.5)) f.alb = 0.95;
    bevel(f, 0.3);
    return true;
  });
  s.box(d.x1 - 9, 2, 50, d.x1 - 5, 6, 54, (f) => {
    darkPaint(f, 0.4, 474);
    if (f.tag === FACE.LEFT && inRect(f, 1, 1, 2, 2)) {
      f.mat = M.GLASS;
      f.alb = 0.25;
      return true;
    }
    return true;
  });
  s.box(d.open0, -2, 0, d.open1, 2, d.openH, (f) => {
    steel(f, 0.44, 475);
    if (f.tag !== FACE.LEFT) return true;
    if (seam(f.u, 6, 1)) f.alb -= 0.12;
    if (inRect(f, 4, 24, 10, 6)) {
      f.mat = M.GLASS;
      f.alb = 0.2;
      return true;
    }
    if (f.v < 4) hazard(f, 6, 476);
    rustStreaks(f, 40, 0.3, 477);
    return true;
  });
  return s;
}

export function buildCrates2(): Surface {
  const s = surfaceFor(SL.crates);
  const [x0, y0, , x1, y1, z1] = SL.crates;
  s.box(x0, y0, 0, x1, y1, z1, (f) => {
    darkPaint(f, 0.46, 481);
    if (f.u < 1.2 || f.u > f.w - 1.2 || f.v < 1.2 || f.v > f.h - 1.2) f.alb += 0.15;
    if (f.tag === FACE.LEFT && stencil(f, 'KA', 6, 12)) {
      f.mat = M.HAZARD;
      f.alb = 0.8;
    }
    bevel(f, 0.2);
    return true;
  });
  return s;
}

/** Foreground I-beam column rising from the pit. */
export function buildColumn(b: Box3): Surface {
  const s = surfaceFor(b);
  s.box(b[0], b[1], b[2], b[3], b[4], b[5], (f) => {
    steel(f, 0.42, 491);
    if (f.tag === FACE.TOP) {
      bevel(f, 0.3);
      return true;
    }
    const flange = f.u < 2 || f.u > f.w - 2;
    if (!flange) f.alb -= 0.18;
    else if (f.u < 1 || f.u > f.w - 1) f.alb += 0.15;
    rivets(f, f.w / 2, 10, 4);
    if (seam(f.v, 48, 2)) {
      f.alb += 0.12;
    }
    rustStreaks(f, f.h, 0.15, 492);
    bevel(f, 0.15);
    return true;
  });
  return s;
}

export function buildGantry(): Surface {
  const b = SL.gantry;
  const s = surfaceFor(b);
  s.box(b[0], b[1], b[2], b[3], b[4], b[5], (f) => {
    steel(f, 0.44, 501);
    if (f.tag === FACE.LEFT) {
      const web = f.v > 1.5 && f.v < f.h - 1.5;
      if (web) f.alb -= 0.18;
      if (seam(f.u, 12, 1)) f.alb += 0.12;
      if (stencil(f, 'MAX 12 T', 50, f.h - 2)) {
        f.mat = M.HAZARD;
        f.alb = 0.85;
      }
    }
    bevel(f, 0.2);
    return true;
  });
  // Trolley with a hook block hanging down.
  const tx = 150;
  s.box(tx - 6, b[1] - 1, b[2] - 6, tx + 6, b[4] + 1, b[2], (f) => (darkPaint(f, 0.5, 502), bevel(f, 0.25), true));
  s.cylV(tx, 57, 0.5, 40, b[2] - 6, (f) => (steel(f, 0.6, 503), true), false);
  s.box(tx - 3, 54, 32, tx + 3, 60, 40, (f) => {
    f.mat = M.HAZARD;
    f.alb = 0.75;
    bevel(f, 0.2);
    return true;
  });
  return s;
}

/** Big wall fan below the walkway; 4 frames per quarter turn. */
export function buildBigFan(frame: number): Surface {
  const { cx, cz, r } = SL.fan;
  const b: Box3 = [cx - r, 0, cz - r, cx + r, 1.5, cz + r];
  const s = surfaceFor(b);
  const rot = (frame / 4) * (Math.PI / 3);
  s.quad({ x: cx - r, y: 1, z: cz - r }, { x: 2 * r, y: 0, z: 0 }, { x: 0, y: 0, z: 2 * r }, (f) => {
    const du = f.u - r;
    const dv = f.v - r;
    const d = Math.hypot(du, dv);
    if (d > r) return false;
    if (d < 4) {
      steel(f, 0.6, 511);
      if (d < 1.5) f.alb = 0.8;
      return true;
    }
    const a = Math.atan2(dv, du) + rot;
    const t = ((((a / (Math.PI * 2)) * 6) % 1) + 1) % 1;
    // Curved blades: twist with the radius.
    const tt = (t + d * 0.012) % 1;
    if (tt < 0.42) {
      f.mat = M.STEEL;
      f.alb = 0.28 + tt * 0.7;
      return true;
    }
    return false;
  });
  return s;
}

/** Hydraulic piston: housing in the pit and a rod at `ext` (0…1) extension. */
export function buildPiston(px: number, ext: number): Surface {
  const py = SL.pistonY;
  const top = -50;
  const b: Box3 = [px - 13, py - 13, -PD, px + 13, py + 13, top + 30];
  const s = surfaceFor(b);
  s.box(px - 13, py - 13, -PD, px + 13, py + 13, top - 6, (f) => {
    darkPaint(f, 0.46, 521);
    if (f.tag !== FACE.TOP && seam(f.v, 12, 1)) f.alb += 0.12;
    if (f.tag === FACE.LEFT && inRect(f, 6, 26, 14, 5)) {
      hazard(f, 6, 522);
      return true;
    }
    bevel(f, 0.24);
    return true;
  });
  s.cylV(px, py, 9, top - 6, top, (f) => {
    steel(f, 0.55, 523);
    if (f.tag === TAG.CYL_TOP && Math.hypot(f.u, f.v) > 8) f.alb += 0.2;
    return true;
  });
  const rodTop = top + 4 + ext * 22;
  s.cylV(px, py, 4.5, top, rodTop, (f) => {
    steel(f, 0.82, 524);
    if (f.tag === TAG.CYL_SIDE) f.alb += Math.cos(f.u / 4.5) * 0.1;
    return true;
  });
  s.cylV(px, py, 7, rodTop, rodTop + 4, (f) => {
    darkPaint(f, 0.5, 525);
    if (f.tag === TAG.CYL_TOP && Math.hypot(f.u, f.v) < 2) f.alb += 0.3;
    return true;
  });
  // Warning beacon housing on the corner (lamp is an overlay).
  s.cylV(px + 10, py + 10, 1.6, top - 6, top - 3, (f) => {
    f.mat = M.GLASS;
    f.alb = 0.2;
    return true;
  });
  return s;
}
export const PISTON_FRAMES = 8;
export function pistonExt(frame: number, phase: number): number {
  const t = ((frame / PISTON_FRAMES + phase) % 1) * Math.PI * 2;
  return 0.5 - 0.5 * Math.cos(t);
}

/** Industrial pendant lamp hanging over the hall. */
export function buildPendant(lx: number, ly: number, lz: number, on: boolean): Surface {
  const s = Surface.forBoxes([[lx - 9, ly - 9, lz - 3, lx + 9, ly + 9, 130]]);
  s.cylV(lx, ly, 0.6, lz + 6, 130, (f) => (f.mat = M.RUBBER, f.alb = 0.3, true), false);
  for (let i = 0; i < 4; i++) {
    const r = 8 - i * 1.6;
    s.cylV(lx, ly, r, lz + i * 1.5, lz + (i + 1) * 1.5, (f) => {
      darkPaint(f, 0.46 + i * 0.05, 531);
      if (i === 0 && f.v < 0.8) f.alb += 0.25;
      return true;
    }, i === 3);
  }
  s.cylV(lx, ly, 3.4, lz - 2.5, lz, (f) => {
    f.mat = M.PAPER;
    f.alb = 0.35;
    if (on) f.emi = f.tag === TAG.CYL_TOP ? C.WHITE : C.PEACH;
    return true;
  }, false);
  return s;
}
export const PENDANTS = [
  { x: 36, y: 112, z: 2 },
  { x: 276, y: 118, z: 2 },
];

/** Wall tube lamp above the walkway. */
export function buildTubeLamp(x: number, on: boolean): Surface {
  const b: Box3 = [x - 10, 0, 70, x + 10, 4, 74];
  const s = surfaceFor(b, [[x - 10, 0, 66, x + 10, 4, 74]]);
  s.box(b[0], b[1], b[2], b[3], b[4], b[5], (f) => {
    darkPaint(f, 0.44, 541);
    if (f.tag === FACE.LEFT && f.u > 1 && f.u < f.w - 1 && f.v > 0.8 && f.v < f.h - 0.8) {
      f.mat = M.PAPER;
      f.alb = 0.4;
      if (on) f.emi = Math.floor(f.u) % 5 === 0 ? C.S10 : C.WHITE;
      return true;
    }
    bevel(f, 0.25);
    return true;
  });
  s.box(x - 7, 0, 66, x - 6, 2, 70, (f) => (darkPaint(f, 0.4, 542), true));
  s.box(x + 6, 0, 66, x + 7, 2, 70, (f) => (darkPaint(f, 0.4, 542), true));
  return s;
}

// ---------------------------------------------------------------------------
// Lighting
// ---------------------------------------------------------------------------

const OCC: Occluder[] = [
  { id: 1, ...b2o(SL.locker) },
  { id: 2, ...b2o(SL.terminal) },
  { id: 3, ...b2o(SL.columns[0]) },
  { id: 4, ...b2o(SL.columns[1]) },
  { id: 5, ...b2o(SL.gantry) },
  { id: 6, x0: 0, y0: 0, z0: -6, x1: L, y1: Wd, z1: 0 },
  { id: 7, ...b2o(SL.crates) },
];

function b2o(b: Box3) {
  return { x0: b[0], y0: b[1], z0: b[2], x1: b[3], y1: b[4], z1: b[5] };
}

const tube = (x: number, i: number): Light => ({
  x,
  y: 8,
  z: 68,
  radius: 120,
  intensity: i,
  hue: 'cold',
  spot: { dx: 0, dy: 0.45, dz: -0.89, inner: Math.cos((35 * Math.PI) / 180), outer: Math.cos((80 * Math.PI) / 180) },
  shadows: true,
  wrap: 0.2,
});
const pendant = (p: { x: number; y: number; z: number }, i: number): Light => ({
  x: p.x,
  y: p.y,
  z: p.z - 3,
  radius: 200,
  intensity: i,
  hue: 'neutral',
  spot: { dx: 0, dy: 0, dz: -1, inner: Math.cos((30 * Math.PI) / 180), outer: Math.cos((65 * Math.PI) / 180) },
  shadows: true,
  wrap: 0.15,
});
const beacon = (x: number, i: number): Light => ({ x: x + 10, y: SL.pistonY + 10, z: -50, radius: 46, intensity: i, hue: 'red', wrap: 0.5 });

export const LIGHTING: Record<string, LightingState> = {
  hall: {
    id: 'hall',
    ambient: 0.27,
    occluders: OCC,
    fog: { z0: -10, z1: -PD, amount: 0.4 },
    lights: [
      ...SL.lamps.map((x) => tube(x, 1.6)),
      ...PENDANTS.map((p) => pendant(p, 2.1)),
      ...SL.pistons.map((x) => beacon(x, 0.75)),
      { x: 305, y: 10, z: 54, radius: 44, intensity: 0.8, hue: 'red', wrap: 0.4 },
      { x: 64, y: 14, z: -50, radius: 80, intensity: 0.9, hue: 'cold', wrap: 0.5 },
      { x: 70, y: 128, z: -70, radius: 90, intensity: 0.85, hue: 'amber', wrap: 0.5 },
      { x: 200, y: 230, z: 60, radius: 320, intensity: 0.38, hue: 'cold', wrap: 0.8 },
    ],
  },
  dark: {
    id: 'dark',
    ambient: 0.13,
    occluders: OCC,
    fog: { z0: -10, z1: -PD, amount: 0.65 },
    lights: [
      { x: 268, y: 26, z: 30, radius: 120, intensity: 1.45, hue: 'green', wrap: 0.45 },
      { x: 305, y: 10, z: 54, radius: 44, intensity: 0.85, hue: 'red', wrap: 0.4 },
      { x: 200, y: 230, z: 60, radius: 320, intensity: 0.2, hue: 'cold', wrap: 0.8 },
    ],
  },
};

export const BEACON_POS = SL.pistons.map((x) => ({ x: x + 10, y: SL.pistonY + 10, z: -50 }));

export { smoothstep };
