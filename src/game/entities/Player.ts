/**
 * Player controller: continuous movement in world space with light acceleration,
 * path following for click/tap-to-move, facing and animation selection.
 */

import Phaser from 'phaser';
import { moveWithCollision, type CollisionWorld } from '../../core/collision';
import type { SortBox } from '../../core/depthSort';
import { facingFromWorld, toScreen, worldDirFromScreen, type Facing8, type Vec2 } from '../../core/projection';
import { frameIndex, PLAYER_ANCHOR, PLAYER_H, PLAYER_W, type PlayerFacing } from '../../art/player';

export const PLAYER_RADIUS = 4.5;
export const PLAYER_HEIGHT = 28;
const SPEED = 54; // wu per second
const ACCEL = 520;
const ARRIVE = 1.2;

export type WalkResult = 'arrived' | 'partial' | 'cancelled' | 'stuck';

export class Player {
  x: number;
  y: number;
  facing: PlayerFacing;
  vx = 0;
  vy = 0;
  readonly sprite: Phaser.GameObjects.Sprite;
  readonly ghost: Phaser.GameObjects.Sprite;
  readonly shadow: Phaser.GameObjects.Image;
  readonly box: SortBox = { x0: 0, y0: 0, z0: 0, x1: 0, y1: 0, z1: PLAYER_HEIGHT };
  private path: Vec2[] | null = null;
  private pathResolve: ((r: WalkResult) => void) | null = null;
  private pathPartial = false;
  private stuckTimer = 0;
  private stuckRef = { x: 0, y: 0 };
  private animTime = 0;
  private lastFrame = -1;
  lightLevel = 3;
  onStep: (() => void) | null = null;
  private tmp = { x: 0, y: 0 };

  constructor(scene: Phaser.Scene, x: number, y: number, facing: Facing8) {
    this.x = x;
    this.y = y;
    this.facing = facing;
    this.shadow = scene.add.image(0, 0, 'player.shadow').setOrigin(0.5, 0.5).setDepth(6);
    this.sprite = scene.add.sprite(0, 0, 'player@3', 0).setOrigin(PLAYER_ANCHOR.x / PLAYER_W, PLAYER_ANCHOR.y / PLAYER_H);
    this.ghost = scene.add
      .sprite(0, 0, 'player.ghost', 0)
      .setOrigin(PLAYER_ANCHOR.x / PLAYER_W, PLAYER_ANCHOR.y / PLAYER_H)
      .setAlpha(0.42)
      .setDepth(8500)
      .setVisible(false);
    this.syncBox();
    this.syncSprite();
  }

  get moving(): boolean {
    return Math.hypot(this.vx, this.vy) > 4;
  }

  get following(): boolean {
    return this.path !== null;
  }

  /** Starts following a path; resolves when arrived, cancelled or stuck. */
  follow(points: Vec2[], partial: boolean): Promise<WalkResult> {
    this.cancelPath('cancelled');
    if (points.length === 0) return Promise.resolve(partial ? 'partial' : 'arrived');
    this.path = points.slice();
    this.pathPartial = partial;
    this.stuckTimer = 0;
    this.stuckRef = { x: this.x, y: this.y };
    return new Promise((resolve) => (this.pathResolve = resolve));
  }

  cancelPath(reason: WalkResult = 'cancelled'): void {
    if (!this.path) return;
    this.path = null;
    const r = this.pathResolve;
    this.pathResolve = null;
    r?.(reason);
  }

  face(f: Facing8): void {
    this.facing = f;
  }

  faceTowards(x: number, y: number): void {
    const dx = x - this.x;
    const dy = y - this.y;
    if (Math.hypot(dx, dy) > 0.5) this.facing = facingFromWorld(dx, dy);
  }

  /**
   * `input` is the screen-space direction from keys / joystick. Manual input always
   * overrides (and cancels) path following.
   */
  update(dt: number, input: { x: number; y: number }, world: CollisionWorld, enabled: boolean): void {
    let tx = 0;
    let ty = 0;
    const hasInput = enabled && (input.x !== 0 || input.y !== 0);
    if (hasInput) {
      this.cancelPath('cancelled');
      const mag = Math.min(1, Math.hypot(input.x, input.y));
      const dir = worldDirFromScreen(input.x, input.y);
      const s = SPEED * (mag < 0.99 ? Math.max(0.45, mag) : 1);
      tx = dir.x * s;
      ty = dir.y * s;
    } else if (enabled && this.path) {
      const target = this.path[0];
      const dx = target.x - this.x;
      const dy = target.y - this.y;
      const d = Math.hypot(dx, dy);
      if (d < ARRIVE) {
        this.path.shift();
        if (this.path.length === 0) {
          const partial = this.pathPartial;
          this.path = null;
          const r = this.pathResolve;
          this.pathResolve = null;
          this.vx *= 0.3;
          this.vy *= 0.3;
          r?.(partial ? 'partial' : 'arrived');
        }
      } else {
        // Slow down on the final approach so we do not overshoot.
        const last = this.path.length === 1;
        const s = last ? Math.min(SPEED, 14 + d * 6) : SPEED;
        tx = (dx / d) * s;
        ty = (dy / d) * s;
      }
      this.stuckTimer += dt;
      if (this.stuckTimer > 0.4) {
        const moved = Math.hypot(this.x - this.stuckRef.x, this.y - this.stuckRef.y);
        this.stuckTimer = 0;
        this.stuckRef = { x: this.x, y: this.y };
        if (moved < 0.6 && this.path) this.cancelPath('stuck');
      }
    } else if (!enabled) {
      this.cancelPath('cancelled');
    }
    // Accelerate towards the target velocity.
    const ax = tx - this.vx;
    const ay = ty - this.vy;
    const al = Math.hypot(ax, ay);
    const maxDv = ACCEL * dt;
    if (al <= maxDv) {
      this.vx = tx;
      this.vy = ty;
    } else {
      this.vx += (ax / al) * maxDv;
      this.vy += (ay / al) * maxDv;
    }
    if (Math.abs(this.vx) > 0.01 || Math.abs(this.vy) > 0.01) {
      const before = { x: this.x, y: this.y };
      moveWithCollision(world, this.x, this.y, this.vx * dt, this.vy * dt, PLAYER_RADIUS, this.tmp);
      this.x = this.tmp.x;
      this.y = this.tmp.y;
      // Blocked on an axis: drop that velocity component (no "pushing" into walls).
      if (Math.abs(this.x - before.x) < Math.abs(this.vx * dt) * 0.2) this.vx = 0;
      if (Math.abs(this.y - before.y) < Math.abs(this.vy * dt) * 0.2) this.vy = 0;
      if (hasInput || this.path) {
        const fx = tx !== 0 || ty !== 0 ? tx : this.vx;
        const fy = tx !== 0 || ty !== 0 ? ty : this.vy;
        if (Math.hypot(fx, fy) > 1) this.facing = facingFromWorld(fx, fy);
      }
    }
    this.animate(dt);
    this.syncBox();
    this.syncSprite();
  }

  private animate(dt: number): void {
    const speed = Math.hypot(this.vx, this.vy);
    let idx: number;
    if (speed > 6) {
      this.animTime += dt * (speed / SPEED) * 10;
      const f = Math.floor(this.animTime) % 6;
      idx = frameIndex(this.facing, 'walk', f);
      if (idx !== this.lastFrame && (f === 1 || f === 4)) this.onStep?.();
    } else {
      this.animTime += dt * 2.2;
      idx = frameIndex(this.facing, 'idle', Math.floor(this.animTime) % 4);
    }
    if (idx !== this.lastFrame) {
      this.sprite.setFrame(idx);
      this.ghost.setFrame(idx);
      this.lastFrame = idx;
    }
  }

  setLightLevel(level: number): void {
    if (level === this.lightLevel) return;
    this.lightLevel = level;
    this.sprite.setTexture(`player@${level}`, this.lastFrame < 0 ? 0 : this.lastFrame);
  }

  syncBox(): void {
    const r = PLAYER_RADIUS;
    this.box.x0 = this.x - r;
    this.box.x1 = this.x + r;
    this.box.y0 = this.y - r;
    this.box.y1 = this.y + r;
  }

  syncSprite(): void {
    const p = toScreen(this.x, this.y);
    const sx = Math.round(p.sx);
    const sy = Math.round(p.sy);
    this.sprite.setPosition(sx, sy);
    this.ghost.setPosition(sx, sy);
    this.shadow.setPosition(sx, sy);
  }

  teleport(x: number, y: number): void {
    this.x = x;
    this.y = y;
    this.vx = 0;
    this.vy = 0;
    this.cancelPath('cancelled');
    this.syncBox();
    this.syncSprite();
  }

  destroy(): void {
    this.cancelPath('cancelled');
    this.sprite.destroy();
    this.ghost.destroy();
    this.shadow.destroy();
  }
}
