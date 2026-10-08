/**
 * Local save data. Everything is validated on load: a missing, corrupt or
 * incompatible save never crashes the game – it is reported and replaced by
 * defaults (the menu then simply offers no "Fortsetzen").
 */

import { ENERGIEPFAD, isValidRotation } from '../game/puzzles/energiepfad';
import type { Facing8 } from '../core/projection';
import type { DoorState, ItemId, RoomId, SaveData } from './types';

export const SAVE_KEY = 'ka3.save.v1';

const ROOMS: RoomId[] = ['wartungszelle', 'schleuse'];
const ITEMS: ItemId[] = ['sicherung', 'kurbel'];
const DOORS: DoorState[] = ['LOCKED', 'POWERED', 'UNLOCKED', 'OPEN'];
const FACINGS: Facing8[] = ['S', 'SE', 'E', 'NE', 'N', 'NW', 'W', 'SW'];

export function defaultSave(): SaveData {
  return {
    v: 1,
    room: 'wartungszelle',
    player: { x: 54, y: 118, facing: 'NE' },
    inventory: [],
    flags: {},
    doors: { schleuse01: 'LOCKED', schott02: 'LOCKED' },
    puzzles: { energiepfad: { rot: ENERGIEPFAD.start.slice(), solved: false, hints: 0, moves: 0 } },
    seen: [],
    playTime: 0,
    chapterComplete: false,
    savedAt: 0,
  };
}

export type LoadResult = { ok: true; data: SaveData } | { ok: false; reason: 'missing' | 'corrupt' | 'incompatible' };

function isObj(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/** Validates untrusted JSON. Returns a clean copy or null. */
export function validateSave(raw: unknown): SaveData | null {
  if (!isObj(raw) || raw.v !== 1) return null;
  const d = defaultSave();
  if (typeof raw.room !== 'string' || !ROOMS.includes(raw.room as RoomId)) return null;
  d.room = raw.room as RoomId;
  const p = raw.player;
  if (!isObj(p) || !Number.isFinite(p.x) || !Number.isFinite(p.y)) return null;
  d.player = {
    x: p.x as number,
    y: p.y as number,
    facing: FACINGS.includes(p.facing as Facing8) ? (p.facing as Facing8) : 'S',
  };
  if (Array.isArray(raw.inventory)) {
    d.inventory = raw.inventory.filter((i): i is ItemId => ITEMS.includes(i as ItemId));
    d.inventory = [...new Set(d.inventory)];
  }
  if (isObj(raw.flags)) {
    for (const [k, v] of Object.entries(raw.flags)) if (typeof v === 'boolean') d.flags[k] = v;
  }
  if (isObj(raw.doors)) {
    for (const [k, v] of Object.entries(raw.doors)) if (DOORS.includes(v as DoorState)) d.doors[k] = v as DoorState;
  }
  const pz = isObj(raw.puzzles) ? raw.puzzles.energiepfad : undefined;
  if (isObj(pz)) {
    if (isValidRotation(ENERGIEPFAD, pz.rot)) d.puzzles.energiepfad.rot = (pz.rot as number[]).slice();
    d.puzzles.energiepfad.solved = pz.solved === true;
    d.puzzles.energiepfad.hints = Number.isInteger(pz.hints) ? Math.max(0, Math.min(3, pz.hints as number)) : 0;
    d.puzzles.energiepfad.moves = Number.isInteger(pz.moves) ? Math.max(0, pz.moves as number) : 0;
  }
  if (Array.isArray(raw.seen)) d.seen = raw.seen.filter((s): s is string => typeof s === 'string').slice(0, 200);
  d.playTime = Number.isFinite(raw.playTime) ? Math.max(0, raw.playTime as number) : 0;
  d.chapterComplete = raw.chapterComplete === true;
  d.savedAt = Number.isFinite(raw.savedAt) ? (raw.savedAt as number) : 0;
  return normalize(d);
}

/**
 * Repairs logically impossible combinations so a save can never strand the player:
 * e.g. a solved panel always means the door is open, the fuse is either carried or
 * inserted, and you cannot be beyond the door while it is closed.
 */
export function normalize(d: SaveData): SaveData {
  const f = d.flags;
  if (d.puzzles.energiepfad.solved) {
    f['fuse.inserted'] = true;
    d.doors.schleuse01 = 'OPEN';
  }
  if (f['fuse.inserted']) {
    f['fuse.taken'] = true;
    d.inventory = d.inventory.filter((i) => i !== 'sicherung');
  } else if (f['fuse.taken'] && !d.inventory.includes('sicherung')) {
    d.inventory.push('sicherung');
  }
  if (f['crank.used']) {
    f['crank.taken'] = true;
    d.inventory = d.inventory.filter((i) => i !== 'kurbel');
    d.doors.schott02 = 'OPEN';
  } else if (f['crank.taken'] && !d.inventory.includes('kurbel')) {
    d.inventory.push('kurbel');
  }
  if (d.room === 'schleuse' && d.doors.schleuse01 !== 'OPEN') {
    d.room = 'wartungszelle';
    d.player = { x: 142, y: 26, facing: 'SW' };
  }
  return d;
}

export function loadSave(storage: Storage | null = safeStorage()): LoadResult {
  if (!storage) return { ok: false, reason: 'missing' };
  let text: string | null = null;
  try {
    text = storage.getItem(SAVE_KEY);
  } catch {
    return { ok: false, reason: 'missing' };
  }
  if (!text) return { ok: false, reason: 'missing' };
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { ok: false, reason: 'corrupt' };
  }
  if (isObj(raw) && raw.v !== 1) return { ok: false, reason: 'incompatible' };
  const data = validateSave(raw);
  return data ? { ok: true, data } : { ok: false, reason: 'corrupt' };
}

export function writeSave(data: SaveData, storage: Storage | null = safeStorage()): boolean {
  if (!storage) return false;
  try {
    data.savedAt = Date.now();
    storage.setItem(SAVE_KEY, JSON.stringify(data));
    return true;
  } catch {
    return false;
  }
}

export function clearSave(storage: Storage | null = safeStorage()): void {
  try {
    storage?.removeItem(SAVE_KEY);
  } catch {
    /* storage unavailable */
  }
}

export function safeStorage(): Storage | null {
  try {
    const s = globalThis.localStorage;
    const probe = '__ka3_probe__';
    s.setItem(probe, '1');
    s.removeItem(probe);
    return s;
  } catch {
    return null;
  }
}
