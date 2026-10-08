/**
 * BootScene – generates every texture procedurally (no image files): the player
 * sheets at all light levels, UI markers, veil stamps and the baked rooms.
 */

import Phaser from 'phaser';
import { addCanvasTexture, nextFrame } from '../../art/bake';
import { ditherDisc, pixelTexture } from '../../art/overlay';
import { C, PALETTE_U32 } from '../../art/palette';
import { LIGHT_LEVELS, PLAYER_H, PLAYER_W, FRAMES_PER_DIR, FACINGS, renderPlayerSheet } from '../../art/player';
import { bayer } from '../../art/dither';
import type { GameApp } from '../app';
import { ROOMS } from '../rooms';
import { VEIL_STAMPS } from '../systems/veil';

function canvas(w: number, hh: number, draw: (u32: Uint32Array) => void): HTMLCanvasElement {
  const cv = document.createElement('canvas');
  cv.width = w;
  cv.height = hh;
  const ctx = cv.getContext('2d')!;
  const img = ctx.createImageData(w, hh);
  const u32 = new Uint32Array(img.data.buffer);
  draw(u32);
  ctx.putImageData(img, 0, 0);
  return cv;
}

export class BootScene extends Phaser.Scene {
  constructor() {
    super('boot');
  }

  async create(): Promise<void> {
    const app = this.registry.get('app') as GameApp;
    const bar = document.querySelector<HTMLElement>('#loader .bar i');
    const label = document.querySelector<HTMLElement>('#loader .label');
    const set = (p: number, text?: string) => {
      if (bar) bar.style.width = `${Math.round(p * 100)}%`;
      if (text && label) label.textContent = text;
    };
    set(0.02, 'KALIBRIERE PALETTE');
    await nextFrame();

    // Player sheets.
    const addSheet = (key: string, cv: HTMLCanvasElement) => {
      const tex = this.textures.addCanvas(key, cv)!;
      const total = FRAMES_PER_DIR * FACINGS.length;
      for (let i = 0; i < total; i++) {
        tex.add(i, 0, (i % FRAMES_PER_DIR) * PLAYER_W, Math.floor(i / FRAMES_PER_DIR) * PLAYER_H, PLAYER_W, PLAYER_H);
      }
    };
    LIGHT_LEVELS.forEach((lv, i) => addSheet(`player@${i}`, renderPlayerSheet(lv)));
    addSheet('player.ghost', renderPlayerSheet(1, true));
    // Contact shadow: dithered ellipse.
    addCanvasTexture(
      this,
      'player.shadow',
      canvas(14, 7, (u32) => {
        for (let y = 0; y < 7; y++) {
          for (let x = 0; x < 14; x++) {
            const d = Math.hypot((x + 0.5 - 7) / 7, (y + 0.5 - 3.5) / 3.5);
            if (d < 1 && bayer(x, y) < (1 - d) * 1.6) u32[y * 14 + x] = PALETTE_U32[C.VOID];
          }
        }
      }),
    );
    set(0.08, 'ERZEUGE MARKIERUNGEN');

    // UI markers (amber diamond, small diamond, click ring + deny cross).
    const diamond = (size: number, color: number, inner: number) =>
      canvas(size, size + 2, (u32) => {
        const c = (size - 1) / 2;
        for (let y = 0; y < size; y++) {
          for (let x = 0; x < size; x++) {
            const d = Math.abs(x - c) + Math.abs(y - c);
            if (d <= c) u32[y * size + x] = PALETTE_U32[d >= c - 0.5 ? C.VOID : d <= c - 2 ? inner : color];
          }
        }
        u32[(size + 1) * size + Math.floor(c)] = PALETTE_U32[color];
      });
    addCanvasTexture(this, 'ui.marker', diamond(7, C.AMBER, C.PEACH));
    addCanvasTexture(this, 'ui.marker.small', diamond(5, C.MINT, C.CYAN));
    const click = canvas(22, 11, (u32) => {
      for (let y = 0; y < 11; y++) {
        for (let x = 0; x < 11; x++) {
          const d = Math.hypot((x + 0.5 - 5.5) / 5.5, (y + 0.5 - 5.5) / 2.75);
          if (d < 1 && d > 0.62 && y > 2 && y < 9) u32[y * 22 + x] = PALETTE_U32[C.MINT];
          // Deny cross in the second frame.
          const cx = x + 11;
          if ((Math.abs(x - 5) === Math.abs(y - 5) && Math.abs(x - 5) <= 3) || false) u32[y * 22 + cx] = PALETTE_U32[C.RED];
        }
      }
    });
    const ct = this.textures.addCanvas('ui.click', click)!;
    ct.add(0, 0, 0, 0, 11, 11);
    ct.add(1, 0, 11, 0, 11, 11);
    for (const r of VEIL_STAMPS) addCanvasTexture(this, `veil.stamp.${r}`, ditherDisc(r, C.WHITE, 1.6));
    for (const [k, c] of Object.entries({ white: C.WHITE, peach: C.PEACH, amber: C.AMBER, cyan: C.CYAN, mint: C.MINT, red: C.RED, s6: C.S6, s9: C.S9 })) {
      addCanvasTexture(this, `px.${k}`, pixelTexture(c));
    }
    await nextFrame();

    // Rooms.
    const ids = Object.keys(ROOMS) as Array<keyof typeof ROOMS>;
    for (let r = 0; r < ids.length; r++) {
      const room = ROOMS[ids[r]];
      await room.bake(this, (p) => set(0.1 + ((r + p) / ids.length) * 0.88, `BAUE ${room.title.toUpperCase()}`));
    }
    set(1, 'BEREIT');
    await nextFrame();
    app.booted();
  }
}
