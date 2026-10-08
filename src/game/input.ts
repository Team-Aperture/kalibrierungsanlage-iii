/**
 * Keyboard + virtual joystick input, independent of Phaser so HTML overlays keep
 * full control over focus and keys while they are open.
 */

import { Emitter } from '../core/events';

export type GameAction = 'primary' | 'look' | 'inventory' | 'pause' | 'markers' | 'hint';

export interface InputEvents extends Record<string, unknown> {
  action: GameAction;
}

const MOVE: Record<string, [number, number]> = {
  KeyW: [0, -1],
  ArrowUp: [0, -1],
  KeyS: [0, 1],
  ArrowDown: [0, 1],
  KeyA: [-1, 0],
  ArrowLeft: [-1, 0],
  KeyD: [1, 0],
  ArrowRight: [1, 0],
};

const ACTIONS: Record<string, GameAction> = {
  KeyE: 'primary',
  Enter: 'primary',
  Space: 'primary',
  KeyQ: 'look',
  KeyI: 'inventory',
  Escape: 'pause',
  KeyP: 'pause',
  Tab: 'markers',
  KeyH: 'hint',
};

export class InputManager extends Emitter<InputEvents> {
  private pressed = new Set<string>();
  /** Virtual joystick vector in screen space (−1…1). */
  joy = { x: 0, y: 0 };
  /** When true, game keys are ignored (an overlay owns the keyboard). */
  blocked = () => false;

  constructor() {
    super();
    window.addEventListener('keydown', (e) => this.onDown(e));
    window.addEventListener('keyup', (e) => this.pressed.delete(e.code));
    window.addEventListener('blur', () => this.clear());
    document.addEventListener('visibilitychange', () => this.clear());
  }

  private onDown(e: KeyboardEvent): void {
    if (e.defaultPrevented) return;
    const target = e.target as HTMLElement | null;
    const inField = target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable);
    if (inField) return;
    if (e.code === 'Escape' || e.code === 'KeyP') {
      // Escape is always routed (overlays close themselves first).
      if (!e.repeat) this.emit('action', 'pause');
      return;
    }
    if (this.blocked()) return;
    if (MOVE[e.code]) {
      this.pressed.add(e.code);
      e.preventDefault();
      return;
    }
    const a = ACTIONS[e.code];
    if (a && !e.repeat) {
      // Let focused buttons handle their own Enter/Space activation.
      if ((e.code === 'Enter' || e.code === 'Space') && target && target.tagName === 'BUTTON') return;
      e.preventDefault();
      this.emit('action', a);
    }
  }

  clear(): void {
    this.pressed.clear();
    this.joy.x = 0;
    this.joy.y = 0;
  }

  /** Screen-space direction from keys and joystick, components in −1…1. */
  moveVector(out: { x: number; y: number }): { x: number; y: number } {
    let x = 0;
    let y = 0;
    if (!this.blocked()) {
      for (const code of this.pressed) {
        const m = MOVE[code];
        if (m) {
          x += m[0];
          y += m[1];
        }
      }
      x = Math.max(-1, Math.min(1, x));
      y = Math.max(-1, Math.min(1, y));
      if (x === 0 && y === 0) {
        x = this.joy.x;
        y = this.joy.y;
      }
    }
    out.x = x;
    out.y = y;
    return out;
  }
}
