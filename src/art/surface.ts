/**
 * Iso G-buffer rasteriser.
 *
 * Objects are modelled from simple 3D primitives (quads, boxes, cylinders) in world
 * units. Each primitive is rasterised by inverse projection: for every screen pixel
 * we solve for the point on the primitive, run a material "shader" with face-local
 * coordinates, and store material, albedo, normal and world position in a G-buffer.
 * Lighting is applied later per lighting state (see light.ts), so one model can be
 * baked under several lighting conditions without re-rasterising.
 */

import type { Vec3 } from '../core/projection';

export interface Frag {
  /** Face-local coordinates in world units. For walls u runs left→right on screen, v upwards. */
  u: number;
  v: number;
  /** Face extents in world units. */
  w: number;
  h: number;
  /** World position of the sample. */
  x: number;
  y: number;
  z: number;
  /** Surface normal. */
  nx: number;
  ny: number;
  nz: number;
  /** Absolute screen pixel (for dither-aligned patterns). */
  px: number;
  py: number;
  /** Primitive tag supplied by the caller. */
  tag: number;
  /** Outputs. */
  mat: number;
  alb: number;
  emi: number;
}

/** A shader fills `f.mat`, `f.alb` and optionally `f.emi`. Return false to leave a hole. */
export type Shader = (f: Frag) => boolean;

export const NO_EMI = -1;

export class Surface {
  readonly w: number;
  readonly h: number;
  /** Screen coordinates of pixel (0, 0). */
  readonly ox: number;
  readonly oy: number;
  readonly mat: Uint8Array;
  readonly alb: Float32Array;
  readonly emi: Int16Array;
  readonly depth: Float32Array;
  readonly pos: Float32Array;
  readonly nrm: Float32Array;
  /** Occluder id that owns each pixel (to avoid self-shadowing). */
  readonly owner: Int16Array;
  ownerId = -1;
  private readonly f: Frag;

  constructor(ox: number, oy: number, w: number, h: number) {
    this.ox = Math.floor(ox);
    this.oy = Math.floor(oy);
    this.w = Math.ceil(w);
    this.h = Math.ceil(h);
    const n = this.w * this.h;
    this.mat = new Uint8Array(n);
    this.alb = new Float32Array(n);
    this.emi = new Int16Array(n).fill(NO_EMI);
    this.depth = new Float32Array(n).fill(-Infinity);
    this.pos = new Float32Array(n * 3);
    this.nrm = new Float32Array(n * 3);
    this.owner = new Int16Array(n).fill(-1);
    this.f = {
      u: 0, v: 0, w: 0, h: 0, x: 0, y: 0, z: 0, nx: 0, ny: 0, nz: 0,
      px: 0, py: 0, tag: 0, mat: 0, alb: 0, emi: NO_EMI,
    };
  }

  /** Builds a surface large enough to contain the given world-space boxes. */
  static forBoxes(boxes: Array<[number, number, number, number, number, number]>, pad = 2): Surface {
    let sx0 = Infinity;
    let sy0 = Infinity;
    let sx1 = -Infinity;
    let sy1 = -Infinity;
    for (const [x0, y0, z0, x1, y1, z1] of boxes) {
      sx0 = Math.min(sx0, x0 - y1);
      sx1 = Math.max(sx1, x1 - y0);
      sy0 = Math.min(sy0, (x0 + y0) / 2 - z1);
      sy1 = Math.max(sy1, (x1 + y1) / 2 - z0);
    }
    const ox = Math.floor(sx0) - pad;
    const oy = Math.floor(sy0) - pad;
    return new Surface(ox, oy, Math.ceil(sx1) - ox + pad, Math.ceil(sy1) - oy + pad);
  }

  private write(i: number, f: Frag, depth: number): void {
    this.mat[i] = f.mat;
    this.alb[i] = f.alb;
    this.emi[i] = f.emi;
    this.depth[i] = depth;
    this.pos[i * 3] = f.x;
    this.pos[i * 3 + 1] = f.y;
    this.pos[i * 3 + 2] = f.z;
    this.nrm[i * 3] = f.nx;
    this.nrm[i * 3 + 1] = f.ny;
    this.nrm[i * 3 + 2] = f.nz;
    this.owner[i] = this.ownerId;
  }

  private prep(tag: number): Frag {
    const f = this.f;
    f.tag = tag;
    f.mat = 0;
    f.alb = 1;
    f.emi = NO_EMI;
    return f;
  }

  /**
   * Rasterises the parallelogram O + a·U + b·V (a, b ∈ [0, 1]).
   * u = a·|U| and v = b·|V| are passed to the shader.
   */
  quad(O: Vec3, U: Vec3, V: Vec3, shader: Shader, tag = 0, bias = 0): void {
    const sOx = O.x - O.y;
    const sOy = (O.x + O.y) / 2 - O.z;
    const sUx = U.x - U.y;
    const sUy = (U.x + U.y) / 2 - U.z;
    const sVx = V.x - V.y;
    const sVy = (V.x + V.y) / 2 - V.z;
    const det = sUx * sVy - sUy * sVx;
    if (Math.abs(det) < 1e-6) return;
    let nx = U.y * V.z - U.z * V.y;
    let ny = U.z * V.x - U.x * V.z;
    let nz = U.x * V.y - U.y * V.x;
    const nl = Math.hypot(nx, ny, nz) || 1;
    nx /= nl;
    ny /= nl;
    nz /= nl;
    if (nx + ny + nz < 0) {
      nx = -nx;
      ny = -ny;
      nz = -nz;
    }
    const lu = Math.hypot(U.x, U.y, U.z);
    const lv = Math.hypot(V.x, V.y, V.z);
    // Screen bounds of the parallelogram.
    const xs = [sOx, sOx + sUx, sOx + sVx, sOx + sUx + sVx];
    const ys = [sOy, sOy + sUy, sOy + sVy, sOy + sUy + sVy];
    const px0 = Math.max(0, Math.floor(Math.min(...xs) - this.ox) - 1);
    const px1 = Math.min(this.w - 1, Math.ceil(Math.max(...xs) - this.ox) + 1);
    const py0 = Math.max(0, Math.floor(Math.min(...ys) - this.oy) - 1);
    const py1 = Math.min(this.h - 1, Math.ceil(Math.max(...ys) - this.oy) + 1);
    const f = this.prep(tag);
    f.w = lu;
    f.h = lv;
    f.nx = nx;
    f.ny = ny;
    f.nz = nz;
    const E = 1e-4;
    for (let py = py0; py <= py1; py++) {
      const qy = this.oy + py + 0.5 - sOy;
      for (let px = px0; px <= px1; px++) {
        const qx = this.ox + px + 0.5 - sOx;
        const a = (qx * sVy - qy * sVx) / det;
        if (a < -E || a > 1 + E) continue;
        const b = (sUx * qy - sUy * qx) / det;
        if (b < -E || b > 1 + E) continue;
        const x = O.x + a * U.x + b * V.x;
        const y = O.y + a * U.y + b * V.y;
        const z = O.z + a * U.z + b * V.z;
        const d = x + y + z + bias;
        const i = py * this.w + px;
        if (d < this.depth[i]) continue;
        f.u = Math.min(lu, Math.max(0, a * lu));
        f.v = Math.min(lv, Math.max(0, b * lv));
        f.x = x;
        f.y = y;
        f.z = z;
        f.px = this.ox + px;
        f.py = this.oy + py;
        f.mat = 0;
        f.alb = 1;
        f.emi = NO_EMI;
        if (!shader(f) || f.mat === 0) continue;
        this.write(i, f, d);
      }
    }
  }

  /**
   * Axis-aligned box. Only the three faces visible from the camera are drawn.
   * Shader tags: FACE.TOP (u = x − x0, v = y − y0), FACE.LEFT (+y face, u = x − x0,
   * v = z − z0) and FACE.RIGHT (+x face, u = y1 − y, v = z − z0).
   */
  box(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, shader: Shader, faces = 7): void {
    const w = x1 - x0;
    const d = y1 - y0;
    const h = z1 - z0;
    if (faces & 1 && w > 0 && d > 0) {
      this.quad({ x: x0, y: y0, z: z1 }, { x: w, y: 0, z: 0 }, { x: 0, y: d, z: 0 }, shader, FACE.TOP);
    }
    if (faces & 2 && w > 0 && h > 0) {
      this.quad({ x: x0, y: y1, z: z0 }, { x: w, y: 0, z: 0 }, { x: 0, y: 0, z: h }, shader, FACE.LEFT);
    }
    if (faces & 4 && d > 0 && h > 0) {
      this.quad({ x: x1, y: y1, z: z0 }, { x: 0, y: -d, z: 0 }, { x: 0, y: 0, z: h }, shader, FACE.RIGHT);
    }
  }

  /** Vertical cylinder (side + top cap). Side shader: u = arc length, v = z − z0. Tag CYL_SIDE / CYL_TOP. */
  cylV(cx: number, cy: number, r: number, z0: number, z1: number, shader: Shader, cap = true): void {
    const scx = cx - cy;
    const f = this.prep(0);
    const rs = r * Math.SQRT2;
    const px0 = Math.max(0, Math.floor(scx - rs - this.ox) - 1);
    const px1 = Math.min(this.w - 1, Math.ceil(scx + rs - this.ox) + 1);
    for (let px = px0; px <= px1; px++) {
      const sx = this.ox + px + 0.5;
      const k = (sx - scx) / rs;
      if (k < -1 || k > 1) continue;
      const th = Math.acos(k) - Math.PI / 4;
      const c = Math.cos(th);
      const s = Math.sin(th);
      const x = cx + r * c;
      const y = cy + r * s;
      const pyA = Math.max(0, Math.floor((x + y) / 2 - z1 - this.oy) - 1);
      const pyB = Math.min(this.h - 1, Math.ceil((x + y) / 2 - z0 - this.oy) + 1);
      for (let py = pyA; py <= pyB; py++) {
        const sy = this.oy + py + 0.5;
        const z = (x + y) / 2 - sy;
        if (z < z0 || z > z1) continue;
        const dpt = x + y + z;
        const i = py * this.w + px;
        if (dpt < this.depth[i]) continue;
        f.tag = TAG.CYL_SIDE;
        f.u = (th + Math.PI) * r;
        f.v = z - z0;
        f.w = Math.PI * 2 * r;
        f.h = z1 - z0;
        f.x = x;
        f.y = y;
        f.z = z;
        f.nx = c;
        f.ny = s;
        f.nz = 0;
        f.px = this.ox + px;
        f.py = this.oy + py;
        f.mat = 0;
        f.alb = 1;
        f.emi = NO_EMI;
        if (!shader(f) || f.mat === 0) continue;
        this.write(i, f, dpt);
      }
    }
    if (cap) this.disc(cx, cy, z1, r, shader);
  }

  /** Horizontal disc at height z (top cap). Tag CYL_TOP; u/v = offset from centre. */
  disc(cx: number, cy: number, z: number, r: number, shader: Shader, tag: number = TAG.CYL_TOP): void {
    const f = this.prep(tag);
    const scx = cx - cy;
    const scy = (cx + cy) / 2 - z;
    const rs = r * Math.SQRT2;
    const px0 = Math.max(0, Math.floor(scx - rs - this.ox) - 1);
    const px1 = Math.min(this.w - 1, Math.ceil(scx + rs - this.ox) + 1);
    const py0 = Math.max(0, Math.floor(scy - rs / 2 - this.oy) - 1);
    const py1 = Math.min(this.h - 1, Math.ceil(scy + rs / 2 - this.oy) + 1);
    for (let py = py0; py <= py1; py++) {
      for (let px = px0; px <= px1; px++) {
        const sx = this.ox + px + 0.5;
        const sy = this.oy + py + 0.5;
        const s = sy + z;
        const x = s + sx / 2;
        const y = s - sx / 2;
        const dx = x - cx;
        const dy = y - cy;
        if (dx * dx + dy * dy > r * r) continue;
        const dpt = x + y + z;
        const i = py * this.w + px;
        if (dpt < this.depth[i]) continue;
        f.tag = tag;
        f.u = dx;
        f.v = dy;
        f.w = r;
        f.h = r;
        f.x = x;
        f.y = y;
        f.z = z;
        f.nx = 0;
        f.ny = 0;
        f.nz = 1;
        f.px = this.ox + px;
        f.py = this.oy + py;
        f.mat = 0;
        f.alb = 1;
        f.emi = NO_EMI;
        if (!shader(f) || f.mat === 0) continue;
        this.write(i, f, dpt);
      }
    }
  }

  /**
   * Horizontal cylinder (pipe). axis 'x': runs from a0 to a1 along x at (y = c1, z = c2).
   * axis 'y': runs along y at (x = c1, z = c2). The visible end cap (+x / +y) is drawn
   * when `cap` is set. Shader: u = position along the axis, v = angle·r. Tag PIPE / PIPE_CAP.
   */
  pipe(axis: 'x' | 'y', a0: number, a1: number, c1: number, c2: number, r: number, shader: Shader, cap = true): void {
    const f = this.prep(TAG.PIPE);
    const rs = r * Math.SQRT2;
    const bx0 = axis === 'x' ? a0 : c1 - r;
    const bx1 = axis === 'x' ? a1 : c1 + r;
    const by0 = axis === 'x' ? c1 - r : a0;
    const by1 = axis === 'x' ? c1 + r : a1;
    const qx0 = Math.max(0, Math.floor(bx0 - by1 - this.ox) - 1);
    const qx1 = Math.min(this.w - 1, Math.ceil(bx1 - by0 - this.ox) + 1);
    const qy0 = Math.max(0, Math.floor((bx0 + by0) / 2 - (c2 + r) - this.oy) - 1);
    const qy1 = Math.min(this.h - 1, Math.ceil((bx1 + by1) / 2 - (c2 - r) - this.oy) + 1);
    for (let py = qy0; py <= qy1; py++) {
      const sy = this.oy + py + 0.5;
      for (let px = qx0; px <= qx1; px++) {
        const sx = this.ox + px + 0.5;
        // Solve r(cosθ − sinθ) = K for the two candidate angles.
        const K = axis === 'x' ? sy - sx / 2 - c1 + c2 : sy + sx / 2 - c1 + c2;
        const k = K / rs;
        if (k < -1 || k > 1) continue;
        const ac = Math.acos(k);
        let bestD = -Infinity;
        let bx = 0;
        let by = 0;
        let bz = 0;
        let bth = 0;
        for (let sgn = -1; sgn <= 1; sgn += 2) {
          const th = sgn * ac - Math.PI / 4;
          const c = Math.cos(th);
          const s = Math.sin(th);
          let x: number;
          let y: number;
          const z = c2 + r * s;
          if (axis === 'x') {
            y = c1 + r * c;
            x = sx + y;
            if (x < a0 || x > a1) continue;
          } else {
            x = c1 + r * c;
            y = x - sx;
            if (y < a0 || y > a1) continue;
          }
          const d = x + y + z;
          if (d > bestD) {
            bestD = d;
            bx = x;
            by = y;
            bz = z;
            bth = th;
          }
        }
        if (bestD === -Infinity) continue;
        const i = py * this.w + px;
        if (bestD < this.depth[i]) continue;
        f.tag = TAG.PIPE;
        f.u = (axis === 'x' ? bx : by) - a0;
        f.v = ((bth + Math.PI * 2.25) % (Math.PI * 2)) * r;
        f.w = a1 - a0;
        f.h = Math.PI * 2 * r;
        f.x = bx;
        f.y = by;
        f.z = bz;
        const c = Math.cos(bth);
        const s = Math.sin(bth);
        f.nx = axis === 'x' ? 0 : c;
        f.ny = axis === 'x' ? c : 0;
        f.nz = s;
        f.px = this.ox + px;
        f.py = this.oy + py;
        f.mat = 0;
        f.alb = 1;
        f.emi = NO_EMI;
        if (!shader(f) || f.mat === 0) continue;
        this.write(i, f, bestD);
      }
    }
    if (cap) {
      // End cap at a1 facing +axis.
      const capShader: Shader = (g) => {
        const dy = axis === 'x' ? g.y - c1 : g.x - c1;
        const dz = g.z - c2;
        if (dy * dy + dz * dz > r * r) return false;
        g.tag = TAG.PIPE_CAP;
        g.u = dy;
        g.v = dz;
        return shader(g);
      };
      if (axis === 'x') {
        this.quad({ x: a1, y: c1 + r, z: c2 - r }, { x: 0, y: -2 * r, z: 0 }, { x: 0, y: 0, z: 2 * r }, capShader, TAG.PIPE_CAP);
      } else {
        this.quad({ x: c1 - r, y: a1, z: c2 - r }, { x: 2 * r, y: 0, z: 0 }, { x: 0, y: 0, z: 2 * r }, capShader, TAG.PIPE_CAP);
      }
    }
  }

  /** Writes a single world-space point (LEDs, rivets) if it is not hidden. */
  point(x: number, y: number, z: number, mat: number, alb: number, emi = NO_EMI, nx = 0, ny = 0, nz = 1, slack = 1.5): void {
    const px = Math.floor(x - y - this.ox);
    const py = Math.floor((x + y) / 2 - z - this.oy);
    if (px < 0 || py < 0 || px >= this.w || py >= this.h) return;
    const i = py * this.w + px;
    const d = x + y + z;
    if (d + slack < this.depth[i]) return;
    const f = this.f;
    f.mat = mat;
    f.alb = alb;
    f.emi = emi;
    f.x = x;
    f.y = y;
    f.z = z;
    f.nx = nx;
    f.ny = ny;
    f.nz = nz;
    this.write(i, f, Math.max(d, this.depth[i]));
  }

  /** Iterates over written pixels (post-processing passes). */
  forEach(cb: (i: number, px: number, py: number) => void): void {
    for (let py = 0; py < this.h; py++) {
      for (let px = 0; px < this.w; px++) {
        const i = py * this.w + px;
        if (this.mat[i]) cb(i, px, py);
      }
    }
  }
}

export const FACE = { TOP: 1, LEFT: 2, RIGHT: 3 } as const;
export const TAG = { CYL_SIDE: 10, CYL_TOP: 11, PIPE: 12, PIPE_CAP: 13 } as const;
