/**
 * HTML interface layer: HUD, action bar, dialogue, toasts, modal stack and the
 * responsive layout (landscape: overlays on a full-screen view; portrait: game view
 * on top, controls in a dock below).
 */

import { computeLayout, isPortraitViewport, type DisplayLayout } from '../game/display';
import { ITEMS } from '../content/items';
import { iconCanvas } from '../art/icons';
import type { ItemId, Settings } from '../state/types';
import { Dialogue } from './dialogue';
import { emblemMark } from './brand';
import { button, h, trapFocus } from './dom';
import { Joystick } from './joystick';

export interface FocusInfo {
  id: string;
  name: string;
  verbs: Array<{ id: string; label: string; primary: boolean }>;
}

export interface Modal {
  el: HTMLElement;
  /** Escape / back closes it when true. */
  closable: boolean;
  onClose?: () => void;
}

export interface UIHandlers {
  verb: (verbId: string) => void;
  pause: () => void;
  inventory: () => void;
  markers: () => void;
  layout: (l: DisplayLayout) => void;
  cancelItem: () => void;
}

export class UI {
  readonly app: HTMLElement;
  readonly stage: HTMLElement;
  readonly gameWrap: HTMLElement;
  readonly dialogue: Dialogue;
  readonly joystick: Joystick;
  private hud: HTMLElement;
  private dock: HTMLElement;
  private actions: HTMLElement;
  private itemStrip: HTMLElement;
  /** Items currently carried (for the quick strip). */
  items: ItemId[] = [];
  onItemTap: ((item: ItemId) => void) | null = null;
  private statusEl: HTMLElement;
  private statusBadge: HTMLElement;
  private invBtn: HTMLButtonElement;
  private menuBtn: HTMLButtonElement;
  private markerBtn: HTMLButtonElement;
  private toastEl: HTMLElement;
  private hoverEl: HTMLElement;
  private hintEl: HTMLElement;
  private bigEl: HTMLElement;
  private modals: Array<Modal & { release: () => void }> = [];
  private focus: FocusInfo | null = null;
  private toastTimer = 0;
  private hintTimer = 0;
  private movedOnce = false;
  private cinematic = false;
  pendingItem: ItemId | null = null;
  layout: DisplayLayout | null = null;
  inGame = false;
  readonly touch: boolean;

  constructor(
    private handlers: UIHandlers,
    private settings: () => Settings,
  ) {
    this.app = document.getElementById('app')!;
    this.stage = document.getElementById('stage')!;
    this.gameWrap = document.getElementById('game-wrap')!;
    this.touch = matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;
    document.body.classList.toggle('touch', this.touch);

    // HUD (top bar).
    this.menuBtn = button('Menü', () => this.handlers.pause(), { key: 'Esc', aria: 'Pausenmenü öffnen' });
    this.statusEl = h('div', { class: 'status', role: 'status' });
    this.statusBadge = emblemMark('badge', { cls: 'hud-badge', label: '' });
    this.statusBadge.setAttribute('aria-hidden', 'true');
    // Attached from the start, so its animation is never given up as "never shown".
    this.statusEl.append(this.statusBadge);
    this.markerBtn = button('◇', () => this.handlers.markers(), { key: 'Tab', aria: 'Interaktive Objekte hervorheben' });
    this.invBtn = button('Inventar', () => this.handlers.inventory(), { key: 'I', aria: 'Inventar öffnen' });
    this.hud = h('div', { id: 'hud' }, h('div', { class: 'hud-top' }, this.menuBtn, this.statusEl, this.markerBtn, this.invBtn));
    this.toastEl = h('div', { class: 'toast', role: 'status', 'aria-live': 'polite' });
    this.hoverEl = h('div', { class: 'hover-label', 'aria-hidden': 'true' });
    this.hintEl = h('div', { class: 'hint-line' });
    this.bigEl = h('div', { class: 'big-message', 'aria-live': 'assertive' });
    this.hud.append(this.toastEl, this.hoverEl, this.hintEl, this.bigEl);
    this.stage.append(this.hud);

    // Dock (dialogue + context actions).
    this.dock = h('div', { id: 'dock' });
    this.dialogue = new Dialogue(this.dock);
    this.actions = h('div', { class: 'actions', 'aria-label': 'Aktionen' });
    this.itemStrip = h('div', { class: 'item-strip', 'aria-label': 'Gegenstände' });
    this.dock.append(this.actions, this.itemStrip);
    this.app.append(this.dock);
    this.dialogue.speed = () => this.settings().textSpeed;
    // Tapping empty space in the dock (portrait) also advances dialogue.
    this.dock.addEventListener('click', (e) => {
      if (this.dialogue.open && !this.hasModal && !(e.target as HTMLElement).closest('button')) this.dialogue.advance();
    });
    this.dialogue.onOpenChange = () => this.renderActions();

    this.joystick = new Joystick(this.stage);

    this.setInGame(false);
    window.addEventListener('resize', () => this.scheduleLayout());
    window.addEventListener('orientationchange', () => this.scheduleLayout(250));
    window.visualViewport?.addEventListener('resize', () => this.scheduleLayout());
    this.applyLayout();
  }

  // ------------------------------------------------------------------ layout

  private layoutTimer = 0;

  scheduleLayout(delay = 60): void {
    window.clearTimeout(this.layoutTimer);
    this.layoutTimer = window.setTimeout(() => this.applyLayout(), delay);
  }

  private safeInsets(): { top: number; right: number; bottom: number; left: number } {
    const probe = h('div', { style: 'position:fixed;inset:0;padding:env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left);visibility:hidden;pointer-events:none' });
    document.body.append(probe);
    const cs = getComputedStyle(probe);
    const r = { top: parseFloat(cs.paddingTop) || 0, right: parseFloat(cs.paddingRight) || 0, bottom: parseFloat(cs.paddingBottom) || 0, left: parseFloat(cs.paddingLeft) || 0 };
    probe.remove();
    return r;
  }

  applyLayout(): void {
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const portrait = isPortraitViewport(vw, vh);
    const safe = this.safeInsets();
    this.app.classList.toggle('portrait', portrait);
    this.app.classList.toggle('landscape', !portrait);
    const dpr = window.devicePixelRatio || 1;
    let layout: DisplayLayout;
    if (portrait) {
      const topBar = 46;
      const availW = vw - safe.left - safe.right;
      const maxH = Math.min(vh * 0.62 - topBar, availW * 1.35);
      layout = computeLayout({ width: availW, height: maxH }, dpr, true);
      this.stage.style.height = `${Math.ceil(layout.cssH + safe.top + topBar + 4)}px`;
      document.documentElement.style.setProperty('--dock-h', '0px');
    } else {
      this.stage.style.height = '';
      layout = computeLayout({ width: vw - safe.left - safe.right, height: vh - safe.top - safe.bottom }, dpr, false);
      document.documentElement.style.setProperty('--dock-h', `${Math.max(0, this.dock.offsetHeight - 8)}px`);
    }
    this.layout = layout;
    this.gameWrap.style.width = `${layout.cssW}px`;
    this.gameWrap.style.height = `${layout.cssH}px`;
    document.documentElement.style.setProperty('--px', `${layout.cssPx}px`);
    this.handlers.layout(layout);
  }

  // ------------------------------------------------------------------ state

  get blocking(): boolean {
    return this.dialogue.open || this.modals.length > 0;
  }

  get hasModal(): boolean {
    return this.modals.length > 0;
  }

  setInGame(on: boolean): void {
    this.inGame = on;
    this.hud.style.display = on ? '' : 'none';
    this.dock.style.display = on ? '' : 'none';
    this.joystick.setEnabled(on && this.settings().joystick);
    if (!on) this.setFocus(null);
  }

  applySettings(s: Settings): void {
    document.documentElement.style.setProperty('--crt', String(s.crt));
    document.body.classList.toggle('no-flicker', !s.flicker);
    document.body.classList.toggle('reduce-motion', s.reducedMotion);
    // No overlay at all when it would be invisible or in performance mode (saves compositing).
    document.body.classList.toggle('crt-off', s.lite || s.crt <= 0.001);
    this.joystick.setEnabled(this.inGame && s.joystick);
  }

  setCinematic(on: boolean): void {
    this.cinematic = on;
    document.body.classList.toggle('cinematic', on);
    this.renderActions();
  }

  setStatus(text: string): void {
    this.statusEl.innerHTML = '';
    this.statusEl.append(this.statusBadge);
    const parts = text.split('·').map((s) => s.trim());
    parts.forEach((p, i) => {
      if (i > 0) this.statusEl.append(' · ');
      const span = h('span', { text: p });
      if (/UNBEKANNT|UNTERBROCHEN|KURZSCHLUSS|\?/.test(p)) span.className = 'accent';
      this.statusEl.append(span);
    });
  }

  setItems(items: ItemId[]): void {
    this.items = items.slice();
    this.renderItemStrip();
  }

  private renderItemStrip(): void {
    const el = this.itemStrip;
    el.innerHTML = '';
    for (const id of this.items) {
      const b = h('button', { class: `btn item-quick ${this.pendingItem === id ? 'mint' : ''}`, type: 'button', 'aria-label': `${ITEMS[id].name} benutzen` });
      const icon = iconCanvas(id);
      b.append(icon, h('span', { text: ITEMS[id].name }));
      b.addEventListener('click', (e) => {
        e.stopPropagation();
        this.onItemTap?.(id);
      });
      el.append(b);
    }
  }

  setInventoryCount(n: number, highlight = false): void {
    const label = this.invBtn.querySelector('span')!;
    label.innerHTML = '';
    label.append('Inventar', n ? h('span', { class: 'count', text: ` ${n}` }) : '');
    if (highlight) {
      this.invBtn.classList.remove('attention');
      void this.invBtn.offsetWidth;
      this.invBtn.classList.add('attention');
    }
  }

  setFocus(f: FocusInfo | null): void {
    this.focus = f;
    this.renderActions();
  }

  setPendingItem(item: ItemId | null): void {
    this.pendingItem = item;
    this.renderActions();
    this.renderItemStrip();
  }

  private renderActions(): void {
    const a = this.actions;
    a.innerHTML = '';
    if (!this.inGame || this.cinematic || this.dialogue.open) {
      if (this.app.classList.contains('portrait') && this.inGame && !this.dialogue.open) a.append(h('div', { class: 'idle-help', text: ' ' }));
      return;
    }
    if (this.pendingItem) {
      a.append(h('div', { class: 'name', text: `${ITEMS[this.pendingItem].name} → Ziel antippen` }));
      a.append(button('Abbrechen', () => this.handlers.cancelItem(), { key: 'Esc' }));
      return;
    }
    const f = this.focus;
    if (!f) {
      if (this.app.classList.contains('portrait')) {
        a.append(
          h('div', {
            class: 'idle-help',
            text: this.touch ? 'Tippen: gehen & benutzen · Lange drücken: untersuchen' : 'Klicken: gehen & benutzen · Rechtsklick: untersuchen',
          }),
        );
      }
      return;
    }
    a.append(h('div', { class: 'name', text: f.name }));
    const sorted = [...f.verbs].sort((x, y) => Number(y.primary) - Number(x.primary));
    for (const v of sorted) {
      const key = v.primary ? 'E' : v.id === 'look' ? 'Q' : undefined;
      a.append(button(v.label, () => this.handlers.verb(v.id), { cls: v.primary ? 'mint' : '', key }));
    }
  }

  // ------------------------------------------------------------------ feedback

  toast(text: string, ms = 2600): void {
    this.toastEl.textContent = text;
    this.toastEl.classList.add('show');
    window.clearTimeout(this.toastTimer);
    this.toastTimer = window.setTimeout(() => this.toastEl.classList.remove('show'), ms);
  }

  itemReceived(item: ItemId): void {
    this.toast(`Erhalten: ${ITEMS[item].name}`);
  }

  hover(name: string | null): void {
    this.hoverEl.textContent = name ?? '';
    this.hoverEl.classList.toggle('show', !!name);
    document.getElementById('game')!.style.cursor = name ? 'pointer' : '';
  }

  showIntroHint(): void {
    this.hintEl.textContent = this.touch
      ? 'Tippen zum Gehen · Objekte antippen · Lange drücken: untersuchen'
      : 'WASD / Pfeiltasten oder Klicken zum Gehen · Objekte anklicken · E benutzen · Q untersuchen';
    this.hintEl.classList.add('show');
    window.clearTimeout(this.hintTimer);
    this.hintTimer = window.setTimeout(() => this.hintEl.classList.remove('show'), 14000);
  }

  firstMove(): void {
    if (this.movedOnce) return;
    this.movedOnce = true;
    window.clearTimeout(this.hintTimer);
    this.hintTimer = window.setTimeout(() => this.hintEl.classList.remove('show'), 5000);
  }

  async bigMessage(text: string, ms: number): Promise<void> {
    this.bigEl.textContent = text;
    this.bigEl.classList.add('show');
    await new Promise((r) => setTimeout(r, ms));
    this.bigEl.classList.remove('show');
    await new Promise((r) => setTimeout(r, 600));
  }

  // ------------------------------------------------------------------ modals

  openModal(m: Modal): void {
    const root = document.getElementById('ui-root')!;
    root.append(m.el);
    const release = trapFocus(m.el);
    this.modals.push({ ...m, release });
    this.hover(null);
    requestAnimationFrame(() => {
      const first = m.el.querySelector<HTMLElement>('[data-autofocus], button, [tabindex="0"]');
      first?.focus({ preventScroll: true });
    });
  }

  closeModal(el: HTMLElement): void {
    const i = this.modals.findIndex((m) => m.el === el);
    if (i < 0) return;
    const [m] = this.modals.splice(i, 1);
    m.el.remove();
    m.release();
    m.onClose?.();
  }

  /** Escape handling: close the top modal if allowed. Returns true if something closed. */
  closeTop(): boolean {
    const top = this.modals[this.modals.length - 1];
    if (!top) return false;
    if (top.closable) this.closeModal(top.el);
    return true;
  }

  closeAll(): void {
    while (this.modals.length) this.closeModal(this.modals[this.modals.length - 1].el);
    this.dialogue.close();
  }

  isOpen(el: HTMLElement): boolean {
    return this.modals.some((m) => m.el === el);
  }
}
