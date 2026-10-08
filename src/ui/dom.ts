/** Tiny DOM helpers for building the interface without a framework. */

export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Record<string, string | number | boolean | undefined> = {},
  ...children: Array<Node | string | null | undefined | false>
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === undefined || v === false) continue;
    if (k === 'class') el.className = String(v);
    else if (k === 'text') el.textContent = String(v);
    else el.setAttribute(k, v === true ? '' : String(v));
  }
  for (const c of children) {
    if (c === null || c === undefined || c === false) continue;
    el.append(typeof c === 'string' ? document.createTextNode(c) : c);
  }
  return el;
}

export function button(label: string, onClick: () => void, opts: { cls?: string; key?: string; aria?: string; id?: string } = {}): HTMLButtonElement {
  const b = h('button', { class: `btn ${opts.cls ?? ''}`.trim(), type: 'button', 'aria-label': opts.aria, id: opts.id });
  b.append(h('span', { text: label }));
  if (opts.key) b.append(h('span', { class: 'key', text: opts.key, 'aria-hidden': 'true' }));
  b.addEventListener('click', (e) => {
    e.stopPropagation();
    onClick();
  });
  return b;
}

/** Keeps keyboard focus inside a modal while it is open. */
export function trapFocus(root: HTMLElement): () => void {
  const prev = document.activeElement as HTMLElement | null;
  const handler = (e: KeyboardEvent) => {
    if (e.key !== 'Tab') return;
    const items = [...root.querySelectorAll<HTMLElement>('button, [href], input, select, [tabindex]:not([tabindex="-1"])')].filter(
      (el) => !el.hasAttribute('disabled') && el.offsetParent !== null,
    );
    if (!items.length) return;
    const first = items[0];
    const last = items[items.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  };
  root.addEventListener('keydown', handler);
  return () => {
    root.removeEventListener('keydown', handler);
    if (prev && document.contains(prev)) prev.focus({ preventScroll: true });
  };
}
