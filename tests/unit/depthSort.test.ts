import { describe, expect, it } from 'vitest';
import { DepthSorter, compareBoxes, type Sortable } from '../../src/core/depthSort';

const box = (x0: number, y0: number, z0: number, x1: number, y1: number, z1: number) => ({ x0, y0, z0, x1, y1, z1 });
const player = (x: number, y: number): Sortable & { id: string } => ({ id: 'player', box: box(x - 4.5, y - 4.5, 0, x + 4.5, y + 4.5, 28) });

function order(items: Array<Sortable & { id: string }>): string[] {
  const out: Array<Sortable & { id: string }> = [];
  new DepthSorter<Sortable & { id: string }>().sort(items, out);
  return out.map((i) => i.id);
}

describe('depth sorting by ground footprint', () => {
  // A tall industrial block (like transformer TR-1).
  const tall = { id: 'transformer', box: box(156, 84, 0, 188, 118, 58) };

  it('hides the player walking behind a tall object', () => {
    // Behind on the y axis (smaller y) and on the x axis (smaller x).
    expect(order([tall, player(172, 76)])).toEqual(['player', 'transformer']);
    expect(order([tall, player(148, 100)])).toEqual(['player', 'transformer']);
  });

  it('draws the player in front when walking in front', () => {
    expect(order([tall, player(172, 126)])).toEqual(['transformer', 'player']);
    expect(order([tall, player(196, 100)])).toEqual(['transformer', 'player']);
  });

  it('uses the ground contact, not the sprite centre (long objects)', () => {
    // A long railing in front of a walkway: whatever x the player has, the railing is in front.
    const railing = { id: 'railing', box: box(0, 38, 0, 320, 41, 13) };
    for (const x of [10, 160, 310]) expect(order([railing, player(x, 30)])).toEqual(['player', 'railing']);
  });

  it('sorts by height when footprints overlap (overhead lamp)', () => {
    // Hanging low enough to overlap the player's head on screen.
    const lamp = { id: 'lamp', box: box(58, 130, 30, 70, 142, 60) };
    expect(order([lamp, player(64, 136)])).toEqual(['player', 'lamp']);
    expect(compareBoxes(box(0, 0, -96, 10, 10, -20), box(0, 0, -6, 10, 10, 0))).toBe(-1);
  });

  it('produces a consistent order for a crowded scene', () => {
    const items = [
      { id: 'machine', box: box(74, 58, 0, 118, 102, 66) },
      tall,
      { id: 'terminal', box: box(24, 0, 0, 58, 20, 42) },
      { id: 'shelf', box: box(0, 22, 0, 15, 62, 42) },
      player(130, 100),
    ];
    const o = order(items);
    expect(o.indexOf('player')).toBeGreaterThan(o.indexOf('machine'));
    expect(o.indexOf('player')).toBeLessThan(o.indexOf('transformer'));
    expect(o.indexOf('terminal')).toBeLessThan(o.indexOf('machine'));
  });
});
