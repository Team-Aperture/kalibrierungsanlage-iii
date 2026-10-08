import { describe, expect, it, vi } from 'vitest';

// Room modules use a few Phaser constants for overlays; gameplay data needs none of it.
vi.mock('phaser', () => ({ default: { BlendModes: { ADD: 1 }, Math: { RND: { uuid: () => 'test' } } } }));

import { isFree } from '../../src/core/collision';
import { NavGrid } from '../../src/core/navgrid';
import { ROOMS } from '../../src/game/rooms';
import type { RoomDef } from '../../src/game/rooms/types';
import { PLAYER_RADIUS } from '../../src/game/entities/Player';
import { GameState } from '../../src/state/gameState';
import { defaultSave } from '../../src/state/save';

function state(mut: (d: ReturnType<typeof defaultSave>) => void = () => undefined): GameState {
  const d = defaultSave();
  mut(d);
  return new GameState(d);
}

const solved = (d: ReturnType<typeof defaultSave>) => {
  d.flags['intro.done'] = true;
  d.flags['fuse.taken'] = true;
  d.flags['fuse.inserted'] = true;
  d.puzzles.energiepfad.solved = true;
  d.doors.schleuse01 = 'OPEN';
};

function reachable(room: RoomDef, s: GameState, from: { x: number; y: number }, to: { x: number; y: number }, reach = 10): boolean {
  const world = { bounds: room.bounds, solids: room.solids(s) };
  const nav = new NavGrid(world, PLAYER_RADIUS, 4);
  const res = nav.findPath(from, to);
  if (!res) return false;
  const end = res.points[res.points.length - 1] ?? from;
  return res.reachedTarget || Math.hypot(end.x - to.x, end.y - to.y) <= reach * 0.8;
}

describe('room layouts', () => {
  for (const [id, room] of Object.entries(ROOMS)) {
    const st = id === 'schleuse' ? state(solved) : state();
    describe(id, () => {
      it('arrival points are free', () => {
        const world = { bounds: room.bounds, solids: room.solids(st) };
        for (const a of Object.values(room.arrivals)) expect(isFree(world, a.x, a.y, PLAYER_RADIUS)).toBe(true);
      });

      it('has at least six objects with meaningful interactions', () => {
        expect(room.props.filter((p) => p.interact).length).toBeGreaterThanOrEqual(6);
      });
    });
  }

  it('Wartungszelle: every interactive object is reachable from the start, before and after power', () => {
    const room = ROOMS.wartungszelle;
    for (const s of [state(), state(solved)]) {
      for (const p of room.props) {
        if (!p.interact) continue;
        const ok = p.interact.points.some((pt) => reachable(room, s, room.arrivals.start, pt, p.interact!.reach ?? 10));
        expect(ok, p.id).toBe(true);
      }
    }
  });

  it('Wartungszelle: the exit is reachable once the door is open', () => {
    const room = ROOMS.wartungszelle;
    const zone = room.zones!.find((z) => z.id === 'exit')!;
    const s = state(solved);
    expect(zone.active(s)).toBe(true);
    expect(zone.active(state())).toBe(false);
    expect(reachable(room, s, room.arrivals.start, { x: (zone.rect.x0 + zone.rect.x1) / 2, y: zone.rect.y1 - 3 }, 4)).toBe(true);
  });

  it('Schleuse: the gate blocks the way until it is cranked open', () => {
    const room = ROOMS.schleuse;
    const t07 = room.props.find((p) => p.id === 't07')!.interact!.points[0];
    const closed = state(solved);
    expect(reachable(room, closed, room.arrivals.fromZelle, t07)).toBe(false);
    const open = state((d) => {
      solved(d);
      d.flags['locker.open'] = true;
      d.flags['crank.taken'] = true;
      d.flags['crank.used'] = true;
    });
    expect(open.door('schott02')).toBe('OPEN');
    expect(reachable(room, open, room.arrivals.fromZelle, t07)).toBe(true);
    // Locker and crank box are on the near side of the gate.
    for (const id of ['locker', 'gateBox', 'clipboard']) {
      const pt = room.props.find((p) => p.id === id)!.interact!.points[0];
      expect(reachable(room, closed, room.arrivals.fromZelle, pt), id).toBe(true);
    }
  });

  it('Schleuse: the way back is always available', () => {
    const room = ROOMS.schleuse;
    const zone = room.zones!.find((z) => z.id === 'back')!;
    expect(reachable(room, state(solved), room.arrivals.fromZelle, { x: 3, y: 21 }, 4)).toBe(true);
    expect(zone.active(state(solved))).toBe(true);
  });
});
