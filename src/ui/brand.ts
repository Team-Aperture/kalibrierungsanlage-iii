/**
 * DOM logo components: pixel-art canvases of the Team_Aperture emblem and the KA-III
 * banner, scaled with nearest-neighbour filtering and animated by one shared ticker.
 * A mark redraws only when its quantised light state changes, so a page full of
 * logos costs a handful of small canvas uploads per second.
 */

import { brandPulse, emblem, emblemBoot, paint, type EmblemVariant, type IndexedPixels } from '../art/brand';
import { h } from './dom';

export interface MarkOpts {
  /** Integer CSS pixels per art pixel; omit to size the canvas with CSS. */
  scale?: number;
  /** Play the CRT power-on reveal first (ms delay before it starts). */
  boot?: number;
  /** Animate the light pulse (default true). */
  animate?: boolean;
  /** Scanline / glow treatment for monitor-style marks. */
  crt?: boolean;
  cls?: string;
  label?: string;
}

const BOOT_MS = 1150;

let reduced = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

/** Called by the app whenever the "Bewegung reduzieren" setting changes. */
export function setBrandMotion(reducedMotion: boolean): void {
  reduced = reducedMotion;
}

export function brandMotionReduced(): boolean {
  return reduced;
}

interface Live {
  cv: HTMLCanvasElement;
  render: (now: number) => IndexedPixels;
  created: number;
  seen: boolean;
  last: IndexedPixels | null;
}

const live = new Set<Live>();
let raf = 0;

function tick(now: number): void {
  for (const m of live) {
    if (!m.cv.isConnected) {
      // Drop marks once they leave the page; marks never attached are given up after a
      // minute (long enough for slow boots, short enough not to pile up).
      if (m.seen || now - m.created > 60000) live.delete(m);
      continue;
    }
    m.seen = true;
    const px = m.render(now);
    if (px !== m.last) {
      m.last = px;
      paint(px, m.cv);
    }
  }
  raf = live.size ? requestAnimationFrame(tick) : 0;
}

function track(m: Live): void {
  live.add(m);
  if (!raf) raf = requestAnimationFrame(tick);
}

export function mount(kind: 'emblem' | 'banner', first: IndexedPixels, render: (t: number, bootP: number) => IndexedPixels, o: MarkOpts): HTMLElement {
  const cv = paint(first);
  cv.className = 'brand-canvas';
  if (o.scale) {
    cv.style.width = `${first.w * o.scale}px`;
    cv.style.height = `${first.h * o.scale}px`;
  }
  const wrap = h('span', {
    class: `brand-mark brand-${kind} ${o.crt ? 'crt' : ''} ${o.cls ?? ''}`.trim(),
    role: 'img',
    'aria-label': o.label ?? (kind === 'banner' ? 'Die Kalibrierungsanlage III – Die Übergabe' : 'Team_Aperture'),
  });
  wrap.append(cv);
  const animate = o.animate !== false;
  const bootDelay = o.boot;
  let start = -1;
  const m: Live = {
    cv,
    created: performance.now(),
    seen: false,
    last: first,
    render: (now) => {
      if (start < 0) start = now;
      const t = now - start;
      let bootP = 1;
      if (bootDelay !== undefined && !reduced) bootP = Math.min(1, Math.max(0, (t - bootDelay) / BOOT_MS));
      return render(animate ? now : 0, bootP);
    },
  };
  if (animate || bootDelay !== undefined) track(m);
  return wrap;
}

export function emblemMark(variant: EmblemVariant, o: MarkOpts = {}): HTMLElement {
  const bootable = o.boot !== undefined && !reduced;
  const first = bootable ? emblemBoot(variant, 0) : emblem(variant, brandPulse(0, reduced));
  return mount(
    'emblem',
    first,
    (t, bootP) => (bootP < 1 ? emblemBoot(variant, bootP) : emblem(variant, brandPulse(t, reduced || o.animate === false))),
    { ...o, cls: `${o.cls ?? ''} v-${variant}` },
  );
}
