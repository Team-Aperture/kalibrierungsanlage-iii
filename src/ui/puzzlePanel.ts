/**
 * PUZZLE 01 close-up: the conduit matrix inside distribution panel V-2.
 *
 * The board is pixel art drawn into a small canvas (integer-scaled, crisp); real
 * <button> elements sit over the nine tiles so the puzzle works with mouse, touch,
 * keyboard (arrow keys + Enter / Space, Shift or R for counter-clockwise) and
 * screen readers. Every move is saved immediately; rotations are reversible and an
 * undo stack plus a reset are always available.
 */

import { bayer } from '../art/dither';
import { drawText } from '../art/font';
import { C, PALETTE_U32 } from '../art/palette';
import { describeTile, E, ENERGIEPFAD, evaluate, maskOf, N, rotateTile, S, W, type BoardDef } from '../game/puzzles/energiepfad';
import { HINTS } from '../content/hints';
import { button, h } from './dom';
import type { Modal } from './ui';

const HINT_TEXTS = HINTS.energiepfad;

const T = 24;
const G = 2;
const BX = 20;
const BY = 16;
const CW = BX * 2 + T * 3 + G * 2;
const CH = BY * 2 + T * 3 + G * 2;

export interface PuzzleOpts {
  rot: number[];
  moves: number;
  hints: number;
  reducedMotion: boolean;
  onChange: (rot: number[], moves: number) => void;
  onHint: (stage: number) => void;
  onSolved: () => void;
  onClose: () => void;
  sfx: (name: 'rotate' | 'short' | 'solved' | 'deny' | 'beep') => void;
}

type Buf = { w: number; h: number; d: Uint8Array };

function px(b: Buf, x: number, y: number, c: number): void {
  if (x < 0 || y < 0 || x >= b.w || y >= b.h) return;
  b.d[y * b.w + x] = c;
}

function rect(b: Buf, x: number, y: number, w: number, hh: number, c: number): void {
  for (let j = 0; j < hh; j++) for (let i = 0; i < w; i++) px(b, x + i, y + j, c);
}

function ditherRect(b: Buf, x: number, y: number, w: number, hh: number, c1: number, c2: number, amount: number): void {
  for (let j = 0; j < hh; j++) for (let i = 0; i < w; i++) px(b, x + i, y + j, bayer(x + i, y + j) < amount ? c2 : c1);
}

function bevelBox(b: Buf, x: number, y: number, w: number, hh: number, fill: number, hi: number, lo: number, edge: number): void {
  rect(b, x, y, w, hh, edge);
  rect(b, x + 1, y + 1, w - 2, hh - 2, fill);
  rect(b, x + 1, y + 1, w - 2, 1, hi);
  rect(b, x + 1, y + 1, 1, hh - 2, hi);
  rect(b, x + 1, y + hh - 2, w - 2, 1, lo);
  rect(b, x + w - 2, y + 1, 1, hh - 2, lo);
}

interface DrawState {
  rot: number[];
  powered: boolean[];
  shortAt: number;
  solved: boolean;
  t: number;
  flash: number;
  flashTile: number;
  focus: number;
}

function drawTile(b: Buf, def: BoardDef, i: number, st: DrawState, reduced: boolean): void {
  const r = Math.floor(i / 3);
  const c = i % 3;
  const x0 = BX + c * (T + G);
  const y0 = BY + r * (T + G);
  const tile = def.tiles[i];
  const powered = st.powered[i];
  const shorted = st.shortAt === i;
  // Plate.
  if (tile.damaged) {
    bevelBox(b, x0, y0, T, T, C.S2, C.S4, C.S1, C.VOID);
    for (let j = 2; j < T - 2; j++) {
      for (let k = 2; k < T - 2; k++) {
        const d = Math.hypot(k - T / 2, j - T / 2) / (T / 2);
        if (bayer(x0 + k, y0 + j) > d * 0.9) px(b, x0 + k, y0 + j, d < 0.45 ? C.BR0 : C.BR1);
      }
    }
  } else {
    bevelBox(b, x0, y0, T, T, C.S4, C.S6, C.S2, C.S1);
    ditherRect(b, x0 + 2, y0 + 2, T - 4, T - 4, C.S4, C.S5, 0.12);
    for (const [sx, sy] of [
      [2, 2],
      [T - 4, 2],
      [2, T - 4],
      [T - 4, T - 4],
    ]) {
      px(b, x0 + sx, y0 + sy, C.S8);
      px(b, x0 + sx + 1, y0 + sy, C.S6);
      px(b, x0 + sx, y0 + sy + 1, C.S2);
    }
  }
  if (tile.fixed && !tile.damaged) {
    // Weld beads along the plate border.
    for (let k = 1; k < T - 1; k += 2) {
      px(b, x0 + k, y0, k % 4 === 1 ? C.S9 : C.S7);
      px(b, x0 + k, y0 + T - 1, k % 4 === 1 ? C.S9 : C.S7);
      px(b, x0, y0 + k, k % 4 === 1 ? C.S9 : C.S7);
      px(b, x0 + T - 1, y0 + k, k % 4 === 1 ? C.S9 : C.S7);
    }
  }
  // Conduits.
  const m = maskOf(tile, st.rot[i]);
  const cx = x0 + T / 2;
  const cy = y0 + T / 2;
  const blink = shorted && (reduced || Math.floor(st.t / 110) % 2 === 0);
  const core = shorted ? (blink ? C.RED : C.SALMON) : powered ? C.MINT : tile.damaged ? C.BR1 : C.BR3;
  const coreHi = shorted ? C.PEACH : powered ? C.CYAN : tile.damaged ? C.BR2 : C.OCHRE;
  const casing = powered && !shorted ? C.G2 : C.S7;
  const casingLo = powered && !shorted ? C.G1 : C.S3;
  const arms: Array<[number, number, number]> = [
    [N, 0, -1],
    [E, 1, 0],
    [S, 0, 1],
    [W, -1, 0],
  ];
  for (const [bit, dx, dy] of arms) {
    if (!(m & bit)) continue;
    const len = T / 2;
    for (let k = 0; k <= len; k++) {
      const ax = Math.round(cx - 0.5 + dx * k);
      const ay = Math.round(cy - 0.5 + dy * k);
      for (let w = -3; w <= 2; w++) {
        const qx = dy !== 0 ? ax + w : ax;
        const qy = dx !== 0 ? ay + w : ay;
        let col: number;
        if (w === -3 || w === 2) col = w === -3 ? casing : casingLo;
        else if (w === -2 || w === 1) col = C.S2;
        else col = w === -1 ? coreHi : core;
        // Cracks in the burnt segment.
        if (tile.damaged && (k === 4 || k === 7) && w > -3 && w < 2) col = C.VOID;
        px(b, qx, qy, col);
      }
      // Flow pulses travelling along powered conduits.
      if (powered && !shorted && !reduced) {
        const phase = (k + Math.floor(st.t / 70)) % 6;
        if (phase === 0) {
          px(b, dy !== 0 ? ax - 1 : ax, dx !== 0 ? ay - 1 : ay, C.WHITE);
          px(b, dy !== 0 ? ax : ax, dx !== 0 ? ay : ay, C.CYAN);
        }
      }
    }
    // Glow around powered conduits.
    if (powered && !shorted) {
      for (let k = 2; k <= len; k++) {
        for (const w of [-5, -4, 3, 4]) {
          const qx = Math.round(cx - 0.5 + dx * k) + (dy !== 0 ? w : 0);
          const qy = Math.round(cy - 0.5 + dy * k) + (dx !== 0 ? w : 0);
          if (bayer(qx, qy) < (Math.abs(w) === 4 || w === 3 ? 0.4 : 0.15)) px(b, qx, qy, C.G1);
        }
      }
    }
  }
  // Hub.
  for (let j = -4; j <= 4; j++) {
    for (let k = -4; k <= 4; k++) {
      const d = Math.hypot(k + 0.5, j + 0.5);
      if (d > 4.6) continue;
      const qx = Math.floor(cx) + k;
      const qy = Math.floor(cy) + j;
      px(b, qx, qy, d > 3.6 ? casing : d > 2.6 ? C.S2 : d < 1.2 ? coreHi : core);
    }
  }
  if (shorted && !reduced && Math.floor(st.t / 90) % 3 === 0) {
    for (let k = 0; k < 6; k++) {
      const a = (st.t / 40 + k * 1.7) % (Math.PI * 2);
      px(b, Math.round(cx + Math.cos(a) * (6 + k)), Math.round(cy + Math.sin(a) * (5 + k)), k % 2 ? C.PEACH : C.AMBER);
    }
  }
  // Rotation flash.
  if (st.flashTile === i && st.flash > 0) {
    for (let k = 0; k < T; k++) {
      if ((k + Math.floor(st.flash / 30)) % 3 !== 0) continue;
      px(b, x0 + k, y0, C.AMBER);
      px(b, x0 + k, y0 + T - 1, C.AMBER);
      px(b, x0, y0 + k, C.AMBER);
      px(b, x0 + T - 1, y0 + k, C.AMBER);
    }
  }
}

function drawBoard(b: Buf, def: BoardDef, st: DrawState, reduced: boolean): void {
  // Housing.
  bevelBox(b, 0, 0, CW, CH, C.S3, C.S5, C.S1, C.VOID);
  ditherRect(b, 2, 2, CW - 4, CH - 4, C.S3, C.S2, 0.2);
  for (const [x, y] of [
    [4, 4],
    [CW - 6, 4],
    [4, CH - 6],
    [CW - 6, CH - 6],
  ]) {
    rect(b, x, y, 2, 2, C.S7);
    px(b, x + 1, y + 1, C.S2);
  }
  drawText(b.d, b.w, b.h, 'V-2', BX, 5, C.S8);
  drawText(b.d, b.w, b.h, 'MATRIX', CW - BX - 23, 5, C.S6);
  // Board well.
  rect(b, BX - 2, BY - 2, T * 3 + G * 2 + 4, T * 3 + G * 2 + 4, C.VOID);
  // Source terminal (left, middle row) and destination (right).
  const midY = BY + T + G + T / 2;
  // Pictograms: lightning bolt (source) and bulkhead door (destination).
  const BOLT = ['..##', '.##.', '####', '.##.', '##..'];
  const DOOR = ['####', '#..#', '#.##', '#..#', '####'];
  const term = (x: number, lit: boolean, color: number, icon: string[]) => {
    bevelBox(b, x, midY - 9, 12, 18, C.S5, C.S7, C.S2, C.S1);
    rect(b, x + 3, midY - 6, 6, 4, lit ? color : C.S2);
    if (lit) px(b, x + 4, midY - 6, C.WHITE);
    icon.forEach((row, j) => {
      for (let k = 0; k < row.length; k++) if (row[k] === '#') px(b, x + 4 + k, midY + 1 + j, lit ? C.S9 : C.S7);
    });
  };
  term(3, true, C.AMBER, BOLT);
  term(CW - 15, st.solved, C.MINT, DOOR);
  // Stubs from terminals into the board.
  const stub = (x0: number, x1: number, powered: boolean) => {
    for (let x = x0; x <= x1; x++) {
      px(b, x, midY - 3, C.S7);
      px(b, x, midY - 2, C.S2);
      px(b, x, midY - 1, powered ? C.CYAN : C.OCHRE);
      px(b, x, midY, powered ? C.MINT : C.BR3);
      px(b, x, midY + 1, C.S2);
      px(b, x, midY + 2, C.S3);
    }
  };
  stub(15, BX - 1, true);
  stub(BX + T * 3 + G * 2, CW - 16, st.solved);
  for (let i = 0; i < 9; i++) drawTile(b, def, i, st, reduced);
  // Keyboard focus marker (corners).
  if (st.focus >= 0) {
    const r = Math.floor(st.focus / 3);
    const c = st.focus % 3;
    const x0 = BX + c * (T + G) - 2;
    const y0 = BY + r * (T + G) - 2;
    for (const [x, y, dx, dy] of [
      [x0, y0, 1, 1],
      [x0 + T + 3, y0, -1, 1],
      [x0, y0 + T + 3, 1, -1],
      [x0 + T + 3, y0 + T + 3, -1, -1],
    ]) {
      for (let k = 0; k < 4; k++) {
        px(b, x + dx * k, y, C.AMBER);
        px(b, x, y + dy * k, C.AMBER);
      }
    }
  }
}

export function puzzlePanel(o: PuzzleOpts): Modal & { destroy: () => void } {
  const def = ENERGIEPFAD;
  let rot = o.rot.slice();
  let moves = o.moves;
  let hints = o.hints;
  const history: number[][] = [];
  let solvedFired = false;
  const st: DrawState = { rot, powered: [], shortAt: -1, solved: false, t: 0, flash: 0, flashTile: -1, focus: -1 };

  const canvas = h('canvas', { width: CW, height: CH, 'aria-hidden': 'true' }) as HTMLCanvasElement;
  const ctx = canvas.getContext('2d')!;
  const img = ctx.createImageData(CW, CH);
  const u32 = new Uint32Array(img.data.buffer);
  const buf: Buf = { w: CW, h: CH, d: new Uint8Array(CW * CH) };
  const boardWrap = h('div', { class: 'board-wrap' }, canvas);
  const tileBtns: HTMLButtonElement[] = [];
  const readout = h('div', { class: 'readout', role: 'status', 'aria-live': 'polite' });
  const hintBox = h('div', { class: 'hint-box', 'aria-live': 'polite' });
  const hintBtn = button('', () => revealHint(), { key: 'H' });
  const undoBtn = button('↶ Rückgängig', () => undo(), { key: 'U' });
  const resetBtn = button('Zurücksetzen', () => reset());
  const closeBtn = button('Schließen', () => o.onClose(), { key: 'Esc' });

  for (let i = 0; i < 9; i++) {
    const b = h('button', { class: 'tile-btn', type: 'button' }) as HTMLButtonElement;
    let pressTimer = 0;
    let longPressed = false;
    b.addEventListener('pointerdown', (e) => {
      longPressed = false;
      if (e.pointerType === 'touch') {
        pressTimer = window.setTimeout(() => {
          longPressed = true;
          turn(i, -1);
        }, 480);
      }
    });
    b.addEventListener('pointerup', () => window.clearTimeout(pressTimer));
    b.addEventListener('pointerleave', () => window.clearTimeout(pressTimer));
    b.addEventListener('click', (e) => {
      e.stopPropagation();
      if (longPressed) return;
      turn(i, 1);
    });
    b.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      turn(i, -1);
    });
    b.addEventListener('focus', () => {
      st.focus = i;
      draw();
    });
    b.addEventListener('blur', () => {
      if (st.focus === i) st.focus = -1;
      draw();
    });
    b.addEventListener('keydown', (e) => {
      const r = Math.floor(i / 3);
      const c = i % 3;
      let next = -1;
      if (e.key === 'ArrowUp') next = ((r + 2) % 3) * 3 + c;
      else if (e.key === 'ArrowDown') next = ((r + 1) % 3) * 3 + c;
      else if (e.key === 'ArrowLeft') next = r * 3 + ((c + 2) % 3);
      else if (e.key === 'ArrowRight') next = r * 3 + ((c + 1) % 3);
      else if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        turn(i, e.shiftKey ? -1 : 1);
        return;
      } else if (e.key === 'r' || e.key === 'R') {
        e.preventDefault();
        turn(i, -1);
        return;
      }
      if (next >= 0) {
        e.preventDefault();
        tileBtns[next].focus();
      }
    });
    tileBtns.push(b);
    boardWrap.append(b);
  }

  const side = h(
    'div',
    { class: 'side' },
    h('div', { class: 'label-row' }, h('span', { class: 'accent', text: '◤ PUZZLE 01' }), h('span', { text: 'DER ENERGIEPFAD' })),
    readout,
    h(
      'div',
      { class: 'rules' },
      h('b', { text: 'REGELN' }),
      h('div', { text: '· Antippen dreht ein Segment im Uhrzeigersinn, lange drücken / Rechtsklick / Umschalt dreht zurück.' }),
      h('div', { text: '· Strom fließt nur, wo Öffnungen direkt aneinanderstoßen.' }),
      h('div', { text: '· Das verschweißte Mittelstück ist fest.' }),
      h('div', { text: '· Das verbrannte Segment darf keinen Strom bekommen.' }),
    ),
    hintBox,
    h('div', { class: 'button-row' }, hintBtn, undoBtn, resetBtn, closeBtn),
  );
  const root = h('div', { class: 'puzzle', role: 'dialog', 'aria-label': 'Puzzle 01: Der Energiepfad' }, boardWrap, side);
  const overlay = h('div', { class: 'overlay', id: 'puzzle' }, root);

  function layout(): void {
    const dpr = window.devicePixelRatio || 1;
    const narrow = window.innerWidth < 760 || window.innerHeight > window.innerWidth;
    root.classList.toggle('stack', narrow);
    const maxW = narrow ? Math.min(window.innerWidth - 40, 520) : Math.min(window.innerWidth * 0.55, 560);
    const maxH = narrow ? window.innerHeight * 0.48 : window.innerHeight - 60;
    const k = Math.max(2, Math.floor(Math.min((maxW * dpr) / CW, (maxH * dpr) / CH)));
    const css = k / dpr;
    canvas.style.width = `${CW * css}px`;
    canvas.style.height = `${CH * css}px`;
    for (let i = 0; i < 9; i++) {
      const r = Math.floor(i / 3);
      const c = i % 3;
      const b = tileBtns[i];
      b.style.left = `${(BX + c * (T + G)) * css}px`;
      b.style.top = `${(BY + r * (T + G)) * css}px`;
      b.style.width = `${T * css}px`;
      b.style.height = `${T * css}px`;
    }
  }

  function evaluateAndLabel(): void {
    const res = evaluate(def, rot);
    st.rot = rot;
    st.powered = res.powered;
    st.shortAt = res.shortAt;
    st.solved = res.solved;
    const count = res.powered.filter(Boolean).length;
    readout.innerHTML = '';
    if (res.solved) {
      readout.append(h('div', { class: 'ok', text: 'PFAD GESCHLOSSEN.' }), h('div', { class: 'ok', text: 'ZIEL UNTER SPANNUNG.' }));
    } else if (res.shortAt >= 0) {
      readout.append(h('div', { class: 'err', text: 'KURZSCHLUSS!' }), h('div', { text: `STROM IM VERBRANNTEN SEGMENT · ${count}/9` }));
    } else {
      readout.append(h('div', { text: `STROMFLUSS: ${count}/9 SEGMENTE` }), h('div', { text: 'ZIEL: KEIN STROM' }));
    }
    readout.append(h('div', { text: `ZÜGE: ${moves}` }));
    for (let i = 0; i < 9; i++) {
      const fixed = !!def.tiles[i].fixed;
      tileBtns[i].setAttribute('aria-label', describeTile(def, rot, i, res.powered[i]) + (fixed ? ' Nicht drehbar.' : ''));
      tileBtns[i].setAttribute('aria-disabled', String(fixed));
    }
    undoBtn.disabled = history.length === 0;
  }

  function renderHints(): void {
    hintBox.innerHTML = '';
    if (hints === 0) {
      hintBox.style.display = 'none';
    } else {
      hintBox.style.display = '';
      for (let k = 0; k < hints; k++) hintBox.append(h('div', {}, h('span', { class: 'stage', text: `HINWEIS ${k + 1}` }), HINT_TEXTS[k]));
    }
    hintBtn.querySelector('span')!.textContent = hints >= 3 ? 'Hinweise 3/3' : `Hinweis ${hints + 1}/3`;
    hintBtn.disabled = hints >= 3;
  }

  function draw(): void {
    drawBoard(buf, def, st, o.reducedMotion);
    for (let i = 0; i < buf.d.length; i++) u32[i] = PALETTE_U32[buf.d[i]];
    ctx.putImageData(img, 0, 0);
  }

  function turn(i: number, dir: 1 | -1): void {
    if (solvedFired) return;
    if (def.tiles[i].fixed) {
      o.sfx('deny');
      st.flashTile = i;
      st.flash = 200;
      draw();
      return;
    }
    history.push(rot.slice());
    rot = rotateTile(def, rot, i, dir);
    moves++;
    st.flashTile = i;
    st.flash = 240;
    o.sfx('rotate');
    evaluateAndLabel();
    o.onChange(rot.slice(), moves);
    if (st.shortAt >= 0) o.sfx('short');
    draw();
    checkSolved();
  }

  function undo(): void {
    const prev = history.pop();
    if (!prev || solvedFired) return;
    rot = prev;
    moves++;
    o.sfx('rotate');
    evaluateAndLabel();
    o.onChange(rot.slice(), moves);
    draw();
    checkSolved();
  }

  function reset(): void {
    if (solvedFired) return;
    history.length = 0;
    rot = def.start.slice();
    o.sfx('beep');
    evaluateAndLabel();
    o.onChange(rot.slice(), moves);
    draw();
  }

  function revealHint(): void {
    if (hints >= 3) return;
    hints++;
    o.onHint(hints);
    o.sfx('beep');
    renderHints();
  }

  function checkSolved(): void {
    if (!st.solved || solvedFired) return;
    solvedFired = true;
    o.sfx('solved');
    for (const b of tileBtns) b.disabled = true;
    window.setTimeout(() => o.onSolved(), 1400);
  }

  overlay.addEventListener('keydown', (e) => {
    if (e.code === 'KeyH') revealHint();
    else if (e.code === 'KeyU') undo();
  });

  let raf = 0;
  let last = performance.now();
  const loop = (now: number) => {
    const dt = now - last;
    last = now;
    st.t += dt;
    if (st.flash > 0) st.flash = Math.max(0, st.flash - dt);
    if (!o.reducedMotion || st.flash > 0) draw();
    raf = requestAnimationFrame(loop);
  };

  evaluateAndLabel();
  renderHints();
  layout();
  draw();
  raf = requestAnimationFrame(loop);
  window.addEventListener('resize', layout);
  tileBtns[3].dataset.autofocus = '';

  return {
    el: overlay,
    closable: true,
    destroy: () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', layout);
    },
  };
}
