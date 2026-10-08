/**
 * WorldScene – renders and runs one room.
 *
 * Phaser's world coordinates are projected screen coordinates (sx, sy). Gameplay
 * (movement, collision, pathfinding, zones) runs in world units and is projected
 * for display. Props and the player are depth-sorted every frame from their world
 * boxes (see core/depthSort), so tall objects correctly hide the player standing
 * behind them while collision stays on the ground plane.
 */

import Phaser from 'phaser';
import type { CollisionWorld } from '../../core/collision';
import { DepthSorter, updateBounds, type SortBox, type Sortable } from '../../core/depthSort';
import { NavGrid } from '../../core/navgrid';
import { toScreen, toWorld, type Facing8, type Vec2, type Vec3 } from '../../core/projection';
import { bakedInfo } from '../../art/bake';
import { lightLevelAt } from '../../art/light';
import type { RoomId } from '../../state/types';
import type { GameApp } from '../app';
import { Player, PLAYER_RADIUS, type WalkResult } from '../entities/Player';
import { ROOMS } from '../rooms';
import type { PropDef, RoomDef, RoomHooks, Verb } from '../rooms/types';
import { ScriptCtx } from '../script';
import { Veil } from '../systems/veil';

interface Pt {
  x: number;
  y: number;
}

interface Attached {
  obj: Phaser.GameObjects.GameObject & Phaser.GameObjects.Components.Depth & Phaser.GameObjects.Components.Visible;
  offset: number;
}

export interface Entry extends Sortable {
  id: string;
  obj: Phaser.GameObjects.Image | Phaser.GameObjects.Sprite | null;
  base: string | null;
  attached: Attached[];
  prop?: PropDef;
  isPlayer?: boolean;
  hull: Pt[];
  depth: number;
}

export interface WorldSceneData {
  roomId: RoomId;
  arrival: string;
  attract?: boolean;
}

const DEPTH_BASE = 100;
const DEPTH_STEP = 10;

export function lit(base: string, light: string): string {
  return `${base}@${light}`;
}

function hullOf(box: SortBox): Pt[] {
  const pts: Pt[] = [];
  for (const x of [box.x0, box.x1]) for (const y of [box.y0, box.y1]) for (const z of [box.z0, box.z1]) {
    const s = toScreen(x, y, z);
    pts.push({ x: s.sx, y: s.sy });
  }
  pts.sort((a, b) => a.x - b.x || a.y - b.y);
  const cross = (o: Pt, a: Pt, b: Pt) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
  const lower: Pt[] = [];
  for (const p of pts) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) lower.pop();
    lower.push(p);
  }
  const upper: Pt[] = [];
  for (let i = pts.length - 1; i >= 0; i--) {
    const p = pts[i];
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) upper.pop();
    upper.push(p);
  }
  upper.pop();
  lower.pop();
  return lower.concat(upper);
}

function inHull(h: Pt[], x: number, y: number): boolean {
  if (h.length < 3) return false;
  let sign = 0;
  for (let i = 0; i < h.length; i++) {
    const a = h[i];
    const b = h[(i + 1) % h.length];
    const c = (b.x - a.x) * (y - a.y) - (b.y - a.y) * (x - a.x);
    if (c !== 0) {
      const s = c > 0 ? 1 : -1;
      if (sign === 0) sign = s;
      else if (s !== sign) return false;
    }
  }
  return true;
}

function hullDist(h: Pt[], x: number, y: number): number {
  if (inHull(h, x, y)) return 0;
  let best = Infinity;
  for (let i = 0; i < h.length; i++) {
    const a = h[i];
    const b = h[(i + 1) % h.length];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const t = Math.max(0, Math.min(1, ((x - a.x) * dx + (y - a.y) * dy) / (dx * dx + dy * dy || 1)));
    best = Math.min(best, Math.hypot(x - a.x - t * dx, y - a.y - t * dy));
  }
  return best;
}

export class WorldScene extends Phaser.Scene {
  app!: GameApp;
  room!: RoomDef;
  player!: Player;
  ctx!: ScriptCtx;
  veil!: Veil;
  collision!: CollisionWorld;
  nav!: NavGrid;
  attract = false;
  lightId = '';
  private arrival = 'start';
  private entries: Entry[] = [];
  private sorted: Entry[] = [];
  private sorter = new DepthSorter<Entry>();
  private propEntries = new Map<string, Entry>();
  private playerEntry!: Entry;
  private bg!: Phaser.GameObjects.Image;
  private hooks: RoomHooks = {};
  private locks = 0;
  private busy = false;
  private walkToken = 0;
  private focusId: string | null = null;
  private focusMarker!: Phaser.GameObjects.Image;
  private clickMarker!: Phaser.GameObjects.Sprite;
  private allMarkers: Phaser.GameObjects.Image[] = [];
  private showAllMarkers = false;
  private down: { x: number; y: number; t: number; right: boolean; touch: boolean; moved: boolean } | null = null;
  private longPressTimer: Phaser.Time.TimerEvent | null = null;
  private zonesInside = new Set<string>();
  private lightTimer = 0;
  private saveTimer = 0;
  private tmpMove = { x: 0, y: 0 };
  private ready = false;

  constructor() {
    super('world');
  }

  init(data: WorldSceneData): void {
    this.app = this.registry.get('app') as GameApp;
    this.room = ROOMS[data.roomId];
    this.arrival = data.arrival;
    this.attract = !!data.attract;
    this.entries = [];
    this.sorted = [];
    this.propEntries.clear();
    this.zonesInside.clear();
    this.locks = 0;
    this.busy = false;
    this.focusId = null;
    this.lightId = '';
    this.allMarkers = [];
    this.showAllMarkers = false;
    this.ready = false;
  }

  create(): void {
    const s = this.app.state;
    this.cameras.main.setBackgroundColor('#07080d');
    this.ctx = new ScriptCtx(this.app, this);

    // Background (floor + walls).
    const bgInfo = bakedInfo(lit(this.room.bg, this.firstLight()));
    this.bg = this.add.image(bgInfo.ox, bgInfo.oy, bgInfo.key).setOrigin(0, 0).setDepth(0);

    // Props.
    for (const prop of this.room.props) {
      const e: Entry = { id: prop.id, box: prop.box, obj: null, base: null, attached: [], prop, hull: hullOf(prop.interact?.pick ?? prop.box), depth: 0 };
      updateBounds(e);
      if (prop.texture) {
        const base = prop.texture(s);
        e.base = base;
        if (base) {
          const info = bakedInfo(lit(base, this.firstLight()));
          e.obj = this.add.image(info.ox, info.oy, info.key).setOrigin(0, 0);
        }
      }
      this.entries.push(e);
      this.propEntries.set(prop.id, e);
    }

    // Player.
    const arrival = this.room.arrivals[this.arrival] ?? this.room.arrivals.start;
    const useSaved = this.arrival === 'saved';
    const px = useSaved ? s.data.player.x : arrival.x;
    const py = useSaved ? s.data.player.y : arrival.y;
    const pf: Facing8 = useSaved ? s.data.player.facing : arrival.facing;
    this.player = new Player(this, px, py, pf);
    this.player.onStep = () => this.app.audio.sfx('step', { volume: 0.5 });
    this.playerEntry = { id: '__player', box: this.player.box, obj: this.player.sprite, base: null, attached: [], isPlayer: true, hull: [], depth: 0 };
    this.entries.push(this.playerEntry);
    if (this.attract) {
      this.player.sprite.setVisible(false);
      this.player.shadow.setVisible(false);
    }

    // Collision + navigation.
    this.collision = { bounds: this.room.bounds, solids: this.room.solids(s) };
    this.nav = new NavGrid(this.collision, PLAYER_RADIUS, 4);
    this.ensurePlayerFree();

    // Markers.
    this.focusMarker = this.add.image(0, 0, 'ui.marker').setOrigin(0.5, 1).setDepth(9500).setVisible(false);
    this.clickMarker = this.add.sprite(0, 0, 'ui.click', 0).setOrigin(0.5, 0.5).setDepth(7).setVisible(false);

    // Veil and lighting.
    this.veil = new Veil(this);
    this.applyLighting(this.firstLight(), true);

    // Camera.
    this.setupCamera();
    this.scale.on('resize', this.onResize, this);

    // Room-specific overlays and behaviour.
    this.hooks = this.room.setup?.(this.ctx) ?? {};

    // Input.
    this.setupPointer();

    this.events.once('shutdown', () => this.cleanup());
    this.app.sceneReady(this);
    this.ready = true;
    this.sortNow();
    if (!this.attract) {
      this.cameras.main.fadeIn(this.app.settings.reducedMotion ? 150 : 450, 7, 8, 13);
      void this.runEnter();
    }
  }

  private async runEnter(): Promise<void> {
    if (this.room.onEnter) {
      this.busy = true;
      try {
        await this.room.onEnter(this.ctx, this.arrival);
      } finally {
        this.busy = false;
      }
    }
    // Do not immediately re-trigger the zone we arrived in (unless it asks for it).
    for (const z of this.room.zones ?? []) if (!z.triggerOnSpawn && this.inRect(z.rect)) this.zonesInside.add(z.id);
  }

  private firstLight(): string {
    return this.room.lightingKey(this.app.state, this.time.now, this.app.settings);
  }

  private cleanup(): void {
    this.scale.off('resize', this.onResize, this);
    this.hooks.destroy?.();
    this.longPressTimer?.remove();
    this.player?.destroy();
    this.veil?.destroy();
    this.app.sceneGone(this);
  }

  // ---------------------------------------------------------------- camera

  private setupCamera(): void {
    const cam = this.cameras.main;
    this.updateCameraBounds();
    cam.setRoundPixels(true);
    if (this.attract) {
      const c = this.room.camera();
      cam.centerOn(c.x + c.w / 2, c.y + c.h / 2 - 10);
      return;
    }
    cam.centerOn(this.player.sprite.x, this.player.sprite.y - 16);
    cam.startFollow(this.player.sprite, true, this.followLerp(), this.followLerp(), 0, 16);
  }

  private followLerp(): number {
    return this.app.settings.reducedMotion ? 0.35 : 0.14;
  }

  private updateCameraBounds(): void {
    const cam = this.cameras.main;
    const c = this.room.camera();
    let { x, y, w, h } = c;
    if (w < cam.width) {
      x -= (cam.width - w) / 2;
      w = cam.width;
    }
    if (h < cam.height) {
      y -= (cam.height - h) / 2;
      h = cam.height;
    }
    cam.setBounds(Math.floor(x), Math.floor(y), Math.ceil(w), Math.ceil(h));
  }

  private onResize(size: Phaser.Structs.Size): void {
    this.cameras.main.setSize(size.width, size.height);
    this.updateCameraBounds();
    this.veil.resize(size.width, size.height);
    if (this.attract) {
      const c = this.room.camera();
      this.cameras.main.centerOn(c.x + c.w / 2, c.y + c.h / 2 - 10);
    }
  }

  cameraPanTo(p: Vec3, ms = 900): Promise<void> {
    const cam = this.cameras.main;
    cam.stopFollow();
    const s = toScreen(p.x, p.y, p.z);
    const dur = this.app.settings.reducedMotion ? 0 : ms;
    return new Promise((resolve) => {
      if (dur <= 0) {
        cam.centerOn(s.sx, s.sy);
        resolve();
        return;
      }
      cam.pan(s.sx, s.sy, dur, 'Sine.easeInOut', true, (_c: Phaser.Cameras.Scene2D.Camera, progress: number) => {
        if (progress >= 1) resolve();
      });
    });
  }

  async cameraFollowPlayer(ms = 700): Promise<void> {
    const p = this.player.sprite;
    await this.cameraPanTo(toWorldPoint(this.player.x, this.player.y, 16), ms);
    if (!p.active) return;
    this.cameras.main.startFollow(p, true, this.followLerp(), this.followLerp(), 0, 16);
  }

  // ---------------------------------------------------------------- lighting

  private applyLighting(id: string, force = false): void {
    if (id === this.lightId && !force) return;
    this.lightId = id;
    this.bg.setTexture(lit(this.room.bg, id));
    for (const e of this.entries) {
      if (e.obj && e.base && !e.isPlayer) e.obj.setTexture(lit(e.base, id));
    }
    this.updatePlayerLight();
  }

  /** Forces a lighting state (cutscenes); pass null to return to the room's rule. */
  overrideLight: string | null = null;

  private updatePlayerLight(): void {
    const st = this.room.lighting[this.lightId];
    if (!st) return;
    const l = lightLevelAt(st, this.player.x, this.player.y, 18).level;
    const idx = Math.max(0, Math.min(5, Math.round((l - 0.2) / 0.2)));
    this.player.setLightLevel(idx);
  }

  // ---------------------------------------------------------------- props

  /** Re-evaluates textures, collision and overlays from the world state. */
  refreshProps(): void {
    const s = this.app.state;
    for (const e of this.entries) {
      if (!e.prop?.texture) continue;
      const base = e.prop.texture(s);
      if (base === e.base) continue;
      e.base = base;
      if (!base) {
        e.obj?.setVisible(false);
        continue;
      }
      const info = bakedInfo(lit(base, this.lightId));
      if (!e.obj) e.obj = this.add.image(info.ox, info.oy, info.key).setOrigin(0, 0);
      else e.obj.setTexture(info.key).setPosition(info.ox, info.oy).setVisible(true);
    }
    this.collision.solids = this.room.solids(s);
    this.nav.rebuild(this.collision);
    this.hooks.refresh?.();
    this.app.ui.setStatus(this.room.status(s));
  }

  /** Sets the texture of a prop directly (animation frames in cutscenes). */
  setPropBase(id: string, base: string): void {
    const e = this.propEntries.get(id);
    if (!e) return;
    e.base = base;
    const info = bakedInfo(lit(base, this.lightId));
    if (!e.obj) e.obj = this.add.image(info.ox, info.oy, info.key).setOrigin(0, 0);
    else e.obj.setTexture(info.key).setPosition(info.ox, info.oy);
  }

  /** Attaches an overlay object so it is drawn just above a prop (keeps occlusion). */
  attach<T extends Attached['obj']>(propId: string, obj: T, offset = 1): T {
    const e = this.propEntries.get(propId);
    if (e) e.attached.push({ obj, offset });
    return obj;
  }

  /** Image placed at screen coordinates of a baked overlay. */
  addOverlay(key: string, ox: number, oy: number): Phaser.GameObjects.Image {
    return this.add.image(ox, oy, key).setOrigin(0, 0);
  }

  // ---------------------------------------------------------------- input

  lockInput(lock: boolean): void {
    this.locks = Math.max(0, this.locks + (lock ? 1 : -1));
    if (lock) this.player.cancelPath('cancelled');
  }

  get inputLocked(): boolean {
    return this.locks > 0 || this.attract || this.app.ui.blocking;
  }

  private setupPointer(): void {
    this.input.mouse?.disableContextMenu();
    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => {
      // Tapping the game view advances open dialogue (one-handed play on phones).
      if (this.app.ui.dialogue.open && !this.app.ui.hasModal) {
        this.app.ui.dialogue.advance();
        return;
      }
      if (this.inputLocked) return;
      this.app.audio.unlock();
      const touch = p.wasTouch;
      this.down = { x: p.worldX, y: p.worldY, t: this.time.now, right: p.rightButtonDown(), touch, moved: false };
      this.longPressTimer?.remove();
      if (touch) {
        this.longPressTimer = this.time.delayedCall(450, () => {
          if (!this.down || this.down.moved) return;
          const d = this.down;
          this.down = null;
          this.handleTap(d.x, d.y, true, true);
        });
      }
    });
    this.input.on('pointermove', (p: Phaser.Input.Pointer) => {
      if (this.down && Math.hypot(p.worldX - this.down.x, p.worldY - this.down.y) > 8) this.down.moved = true;
      if (!p.wasTouch && !this.inputLocked) {
        const e = this.pickAt(p.worldX, p.worldY, false);
        this.app.ui.hover(e?.prop?.interact?.name ?? null);
      }
    });
    this.input.on('pointerup', (p: Phaser.Input.Pointer) => {
      this.longPressTimer?.remove();
      const d = this.down;
      this.down = null;
      if (!d || this.inputLocked) return;
      if (d.moved && d.touch) return;
      this.handleTap(p.worldX, p.worldY, d.right, d.touch);
    });
    this.input.on('gameout', () => this.app.ui.hover(null));
  }

  private handleTap(wx: number, wy: number, look: boolean, touch: boolean): void {
    const pending = this.app.ui.pendingItem;
    const hit = this.pickAt(wx, wy, touch);
    if (pending) {
      this.app.ui.setPendingItem(null);
      if (hit?.prop) void this.useItemOn(hit.prop.id, pending);
      return;
    }
    if (hit?.prop) {
      void this.interact(hit.prop.id, look ? 'look' : undefined);
      return;
    }
    const w = toWorld(wx, wy);
    void this.walkTo(w.x, w.y, true);
  }

  /** Topmost interactive prop under a screen point, with a touch-friendly tolerance. */
  pickAt(wx: number, wy: number, touch: boolean): Entry | null {
    let best: Entry | null = null;
    for (let i = this.sorted.length - 1; i >= 0; i--) {
      const e = this.sorted[i];
      if (!this.isInteractive(e)) continue;
      if (inHull(e.hull, wx, wy)) {
        best = e;
        break;
      }
    }
    if (best) return best;
    const tol = touch ? 9 : 2;
    let bestD = tol;
    for (const e of this.entries) {
      if (!this.isInteractive(e)) continue;
      const d = hullDist(e.hull, wx, wy);
      if (d < bestD) {
        bestD = d;
        best = e;
      }
    }
    return best;
  }

  private isInteractive(e: Entry): boolean {
    const def = e.prop?.interact;
    if (!def) return false;
    return !def.enabled || def.enabled(this.app.state);
  }

  /** Screen position (CSS pixels relative to the canvas) of a world point – for tests and UI anchors. */
  worldToCanvas(p: Vec3): Vec2 {
    const s = toScreen(p.x, p.y, p.z);
    const cam = this.cameras.main;
    return { x: s.sx - cam.worldView.x, y: s.sy - cam.worldView.y };
  }

  // ---------------------------------------------------------------- walking & interacting

  walkTo(x: number, y: number, showMarker = false): Promise<WalkResult> {
    this.walkToken++;
    const res = this.nav.findPath({ x: this.player.x, y: this.player.y }, { x, y });
    if (!res || res.points.length === 0) {
      if (showMarker) this.showClickMarker(x, y, false);
      return Promise.resolve('stuck');
    }
    const end = res.points[res.points.length - 1];
    if (showMarker) {
      const near = Math.hypot(end.x - this.player.x, end.y - this.player.y) < 2;
      this.showClickMarker(res.reachedTarget ? end.x : x, res.reachedTarget ? end.y : y, res.reachedTarget || !near);
      if (!res.reachedTarget) this.showClickMarker(end.x, end.y, true, true);
    }
    return this.player.follow(res.points, !res.reachedTarget);
  }

  private showClickMarker(x: number, y: number, ok: boolean, quiet = false): void {
    const s = toScreen(x, y);
    this.clickMarker.setPosition(Math.round(s.sx), Math.round(s.sy)).setVisible(true).setFrame(ok ? 0 : 1).setAlpha(1);
    this.tweens.killTweensOf(this.clickMarker);
    this.tweens.add({ targets: this.clickMarker, alpha: 0, delay: ok ? 250 : 600, duration: 350, onComplete: () => this.clickMarker.setVisible(false) });
    if (!ok && !quiet) this.app.audio.sfx('deny', { volume: 0.5 });
  }

  private nearInteract(prop: PropDef): boolean {
    const def = prop.interact!;
    const reach = def.reach ?? 10;
    return def.points.some((p) => Math.hypot(p.x - this.player.x, p.y - this.player.y) <= reach);
  }

  private async walkToInteract(prop: PropDef): Promise<WalkResult> {
    const def = prop.interact!;
    const from = { x: this.player.x, y: this.player.y };
    let best: { pts: Vec2[]; len: number } | null = null;
    for (const p of def.points) {
      const r = this.nav.findPath(from, p);
      if (!r) continue;
      const end = r.points[r.points.length - 1] ?? from;
      const ok = r.reachedTarget || Math.hypot(end.x - p.x, end.y - p.y) <= (def.reach ?? 10) * 0.8;
      if (!ok) continue;
      let len = 0;
      let prev = from;
      for (const q of r.points) {
        len += Math.hypot(q.x - prev.x, q.y - prev.y);
        prev = q;
      }
      if (!best || len < best.len) best = { pts: r.points, len };
    }
    if (!best) return 'stuck';
    const res = await this.player.follow(best.pts, false);
    if (res === 'stuck' && this.nearInteract(prop)) return 'arrived';
    return res;
  }

  /** Runs a verb on a prop, walking there first if necessary. Duplicate activations are ignored. */
  async interact(propId: string, verbId?: string): Promise<void> {
    if (this.busy || this.inputLocked) return;
    const e = this.propEntries.get(propId);
    const def = e?.prop?.interact;
    if (!e || !def || !this.isInteractive(e)) return;
    const token = ++this.walkToken;
    if (!this.nearInteract(e.prop!)) {
      const r = await this.walkToInteract(e.prop!);
      if (token !== this.walkToken || r === 'cancelled') return;
      if (r !== 'arrived') {
        this.ctx.toast('Dorthin führt kein Weg.');
        this.app.audio.sfx('deny', { volume: 0.5 });
        return;
      }
    }
    if (this.busy || this.inputLocked) return;
    this.busy = true;
    try {
      this.player.faceTowards(def.hotspot.x, def.hotspot.y);
      const verbs = def.verbs(this.ctx);
      const verb: Verb | undefined = verbId ? verbs.find((v) => v.id === verbId) : verbs.find((v) => v.primary) ?? verbs[0];
      if (!verb) return;
      await verb.run(this.ctx);
      if (verb.id === 'look') this.app.state.markSeen(propId);
    } finally {
      this.busy = false;
      this.updateFocus(true);
    }
  }

  async useItemOn(propId: string, item: import('../../state/types').ItemId): Promise<void> {
    if (this.busy || this.inputLocked) return;
    const e = this.propEntries.get(propId);
    const def = e?.prop?.interact;
    if (!e || !def) return;
    const token = ++this.walkToken;
    if (!this.nearInteract(e.prop!)) {
      const r = await this.walkToInteract(e.prop!);
      if (token !== this.walkToken || r === 'cancelled') return;
      if (r !== 'arrived') {
        this.ctx.toast('Dorthin führt kein Weg.');
        return;
      }
    }
    if (this.busy) return;
    this.busy = true;
    try {
      this.player.faceTowards(def.hotspot.x, def.hotspot.y);
      const ok = def.onItem ? await def.onItem(this.ctx, item) : false;
      if (!ok) await this.ctx.say('Das passt hier nicht.');
    } finally {
      this.busy = false;
      this.updateFocus(true);
    }
  }

  /** Primary / look action from keyboard or the action bar. */
  focusAction(verbId?: string): void {
    if (!this.focusId) return;
    void this.interact(this.focusId, verbId);
  }

  get focusedProp(): string | null {
    return this.focusId;
  }

  /** Does the focused object accept this item right now? */
  focusAccepts(item: import('../../state/types').ItemId): boolean {
    const def = this.focusId ? this.propEntries.get(this.focusId)?.prop?.interact : undefined;
    return !!def?.accepts?.(this.app.state, item);
  }

  private updateFocus(force = false): void {
    if (this.attract) return;
    // Keep the current focus while an overlay (inventory, dialogue…) is open.
    if (this.inputLocked && !this.busy && !force) return;
    let best: string | null = null;
    let bestD = Infinity;
    {
      for (const e of this.entries) {
        if (!this.isInteractive(e)) continue;
        const def = e.prop!.interact!;
        const reach = (def.reach ?? 10) + 6;
        for (const p of def.points) {
          const d = Math.hypot(p.x - this.player.x, p.y - this.player.y);
          if (d <= reach && d < bestD) {
            bestD = d;
            best = e.id;
          }
        }
      }
    }
    if (best !== this.focusId || force) {
      this.focusId = best;
      if (best) {
        const def = this.propEntries.get(best)!.prop!.interact!;
        const verbs = def.verbs(this.ctx);
        this.app.ui.setFocus({ id: best, name: def.name, verbs: verbs.map((v) => ({ id: v.id, label: v.label, primary: !!v.primary })) });
      } else this.app.ui.setFocus(null);
    }
  }

  toggleMarkers(on?: boolean): void {
    this.showAllMarkers = on ?? !this.showAllMarkers;
    for (const m of this.allMarkers) m.destroy();
    this.allMarkers = [];
    if (!this.showAllMarkers) return;
    for (const e of this.entries) {
      if (!this.isInteractive(e)) continue;
      const h = e.prop!.interact!.hotspot;
      const s = toScreen(h.x, h.y, h.z);
      this.allMarkers.push(this.add.image(Math.round(s.sx), Math.round(s.sy), 'ui.marker.small').setOrigin(0.5, 1).setDepth(9400));
    }
  }

  wait(ms: number): Promise<void> {
    return new Promise((resolve) => this.time.delayedCall(ms, () => resolve()));
  }

  private inRect(r: { x0: number; y0: number; x1: number; y1: number }): boolean {
    return this.player.x >= r.x0 && this.player.x <= r.x1 && this.player.y >= r.y0 && this.player.y <= r.y1;
  }

  private ensurePlayerFree(): void {
    // A saved position could be inside a solid after a state change; nudge to the nearest free cell.
    const c = this.nav.cellOf(this.player.x, this.player.y);
    if (this.nav.isWalkableCell(c.c, c.r)) return;
    const near = this.nav.nearestReachable({ x: this.player.x, y: this.player.y }, this.player.x, this.player.y);
    if (near) {
      const p = this.nav.center(near.c, near.r);
      this.player.teleport(p.x, p.y);
    }
  }

  // ---------------------------------------------------------------- frame

  private sortNow(): void {
    for (const e of this.entries) if (e.isPlayer) updateBounds(e);
    this.sorter.sort(this.entries, this.sorted);
    let depth = DEPTH_BASE;
    for (const e of this.sorted) {
      e.depth = depth;
      e.obj?.setDepth(depth);
      for (const a of e.attached) a.obj.setDepth(depth + a.offset);
      depth += DEPTH_STEP;
    }
  }

  private updateGhost(): void {
    const idx = this.sorted.indexOf(this.playerEntry);
    const sx = this.player.sprite.x;
    const sy = this.player.sprite.y;
    const samples = [
      [sx, sy - 24],
      [sx, sy - 14],
      [sx - 3, sy - 6],
      [sx + 3, sy - 6],
    ];
    let hidden = 0;
    for (let i = idx + 1; i < this.sorted.length; i++) {
      const e = this.sorted[i];
      if (!e.prop?.tall || !e.obj?.visible) continue;
      for (const [x, y] of samples) if (inHull(e.hull, x, y)) hidden++;
    }
    this.player.ghost.setVisible(hidden >= 2 && this.player.sprite.visible);
  }

  override update(time: number, delta: number): void {
    if (!this.ready) return;
    const dt = Math.min(0.05, delta / 1000);
    const enabled = !this.inputLocked;
    if (!this.attract) {
      const input = this.app.input.moveVector(this.tmpMove);
      this.player.update(dt, input, this.collision, enabled || this.player.following);
      if (input.x !== 0 || input.y !== 0) this.app.ui.firstMove();
    }
    // Lighting (flicker) and the player's light level.
    const lid = this.overrideLight ?? this.room.lightingKey(this.app.state, time, this.app.settings);
    this.applyLighting(lid);
    this.lightTimer += dt;
    if (this.lightTimer > 0.12) {
      this.lightTimer = 0;
      this.updatePlayerLight();
    }
    this.hooks.update?.(dt, time);
    if (this.attract) this.attractDrift(time);
    this.sortNow();
    this.updateGhost();
    this.veil.update();

    if (!this.attract) {
      this.app.tick();
      this.updateFocus();
      this.updateFocusMarker(time);
      this.checkZones();
      this.saveTimer += dt;
      if (this.saveTimer > 4) {
        this.saveTimer = 0;
        this.app.state.setPlayer(this.player.x, this.player.y, this.player.facing);
        this.app.persist(true);
      }
    }
  }

  private updateFocusMarker(time: number): void {
    const show = this.focusId && !this.inputLocked && !this.busy;
    if (!show) {
      this.focusMarker.setVisible(false);
      return;
    }
    const h = this.propEntries.get(this.focusId!)!.prop!.interact!.hotspot;
    const s = toScreen(h.x, h.y, h.z);
    const bob = this.app.settings.reducedMotion ? 0 : Math.round(Math.sin(time / 260) * 1.2);
    this.focusMarker.setVisible(true).setPosition(Math.round(s.sx), Math.round(s.sy) - 2 + bob);
  }

  private checkZones(): void {
    if (this.busy || this.locks > 0) return;
    for (const z of this.room.zones ?? []) {
      const inside = this.inRect(z.rect) && z.active(this.app.state);
      if (inside && !this.zonesInside.has(z.id)) {
        this.zonesInside.add(z.id);
        this.busy = true;
        void z.enter(this.ctx).finally(() => (this.busy = false));
      } else if (!inside) this.zonesInside.delete(z.id);
    }
  }

  /** Menu backdrop: a slow, dim drift through the room. */
  private attractDrift(time: number): void {
    const c = this.room.camera();
    const rm = this.app.settings.reducedMotion;
    const t = rm ? 0 : time / 9000;
    const cx = c.x + c.w / 2 + Math.sin(t) * Math.min(60, c.w * 0.12);
    const cy = c.y + c.h / 2 - 10 + Math.sin(t * 0.7) * 14;
    this.cameras.main.centerOn(Math.round(cx), Math.round(cy));
    if (this.veil.alpha < 0.3) this.veil.alpha = 0.3;
  }

  savePlayer(): void {
    this.app.state.setPlayer(this.player.x, this.player.y, this.player.facing);
  }
}

function toWorldPoint(x: number, y: number, z: number): Vec3 {
  return { x, y, z };
}
