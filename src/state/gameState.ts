/**
 * In-memory world state with change notifications. All persistent world changes
 * (doors, items, puzzle progress, flags) go through here; the app persists the
 * underlying SaveData after every meaningful change.
 */

import { Emitter } from '../core/events';
import type { Facing8 } from '../core/projection';
import { defaultSave, normalize } from './save';
import type { DoorState, ItemId, RoomId, SaveData } from './types';

export interface StateEvents extends Record<string, unknown> {
  change: { kind: 'flag' | 'item' | 'door' | 'puzzle' | 'seen' | 'room'; key: string };
}

export class GameState extends Emitter<StateEvents> {
  data: SaveData;

  constructor(data?: SaveData) {
    super();
    this.data = normalize(data ?? defaultSave());
  }

  reset(data?: SaveData): void {
    this.data = normalize(data ?? defaultSave());
    this.emit('change', { kind: 'room', key: this.data.room });
  }

  get room(): RoomId {
    return this.data.room;
  }

  flag(key: string): boolean {
    return this.data.flags[key] === true;
  }

  setFlag(key: string, value = true): void {
    if (this.flag(key) === value) return;
    this.data.flags[key] = value;
    this.emit('change', { kind: 'flag', key });
  }

  has(item: ItemId): boolean {
    return this.data.inventory.includes(item);
  }

  give(item: ItemId): void {
    if (this.has(item)) return;
    this.data.inventory.push(item);
    this.emit('change', { kind: 'item', key: item });
  }

  take(item: ItemId): void {
    if (!this.has(item)) return;
    this.data.inventory = this.data.inventory.filter((i) => i !== item);
    this.emit('change', { kind: 'item', key: item });
  }

  door(id: string): DoorState {
    return this.data.doors[id] ?? 'LOCKED';
  }

  setDoor(id: string, state: DoorState): void {
    if (this.door(id) === state) return;
    this.data.doors[id] = state;
    this.emit('change', { kind: 'door', key: id });
  }

  seen(id: string): boolean {
    return this.data.seen.includes(id);
  }

  markSeen(id: string): void {
    if (this.seen(id)) return;
    this.data.seen.push(id);
    this.emit('change', { kind: 'seen', key: id });
  }

  setRoom(room: RoomId, x: number, y: number, facing: Facing8): void {
    this.data.room = room;
    this.data.player = { x, y, facing };
    this.emit('change', { kind: 'room', key: room });
  }

  setPlayer(x: number, y: number, facing: Facing8): void {
    this.data.player = { x, y, facing };
  }

  get puzzle() {
    return this.data.puzzles.energiepfad;
  }

  puzzleChanged(): void {
    this.emit('change', { kind: 'puzzle', key: 'energiepfad' });
  }
}
