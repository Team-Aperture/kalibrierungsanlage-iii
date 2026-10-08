/** Inventory panel: inspect items, or pick one to use on an object in the world. */

import { iconCanvas } from '../art/icons';
import { ITEMS } from '../content/items';
import type { ItemId } from '../state/types';
import { button, h } from './dom';
import type { Modal } from './ui';

export interface InventoryOpts {
  items: ItemId[];
  onUse: (item: ItemId) => void;
  onClose: () => void;
}

export function inventoryPanel(o: InventoryOpts): Modal {
  let selected: ItemId | null = o.items[0] ?? null;
  const grid = h('div', { class: 'items', role: 'listbox', 'aria-label': 'Gegenstände' });
  const desc = h('div', { class: 'desc', 'aria-live': 'polite' });
  const useBtn = button('Benutzen mit …', () => selected && o.onUse(selected), { cls: 'mint' });
  const render = () => {
    grid.innerHTML = '';
    if (!o.items.length) {
      grid.append(h('div', { class: 'empty', text: 'Keine Gegenstände.' }));
      desc.textContent = '';
      useBtn.disabled = true;
      return;
    }
    for (const id of o.items) {
      const b = h('button', { class: 'item', type: 'button', role: 'option', 'aria-pressed': String(id === selected), 'aria-selected': String(id === selected) });
      const icon = iconCanvas(id);
      b.append(icon, h('span', { text: ITEMS[id].name }));
      b.addEventListener('click', () => {
        selected = id;
        render();
      });
      b.addEventListener('dblclick', () => o.onUse(id));
      grid.append(b);
    }
    desc.textContent = selected ? ITEMS[selected].description : '';
    useBtn.disabled = !selected;
  };
  render();
  const close = button('Schließen', o.onClose, { key: 'Esc' });
  const panel = h(
    'div',
    { class: 'panel inventory', role: 'dialog', 'aria-label': 'Inventar' },
    h('h2', { text: 'INVENTAR' }),
    grid,
    desc,
    h('div', { class: 'button-row' }, useBtn, close),
  );
  (grid.querySelector('button') as HTMLElement | null)?.setAttribute('data-autofocus', '');
  return { el: h('div', { class: 'overlay', id: 'inventory' }, panel), closable: true };
}
