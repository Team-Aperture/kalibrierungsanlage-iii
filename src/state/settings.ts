import { safeStorage } from './save';
import type { Settings } from './types';

export const SETTINGS_KEY = 'ka3.settings.v1';

export function defaultSettings(): Settings {
  const reduce = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  return { v: 1, crt: 0.6, flicker: !reduce, reducedMotion: reduce, volume: 0.7, muted: false, joystick: false, textSpeed: 55 };
}

function num(v: unknown, lo: number, hi: number, fallback: number): number {
  return typeof v === 'number' && Number.isFinite(v) ? Math.max(lo, Math.min(hi, v)) : fallback;
}

export function loadSettings(): Settings {
  const d = defaultSettings();
  const s = safeStorage();
  if (!s) return d;
  try {
    const raw = JSON.parse(s.getItem(SETTINGS_KEY) || 'null');
    if (!raw || typeof raw !== 'object' || raw.v !== 1) return d;
    return {
      v: 1,
      crt: num(raw.crt, 0, 1, d.crt),
      flicker: typeof raw.flicker === 'boolean' ? raw.flicker : d.flicker,
      reducedMotion: typeof raw.reducedMotion === 'boolean' ? raw.reducedMotion : d.reducedMotion,
      volume: num(raw.volume, 0, 1, d.volume),
      muted: typeof raw.muted === 'boolean' ? raw.muted : d.muted,
      joystick: typeof raw.joystick === 'boolean' ? raw.joystick : d.joystick,
      textSpeed: num(raw.textSpeed, 0, 200, d.textSpeed),
    };
  } catch {
    return d;
  }
}

export function saveSettings(settings: Settings): void {
  try {
    safeStorage()?.setItem(SETTINGS_KEY, JSON.stringify(settings));
  } catch {
    /* ignore */
  }
}
