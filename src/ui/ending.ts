/** Chapter completion screen. */

import { bannerMark, emblemMark } from './brand';
import { button, h } from './dom';
import type { Modal } from './ui';

export interface EndingOpts {
  playTime: number;
  hints: number;
  reducedMotion: boolean;
  onReplay: () => void;
  onMenu: () => void;
}

function fmtTime(s: number): string {
  const m = Math.floor(s / 60);
  const r = Math.floor(s % 60);
  return `${m}:${String(r).padStart(2, '0')} MIN`;
}

export function endingPanel(o: EndingOpts): Modal {
  const l1 = h('div', { class: 'line1', text: 'KAPITEL 0 ABGESCHLOSSEN' });
  const l2 = h('div', { class: 'line2' }, bannerMark({ cls: 'ending-banner', label: 'Die Kalibrierungsanlage III – Die Übergabe' }), h('span', { class: 'sr-only', text: 'DIE KALIBRIERUNGSANLAGE III' }));
  const credit = h('div', { class: 'credit' }, emblemMark('simple', { cls: 'ending-emblem', boot: 4700 * (o.reducedMotion ? 0.25 : 1) }), h('span', { text: 'EIN PROTOTYP VON TEAM_APERTURE' }));
  const stats = h('div', { class: 'stats', text: `NULLSIGNAL · SPIELZEIT ${fmtTime(o.playTime)} · HINWEISE ${o.hints}/3` });
  const replay = button('Kapitel 0 erneut spielen', o.onReplay, { cls: 'mint', id: 'btn-replay' });
  const menu = button('Hauptmenü', o.onMenu, { id: 'btn-menu' });
  const row = h('div', { class: 'button-row' }, replay, menu);
  const wrap = h('div', { class: 'ending', role: 'dialog', 'aria-label': 'Kapitel 0 abgeschlossen' }, l1, l2, stats, credit, row);
  const el = h('div', { class: 'overlay opaque', id: 'ending' }, wrap);
  const d = o.reducedMotion ? 0.25 : 1;
  setTimeout(() => l1.classList.add('show'), 300 * d);
  setTimeout(() => l2.classList.add('show'), 2600 * d);
  setTimeout(() => stats.classList.add('show'), 4200 * d);
  setTimeout(() => credit.classList.add('show'), 4500 * d);
  setTimeout(() => {
    row.classList.add('show');
    replay.focus({ preventScroll: true });
  }, 4800 * d);
  return { el, closable: false };
}
