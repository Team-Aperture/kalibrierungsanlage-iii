import { describe, expect, it } from 'vitest';
import { defaultSave, loadSave, normalize, SAVE_KEY, validateSave, writeSave } from '../../src/state/save';

class MemStorage implements Storage {
  private m = new Map<string, string>();
  get length() {
    return this.m.size;
  }
  clear() {
    this.m.clear();
  }
  getItem(k: string) {
    return this.m.get(k) ?? null;
  }
  key(i: number) {
    return [...this.m.keys()][i] ?? null;
  }
  removeItem(k: string) {
    this.m.delete(k);
  }
  setItem(k: string, v: string) {
    this.m.set(k, v);
  }
}

describe('save data', () => {
  it('round-trips through storage', () => {
    const st = new MemStorage();
    const d = defaultSave();
    d.flags['fuse.taken'] = true;
    d.inventory = ['sicherung'];
    d.player = { x: 100, y: 40, facing: 'SW' };
    d.puzzles.energiepfad.rot = [1, 2, 2, 0, 0, 0, 1, 0, 3];
    expect(writeSave(d, st)).toBe(true);
    const r = loadSave(st);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.data.player).toEqual({ x: 100, y: 40, facing: 'SW' });
      expect(r.data.inventory).toEqual(['sicherung']);
      expect(r.data.puzzles.energiepfad.rot).toEqual([1, 2, 2, 0, 0, 0, 1, 0, 3]);
    }
  });

  it('reports missing, corrupt and incompatible saves without throwing', () => {
    const st = new MemStorage();
    expect(loadSave(st)).toEqual({ ok: false, reason: 'missing' });
    st.setItem(SAVE_KEY, '{not json');
    expect(loadSave(st)).toEqual({ ok: false, reason: 'corrupt' });
    st.setItem(SAVE_KEY, JSON.stringify({ v: 99 }));
    expect(loadSave(st)).toEqual({ ok: false, reason: 'incompatible' });
    st.setItem(SAVE_KEY, JSON.stringify({ v: 1, room: 'mars' }));
    expect(loadSave(st)).toEqual({ ok: false, reason: 'corrupt' });
    expect(loadSave(null)).toEqual({ ok: false, reason: 'missing' });
  });

  it('cleans unknown items, bad flags and invalid puzzle data', () => {
    const raw = { ...defaultSave(), inventory: ['sicherung', 'sicherung', 'laser'], flags: { a: true, b: 'yes' } } as Record<string, unknown>;
    raw.puzzles = { energiepfad: { rot: [9, 9], solved: 'no', hints: 7, moves: -3 } };
    const d = validateSave(raw)!;
    expect(d.inventory).toEqual(['sicherung']); // de-duplicated, unknown item removed
    expect(d.flags.a).toBe(true);
    expect(d.flags.b).toBeUndefined();
    // Carrying the fuse implies it was taken from the shelf (no duplication).
    expect(d.flags['fuse.taken']).toBe(true);
    expect(d.puzzles.energiepfad.rot).toEqual(defaultSave().puzzles.energiepfad.rot);
    expect(d.puzzles.energiepfad.hints).toBe(3);
    expect(d.puzzles.energiepfad.moves).toBe(0);
  });

  it('a solved panel always means an open door (no inconsistent world)', () => {
    const d = defaultSave();
    d.puzzles.energiepfad.solved = true;
    d.doors.schleuse01 = 'POWERED'; // e.g. saved mid power-up sequence
    const n = normalize(d);
    expect(n.doors.schleuse01).toBe('OPEN');
    expect(n.flags['fuse.inserted']).toBe(true);
  });

  it('never strands the player beyond a closed door', () => {
    const d = defaultSave();
    d.room = 'schleuse';
    const n = normalize(d);
    expect(n.room).toBe('wartungszelle');
  });

  it('keeps carried items consistent with flags', () => {
    const d = defaultSave();
    d.flags['fuse.taken'] = true;
    expect(normalize(d).inventory).toContain('sicherung');
    d.flags['fuse.inserted'] = true;
    expect(normalize(d).inventory).not.toContain('sicherung');
    const e = defaultSave();
    e.flags['crank.used'] = true;
    const ne = normalize(e);
    expect(ne.doors.schott02).toBe('OPEN');
    expect(ne.inventory).not.toContain('kurbel');
  });
});
