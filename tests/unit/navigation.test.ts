import { describe, expect, it } from 'vitest';
import { isFree, moveWithCollision, type CollisionWorld } from '../../src/core/collision';
import { NavGrid } from '../../src/core/navgrid';

const R = 4.5;
const world: CollisionWorld = {
  bounds: { x0: 0, y0: 0, x1: 192, y1: 160 },
  solids: [
    { x0: 74, y0: 58, x1: 118, y1: 102 },
    { x0: 40, y0: 0, x1: 50, y1: 130 }, // long wall with a gap at the bottom
  ],
};

describe('collision', () => {
  it('stops at walls and slides along them', () => {
    const out = { x: 0, y: 0 };
    moveWithCollision(world, 20, 20, 50, 0, R, out);
    expect(out.x).toBeLessThanOrEqual(40 - R);
    // Diagonal into the wall keeps the tangential component.
    moveWithCollision(world, 30, 20, 30, 10, R, out);
    expect(out.x).toBeLessThanOrEqual(40 - R);
    expect(out.y).toBeCloseTo(30, 5);
  });

  it('cannot tunnel through thin solids with large steps', () => {
    const out = { x: 0, y: 0 };
    moveWithCollision(world, 30, 60, 400, 0, R, out);
    expect(out.x).toBeLessThan(40);
  });

  it('keeps inside room bounds', () => {
    const out = { x: 0, y: 0 };
    moveWithCollision(world, 10, 150, -100, 100, R, out);
    expect(out.x).toBeGreaterThanOrEqual(R);
    expect(out.y).toBeLessThanOrEqual(160 - R);
  });
});

describe('navigation grid', () => {
  const nav = new NavGrid(world, R, 4);

  it('finds a path around obstacles, never through them', () => {
    const res = nav.findPath({ x: 20, y: 20 }, { x: 150, y: 20 })!;
    expect(res.reachedTarget).toBe(true);
    let prev = { x: 20, y: 20 };
    for (const p of res.points) {
      expect(isFree(world, p.x, p.y, R)).toBe(true);
      expect(nav.lineOfSight(prev, p)).toBe(true);
      prev = p;
    }
    // The detour has to pass the gap below the long wall.
    expect(res.points.some((p) => p.y > 130)).toBe(true);
    expect(res.points[res.points.length - 1]).toEqual({ x: 150, y: 20 });
  });

  it('walks to the closest reachable point when the target is blocked', () => {
    const res = nav.findPath({ x: 20, y: 20 }, { x: 96, y: 80 })!;
    expect(res.reachedTarget).toBe(false);
    const end = res.points[res.points.length - 1];
    expect(isFree(world, end.x, end.y, R)).toBe(true);
    expect(Math.hypot(end.x - 96, end.y - 80)).toBeLessThan(40);
  });

  it('handles targets outside the room', () => {
    const res = nav.findPath({ x: 20, y: 20 }, { x: -50, y: 300 })!;
    expect(res.reachedTarget).toBe(false);
    const end = res.points[res.points.length - 1];
    expect(end.x).toBeGreaterThanOrEqual(0);
    expect(end.y).toBeLessThanOrEqual(160);
  });

  it('repeated retargeting always gives valid paths', () => {
    const targets = [
      [150, 140],
      [10, 10],
      [180, 30],
      [60, 150],
      [96, 30],
    ];
    let pos = { x: 20, y: 20 };
    for (const [x, y] of targets) {
      const res = nav.findPath(pos, { x, y })!;
      expect(res).not.toBeNull();
      pos = res.points[Math.floor(res.points.length / 2)] ?? pos;
      expect(isFree(world, pos.x, pos.y, R)).toBe(true);
    }
  });
});
