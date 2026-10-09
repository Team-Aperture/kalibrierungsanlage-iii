/**
 * Close-up reader for terminals (green CRT) and paper documents (logbook).
 * Lines are typed out one by one; tapping or pressing a key shows everything.
 * Line prefixes: "!" warning (amber), "x" error (red), "~" dim, " " normal.
 */

import { emblemMark } from './brand';
import { button, h } from './dom';
import type { Modal } from './ui';

export interface ReaderOpts {
  title: string;
  lines: string[];
  paper?: boolean;
  /** Characters per second while typing (0 = instant). */
  speed: number;
  onLine?: () => void;
  onClose: () => void;
}

export function reader(o: ReaderOpts): Modal & { done: Promise<void> } {
  const screen = h('div', { class: 'screen', tabindex: '0', 'aria-live': 'polite' });
  const close = button('Schließen', () => o.onClose(), { cls: 'ghost', key: 'Esc' });
  const view = h(
    'div',
    { class: `terminal-view ${o.paper ? 'paper' : ''}`, role: 'dialog', 'aria-label': o.title },
    h('div', { class: 'bar' }, o.paper ? null : emblemMark('badge', { scale: 2, boot: 0, crt: true, cls: 'term-badge' }), h('span', { class: 'bar-title', text: o.title }), close),
    screen,
  );
  let skip = false;
  const reveal = () => (skip = true);
  view.addEventListener('pointerup', reveal);
  view.addEventListener('keydown', (e) => {
    if (e.code !== 'Escape') reveal();
  });
  const render = (line: string): HTMLElement => {
    let cls = '';
    let text = line;
    if (line.startsWith('!')) (cls = 'warn'), (text = line.slice(1));
    else if (line.startsWith('x')) (cls = 'err'), (text = line.slice(1));
    else if (line.startsWith('~')) (cls = 'dim'), (text = line.slice(1));
    else if (line.startsWith(' ')) text = line.slice(1);
    return h('div', { class: cls, text: text || ' ' });
  };
  const done = (async () => {
    const cursor = h('span', { class: 'cursor', text: o.paper ? '' : '█' });
    for (const line of o.lines) {
      const el = render(line);
      screen.append(el);
      if (!skip && o.speed > 0 && line.length > 0) {
        const full = el.textContent ?? '';
        el.textContent = '';
        for (let i = 0; i < full.length && !skip; i += 2) {
          el.textContent = full.slice(0, i + 2);
          await new Promise((r) => setTimeout(r, 1000 / o.speed));
        }
        el.textContent = full;
        o.onLine?.();
      }
      screen.scrollTop = screen.scrollHeight;
    }
    screen.append(cursor);
    screen.scrollTop = screen.scrollHeight;
  })();
  return { el: h('div', { class: 'overlay' }, view), closable: true, done };
}
