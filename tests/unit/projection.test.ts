import { describe, expect, it } from 'vitest';
import { facingFromWorld, toScreen, toWorld, worldDirFromScreen } from '../../src/core/projection';

describe('projection', () => {
  it('maps a 16×16 tile to a 32×16 diamond', () => {
    expect(toScreen(16, 0)).toEqual({ sx: 16, sy: 8 });
    expect(toScreen(0, 16)).toEqual({ sx: -16, sy: 8 });
    expect(toScreen(16, 16)).toEqual({ sx: 0, sy: 16 });
  });

  it('heights move straight up', () => {
    expect(toScreen(10, 10, 5).sy).toBe(toScreen(10, 10).sy - 5);
  });

  it('round-trips screen → world on the floor and at height', () => {
    for (const [x, y, z] of [
      [0, 0, 0],
      [37.5, 12.25, 0],
      [-4, 99, 0],
      [80, 80, 30],
    ]) {
      const s = toScreen(x, y, z);
      const w = toWorld(s.sx, s.sy, z);
      expect(w.x).toBeCloseTo(x, 9);
      expect(w.y).toBeCloseTo(y, 9);
    }
  });

  it('keyboard directions move as seen on screen', () => {
    const up = worldDirFromScreen(0, -1);
    const s = toScreen(up.x, up.y);
    expect(s.sx).toBeCloseTo(0);
    expect(s.sy).toBeLessThan(0);
    const right = worldDirFromScreen(1, 0);
    const r = toScreen(right.x, right.y);
    expect(r.sy).toBeCloseTo(0);
    expect(r.sx).toBeGreaterThan(0);
    // Diagonal keys follow the iso axes.
    const ur = worldDirFromScreen(1, -1);
    expect(ur.x).toBeCloseTo(0);
    expect(ur.y).toBeCloseTo(-1);
  });

  it('chooses facings for world movement', () => {
    expect(facingFromWorld(1, 0)).toBe('SE');
    expect(facingFromWorld(0, 1)).toBe('SW');
    expect(facingFromWorld(-1, -1)).toBe('N');
    expect(facingFromWorld(1, 1)).toBe('S');
    expect(facingFromWorld(1, -1)).toBe('E');
  });
});
