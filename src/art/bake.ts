/**
 * Baking: G-buffer surfaces × lighting states → Phaser textures.
 * Keeps a registry of where each baked texture sits in projected screen space.
 */

import type Phaser from 'phaser';
import { indicesToCanvas, shade, type LightingState } from './light';
import { PALETTE_U32 } from './palette';
import type { Surface } from './surface';

export interface BakedInfo {
  key: string;
  ox: number;
  oy: number;
  w: number;
  h: number;
}

const registry = new Map<string, BakedInfo>();

export function bakedInfo(key: string): BakedInfo {
  const info = registry.get(key);
  if (!info) throw new Error(`Texture not baked: ${key}`);
  return info;
}

export function hasBaked(key: string): boolean {
  return registry.has(key);
}

export function addCanvasTexture(scene: Phaser.Scene, key: string, canvas: HTMLCanvasElement, ox = 0, oy = 0): BakedInfo {
  if (scene.textures.exists(key)) scene.textures.remove(key);
  scene.textures.addCanvas(key, canvas);
  const info = { key, ox, oy, w: canvas.width, h: canvas.height };
  registry.set(key, info);
  return info;
}

export function bakeSurface(scene: Phaser.Scene, key: string, surf: Surface, state: LightingState): BakedInfo {
  const idx = shade(surf, state);
  const cv = indicesToCanvas(idx, surf.w, surf.h, PALETTE_U32);
  return addCanvasTexture(scene, key, cv, surf.ox, surf.oy);
}

/**
 * Lets the browser breathe between heavy bake steps (keeps the loader animated).
 * Falls back to a timer because animation frames stop in hidden tabs (e.g. when a
 * phone user switches apps while the game is loading).
 */
export function nextFrame(): Promise<void> {
  return new Promise((resolve) => {
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      resolve();
    };
    if (typeof requestAnimationFrame === 'function') requestAnimationFrame(finish);
    setTimeout(finish, 32);
  });
}
