/**
 * The veil: a screen-sized darkness layer with dithered "holes" punched in at light
 * positions. Used for the opening (darkness → indicator → terminal → reveal), for the
 * ending event and for the menu backdrop. Cheap: one RenderTexture, a few erases.
 */

import Phaser from 'phaser';
import { toScreen, type Vec3 } from '../../core/projection';
import { PALETTE_HEX } from '../../art/palette';

export interface Hole {
  p: Vec3;
  radius: number;
  /** 0…1 visibility (flicker by animating this). */
  on: number;
}

const STAMPS = [6, 12, 24, 48, 96];

export class Veil {
  private rt: Phaser.GameObjects.RenderTexture;
  alpha = 0;
  holes: Hole[] = [];
  private color: number;
  private stampImages = new Map<number, Phaser.GameObjects.Image>();

  constructor(private scene: Phaser.Scene) {
    const cam = scene.cameras.main;
    this.rt = scene.add.renderTexture(0, 0, cam.width, cam.height).setOrigin(0, 0).setScrollFactor(0).setDepth(9000);
    this.color = parseInt(PALETTE_HEX[0].slice(1), 16);
    this.rt.setVisible(false);
  }

  resize(w: number, h: number): void {
    this.rt.resize(w, h);
  }

  hole(p: Vec3, radius: number, on = 1): Hole {
    const h = { p, radius, on };
    this.holes.push(h);
    return h;
  }

  clearHoles(): void {
    this.holes.length = 0;
  }

  /** Tween helper for the veil opacity. */
  fadeTo(alpha: number, ms: number): Promise<void> {
    return new Promise((resolve) => {
      if (ms <= 0) {
        this.alpha = alpha;
        resolve();
        return;
      }
      this.scene.tweens.add({ targets: this, alpha, duration: ms, ease: 'Sine.easeInOut', onComplete: () => resolve() });
    });
  }

  update(): void {
    const visible = this.alpha > 0.01;
    this.rt.setVisible(visible);
    if (!visible) return;
    const cam = this.scene.cameras.main;
    this.rt.clear();
    this.rt.fill(this.color, this.alpha);
    for (const h of this.holes) {
      if (h.on <= 0.05) continue;
      const r = h.radius * h.on;
      const s = toScreen(h.p.x, h.p.y, h.p.z);
      const stamp = STAMPS.find((v) => v >= r) ?? STAMPS[STAMPS.length - 1];
      const scale = r / stamp;
      const x = Math.round(s.sx - cam.scrollX - r);
      const y = Math.round(s.sy - cam.scrollY - r);
      // Erase with an integer-scaled stamp keeps the dither crisp.
      let img = this.stampImages.get(stamp);
      if (!img) {
        img = this.scene.make.image({ key: `veil.stamp.${stamp}`, x: 0, y: 0, add: false }).setOrigin(0, 0);
        this.stampImages.set(stamp, img);
      }
      img.setScale(scale);
      this.rt.erase(img, x, y);
    }
  }

  destroy(): void {
    for (const img of this.stampImages.values()) img.destroy();
    this.stampImages.clear();
    this.rt.destroy();
  }
}

export const VEIL_STAMPS = STAMPS;
