import type { Facing8 } from '../core/projection';

export type RoomId = 'wartungszelle' | 'schleuse';

/** Persistent door progression: LOCKED → POWERED → UNLOCKED → OPEN. */
export type DoorState = 'LOCKED' | 'POWERED' | 'UNLOCKED' | 'OPEN';

export type ItemId = 'sicherung' | 'kurbel';

export interface PuzzleSave {
  /** Rotation (0…3, quarter turns clockwise) of each of the nine tiles. */
  rot: number[];
  solved: boolean;
  /** Highest hint stage revealed (0 = none). */
  hints: number;
  moves: number;
}

export interface SaveData {
  v: 1;
  room: RoomId;
  player: { x: number; y: number; facing: Facing8 };
  inventory: ItemId[];
  flags: Record<string, boolean>;
  doors: Record<string, DoorState>;
  puzzles: { energiepfad: PuzzleSave };
  /** Objects the player has inspected at least once. */
  seen: string[];
  playTime: number;
  chapterComplete: boolean;
  savedAt: number;
}

export interface Settings {
  v: 1;
  crt: number; // 0…1
  flicker: boolean;
  reducedMotion: boolean;
  volume: number; // 0…1
  muted: boolean;
  joystick: boolean;
  textSpeed: number; // characters per second, 0 = instant
  /** Performance mode: no CRT overlay, fewer particles. */
  lite: boolean;
  /** Set once the automatic frame-rate check has run on this device. */
  perfChecked: boolean;
}
