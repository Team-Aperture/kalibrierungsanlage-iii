import { describe, expect, it } from 'vitest';
import { ENERGIEPFAD as B, evaluate, isValidRotation, maskOf, rotateMask, rotateTile, N, E, S, W } from '../../src/game/puzzles/energiepfad';
import { HINTS } from '../../src/content/hints';

const free = B.tiles.map((t, i) => (t.fixed ? -1 : i)).filter((i) => i >= 0);

function* allConfigs(): Generator<number[]> {
  const total = 4 ** free.length;
  for (let n = 0; n < total; n++) {
    const rot = B.start.slice();
    let k = n;
    for (const i of free) {
      rot[i] = k % 4;
      k = Math.floor(k / 4);
    }
    yield rot;
  }
}

describe('Puzzle 01 – Der Energiepfad', () => {
  it('rotation rules are consistent', () => {
    expect(rotateMask(N | E, 1)).toBe(E | S);
    expect(rotateMask(N | E, 4)).toBe(N | E);
    expect(rotateMask(W, 1)).toBe(N);
    expect(maskOf({ kind: 'T' }, 0)).toBe(E | S | W);
  });

  it('starts unsolved, without a short circuit and with the first segment glowing', () => {
    const r = evaluate(B, B.start);
    expect(r.solved).toBe(false);
    expect(r.shortAt).toBe(-1);
    expect(r.powered[3]).toBe(true);
  });

  it('the documented solution is valid', () => {
    expect(isValidRotation(B, B.solution)).toBe(true);
    expect(evaluate(B, B.solution).solved).toBe(true);
  });

  it('has a small number of solutions, all routed around the burnt segment', () => {
    let count = 0;
    for (const rot of allConfigs()) {
      const r = evaluate(B, rot);
      if (r.solved) {
        count++;
        expect(r.powered[7]).toBe(false);
      }
    }
    expect(count).toBeGreaterThan(0);
    // Requires reasoning: far fewer than 1 % of configurations solve it.
    expect(count / 4 ** free.length).toBeLessThan(0.01);
  });

  it('feeding the burnt segment is a short circuit and never counts as solved', () => {
    let shorts = 0;
    for (const rot of allConfigs()) {
      const r = evaluate(B, rot);
      if (r.shortAt >= 0) {
        shorts++;
        expect(r.solved).toBe(false);
      }
    }
    expect(shorts).toBeGreaterThan(0);
  });

  it('every rotation is reversible and fixed segments never move', () => {
    for (let i = 0; i < 9; i++) {
      const once = rotateTile(B, B.start, i, 1);
      expect(rotateTile(B, once, i, -1)).toEqual(B.start);
      let r = B.start;
      for (let k = 0; k < 4; k++) r = rotateTile(B, r, i, 1);
      expect(r).toEqual(B.start);
      if (B.tiles[i].fixed) expect(once[i]).toBe(B.start[i]);
    }
  });

  it('cannot soft-lock: from any configuration a solution is reachable', () => {
    // Tiles rotate independently through all four states, so the solution is always
    // reachable; verify that the solution only differs in rotatable tiles.
    for (let i = 0; i < 9; i++) if (B.tiles[i].fixed) expect(B.solution[i]).toBe(B.start[i]);
  });

  it('rejects corrupt saved rotations', () => {
    expect(isValidRotation(B, [0, 0, 0])).toBe(false);
    expect(isValidRotation(B, [1, 2, 2, 1, 1, 2, 1, 0, 3])).toBe(false); // fixed tile changed
    expect(isValidRotation(B, 'x')).toBe(false);
  });

  it('provides three escalating hints', () => {
    const h = HINTS.energiepfad;
    expect(h).toHaveLength(3);
    expect(h[0].length).toBeLessThan(h[2].length);
    expect(h[2]).toMatch(/obere Reihe/);
    expect(h[0]).not.toMatch(/obere Reihe/);
  });
});
