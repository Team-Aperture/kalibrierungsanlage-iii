import type Phaser from 'phaser';
import type { Rect } from '../../core/collision';
import type { SortBox } from '../../core/depthSort';
import type { Facing8, Vec2, Vec3 } from '../../core/projection';
import type { LightingState } from '../../art/light';
import type { GameState } from '../../state/gameState';
import type { ItemId, RoomId, Settings } from '../../state/types';
import type { ScriptCtx } from '../script';

export interface Verb {
  id: string;
  label: string;
  /** Default action for tap / click / E. */
  primary?: boolean;
  run: (ctx: ScriptCtx) => Promise<void>;
}

export interface InteractDef {
  /** Display name (German). */
  name: string;
  /** Floor points from which the object can be used. */
  points: Vec2[];
  /** World position for the prompt marker. */
  hotspot: Vec3;
  /** Pick volume, defaults to the sort box. */
  pick?: SortBox;
  /** Distance from an interaction point that counts as "in reach". */
  reach?: number;
  verbs: (ctx: ScriptCtx) => Verb[];
  /** Using an inventory item on this object. Return false if it does not apply. */
  onItem?: (ctx: ScriptCtx, item: ItemId) => Promise<boolean>;
  /** Hidden objects are not interactive (e.g. not visible yet). */
  enabled?: (s: GameState) => boolean;
}

export interface PropDef {
  id: string;
  box: SortBox;
  /** Base texture key for the current state (null: not drawn, e.g. interaction-only). */
  texture: ((s: GameState) => string | null) | null;
  /** Additive / emissive overlays are attached by the room's setup hook. */
  tall?: boolean;
  /** Pure interaction volume baked into the background (wall scratches…). */
  embedded?: boolean;
  interact?: InteractDef;
}

export interface Arrival {
  x: number;
  y: number;
  facing: Facing8;
}

export interface Zone {
  id: string;
  rect: Rect;
  active: (s: GameState) => boolean;
  enter: (ctx: ScriptCtx) => Promise<void>;
  /** Fire even if the player is already standing inside when the room loads (resumed saves). */
  triggerOnSpawn?: boolean;
}

export interface RoomHooks {
  update?: (dt: number, time: number) => void;
  /** Called after any world-state change so overlays can follow. */
  refresh?: () => void;
  destroy?: () => void;
}

export interface RoomDef {
  id: RoomId;
  title: string;
  bounds: Rect;
  solids: (s: GameState) => Rect[];
  props: PropDef[];
  bg: string;
  lighting: Record<string, LightingState>;
  lightingKey: (s: GameState, time: number, settings: Settings) => string;
  arrivals: Record<string, Arrival>;
  /** Screen-space camera bounds. */
  camera: () => { x: number; y: number; w: number; h: number };
  status: (s: GameState) => string;
  zones?: Zone[];
  bake: (scene: Phaser.Scene, progress: (p: number) => void) => Promise<void>;
  setup?: (ctx: ScriptCtx) => RoomHooks;
  onEnter?: (ctx: ScriptCtx, arrival: string) => Promise<void>;
}
