/**
 * Script context handed to object verbs, zones and room scripts. It is the small,
 * stable API content is written against: dialogue, waiting, sound, camera moves,
 * walking and world-state changes.
 */

import type { Facing8, Vec3 } from '../core/projection';
import type { ItemId, RoomId } from '../state/types';
import type { GameApp } from './app';
import type { WorldScene } from './scenes/WorldScene';
import type { Line } from '../ui/dialogue';
import type { SfxName } from '../audio/audio';

export class ScriptCtx {
  constructor(
    readonly app: GameApp,
    readonly scene: WorldScene,
  ) {}

  get state() {
    return this.app.state;
  }

  get settings() {
    return this.app.settings;
  }

  /** Shows one or more lines of German text and waits until they are dismissed. */
  say(...lines: Array<string | Line>): Promise<void> {
    return this.app.ui.dialogue.say(lines.map((l) => (typeof l === 'string' ? { text: l } : l)));
  }

  toast(text: string): void {
    this.app.ui.toast(text);
  }

  wait(ms: number): Promise<void> {
    return this.scene.wait(ms);
  }

  sfx(name: SfxName, opts?: { volume?: number; rate?: number }): void {
    this.app.audio.sfx(name, opts);
  }

  /** Runs `fn` with player input disabled (cutscene). */
  async cutscene<T>(fn: () => Promise<T>): Promise<T> {
    this.scene.lockInput(true);
    this.app.ui.setCinematic(true);
    try {
      return await fn();
    } finally {
      this.app.ui.setCinematic(false);
      this.scene.lockInput(false);
    }
  }

  panTo(p: Vec3, ms = 900): Promise<void> {
    return this.scene.cameraPanTo(p, ms);
  }

  followPlayer(ms = 700): Promise<void> {
    return this.scene.cameraFollowPlayer(ms);
  }

  async walkTo(x: number, y: number): Promise<boolean> {
    const r = await this.scene.walkTo(x, y);
    return r === 'arrived';
  }

  face(f: Facing8): void {
    this.scene.player.face(f);
  }

  give(item: ItemId): void {
    this.state.give(item);
    this.app.ui.itemReceived(item);
    this.app.audio.sfx('pickup');
    this.app.persist();
  }

  take(item: ItemId): void {
    this.state.take(item);
    this.app.persist();
  }

  setFlag(key: string, v = true): void {
    this.state.setFlag(key, v);
    this.app.persist();
    this.scene.refreshProps();
  }

  /** Re-evaluates prop textures, overlays, collision and lighting after a change. */
  refresh(): void {
    this.scene.refreshProps();
  }

  changeRoom(room: RoomId, arrival: string): Promise<void> {
    return this.app.changeRoom(room, arrival);
  }

  persist(): void {
    this.app.persist();
  }
}
