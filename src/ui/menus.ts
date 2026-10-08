/** Main menu, pause menu, settings, confirmation and info panels. */

import { PALETTE_HEX } from '../art/palette';
import type { Settings } from '../state/types';
import { button, h } from './dom';
import type { Modal } from './ui';

export interface MainMenuOpts {
  hasSave: boolean;
  saveInfo?: string;
  onContinue: () => void;
  onNew: () => void;
  onSettings: () => void;
  onAbout: () => void;
}

export function mainMenu(o: MainMenuOpts): Modal {
  const strip = h('div', { class: 'palette-strip', 'aria-hidden': 'true' });
  for (const c of PALETTE_HEX) strip.append(h('span', { style: `background:${c}` }));
  const buttons = h('div', { class: 'button-col' });
  if (o.hasSave) {
    const b = button('Fortsetzen', o.onContinue, { cls: 'mint', id: 'btn-continue' });
    b.dataset.autofocus = '';
    buttons.append(b);
  }
  const nb = button('Neues Spiel', o.onNew, { cls: o.hasSave ? '' : 'mint', id: 'btn-new' });
  if (!o.hasSave) nb.dataset.autofocus = '';
  buttons.append(nb, button('Einstellungen', o.onSettings, { id: 'btn-settings' }), button('Über diesen Prototyp', o.onAbout));
  const panel = h(
    'div',
    { class: 'panel menu', role: 'dialog', 'aria-label': 'Hauptmenü' },
    h('div', { class: 'kicker' }, h('span', { class: 'accent', text: '◤ KA-III' }), h('span', { text: 'TEAM_APERTURE' }), h('span', { text: 'PROTOTYP 0.1' })),
    h('div', { class: 'title', text: 'DIE KALIBRIERUNGS­ANLAGE III' }),
    h('div', { class: 'subtitle', text: 'KAPITEL 0 — NULLSIGNAL' }),
    o.saveInfo ? h('div', { class: 'meta', text: o.saveInfo }) : null,
    strip,
    buttons,
    h('div', { class: 'foot', text: 'Nicht-kanonischer technischer Vertical Slice. Ton, Speicherstand und Einstellungen bleiben lokal in diesem Browser.' }),
  );
  return { el: h('div', { class: 'overlay', id: 'main-menu' }, panel), closable: false };
}

export interface PauseOpts {
  onResume: () => void;
  onInventory: () => void;
  onSettings: () => void;
  onMenu: () => void;
  room: string;
}

export function pauseMenu(o: PauseOpts): Modal {
  const resume = button('Fortsetzen', o.onResume, { cls: 'mint', key: 'Esc' });
  resume.dataset.autofocus = '';
  const panel = h(
    'div',
    { class: 'panel', role: 'dialog', 'aria-label': 'Pause' },
    h('div', { class: 'label-row' }, h('span', { class: 'accent', text: '◤ PAUSE' }), h('span', { text: o.room })),
    h('div', { class: 'button-col' }, resume, button('Inventar', o.onInventory, { key: 'I' }), button('Einstellungen', o.onSettings), button('Speichern & Hauptmenü', o.onMenu)),
    h('div', { class: 'section' }, h('div', { class: 'title', text: 'STEUERUNG' }), h('p', { text: 'Gehen: WASD / Pfeiltasten, Klicken oder Tippen · Benutzen: E, Klick, Tippen · Untersuchen: Q, Rechtsklick, lange drücken · Inventar: I · Objekte hervorheben: Tab' })),
  );
  return { el: h('div', { class: 'overlay', id: 'pause-menu' }, panel), closable: true };
}

export interface SettingsOpts {
  settings: Settings;
  onChange: (s: Settings) => void;
  onClose: () => void;
  onDeleteSave?: () => void;
  fullscreen: { supported: boolean; active: () => boolean; toggle: () => void };
}

export function settingsPanel(o: SettingsOpts): Modal {
  const s = { ...o.settings };
  const commit = () => o.onChange({ ...s });
  const rows: HTMLElement[] = [];
  const slider = (label: string, key: 'crt' | 'volume', fmt: (v: number) => string) => {
    const val = h('span', { class: 'value', text: fmt(s[key]) });
    const input = h('input', { type: 'range', min: 0, max: 100, step: 5, value: Math.round(s[key] * 100), 'aria-label': label }) as HTMLInputElement;
    input.addEventListener('input', () => {
      s[key] = Number(input.value) / 100;
      val.textContent = fmt(s[key]);
      commit();
    });
    rows.push(h('label', { class: 'setting' }, h('span', { text: label }), input, val));
  };
  const toggle = (label: string, key: 'flicker' | 'reducedMotion' | 'muted' | 'joystick', on = 'AN', off = 'AUS') => {
    const b = h('button', { class: 'btn toggle', type: 'button', 'aria-pressed': String(s[key]), 'aria-label': label, text: s[key] ? on : off });
    b.addEventListener('click', () => {
      s[key] = !s[key];
      b.setAttribute('aria-pressed', String(s[key]));
      b.textContent = s[key] ? on : off;
      commit();
    });
    rows.push(h('div', { class: 'setting' }, h('span', { text: label }), b));
  };
  slider('CRT-Intensität', 'crt', (v) => `${Math.round(v * 100)} %`);
  toggle('Bildschirmflackern', 'flicker');
  toggle('Bewegung reduzieren', 'reducedMotion');
  slider('Lautstärke', 'volume', (v) => `${Math.round(v * 100)} %`);
  toggle('Ton stumm', 'muted');
  toggle('Virtueller Joystick', 'joystick');
  {
    const speeds = [
      { v: 30, t: 'LANGSAM' },
      { v: 55, t: 'NORMAL' },
      { v: 110, t: 'SCHNELL' },
      { v: 0, t: 'SOFORT' },
    ];
    let idx = Math.max(0, speeds.findIndex((x) => x.v === s.textSpeed));
    const b = h('button', { class: 'btn toggle', type: 'button', 'aria-label': 'Textgeschwindigkeit', text: speeds[idx].t });
    b.addEventListener('click', () => {
      idx = (idx + 1) % speeds.length;
      s.textSpeed = speeds[idx].v;
      b.textContent = speeds[idx].t;
      commit();
    });
    rows.push(h('div', { class: 'setting' }, h('span', { text: 'Textgeschwindigkeit' }), b));
  }
  if (o.fullscreen.supported) {
    const b = h('button', { class: 'btn toggle', type: 'button', 'aria-pressed': String(o.fullscreen.active()), text: o.fullscreen.active() ? 'AN' : 'AUS' });
    b.addEventListener('click', () => {
      o.fullscreen.toggle();
      setTimeout(() => {
        b.textContent = o.fullscreen.active() ? 'AN' : 'AUS';
        b.setAttribute('aria-pressed', String(o.fullscreen.active()));
      }, 300);
    });
    rows.push(h('div', { class: 'setting' }, h('span', { text: 'Vollbild' }), b));
  }
  const close = button('Zurück', o.onClose, { cls: 'mint', key: 'Esc' });
  close.dataset.autofocus = '';
  const actions = h('div', { class: 'button-row' }, close);
  if (o.onDeleteSave) actions.append(button('Spielstand löschen', o.onDeleteSave));
  const panel = h('div', { class: 'panel', role: 'dialog', 'aria-label': 'Einstellungen' }, h('h2', { text: 'EINSTELLUNGEN' }), ...rows, actions);
  return { el: h('div', { class: 'overlay', id: 'settings' }, panel), closable: true, onClose: undefined };
}

export function confirmPanel(title: string, text: string, yes: string, onYes: () => void, onNo: () => void): Modal {
  const no = button('Abbrechen', onNo);
  no.dataset.autofocus = '';
  const panel = h('div', { class: 'panel', role: 'alertdialog', 'aria-label': title }, h('h2', { text: title }), h('div', { class: 'section' }, h('p', { text })), h('div', { class: 'button-row' }, button(yes, onYes, { cls: 'mint' }), no));
  return { el: h('div', { class: 'overlay' }, panel), closable: true };
}

export function aboutPanel(onClose: () => void): Modal {
  const close = button('Zurück', onClose, { cls: 'mint' });
  close.dataset.autofocus = '';
  const panel = h(
    'div',
    { class: 'panel', role: 'dialog', 'aria-label': 'Über diesen Prototyp' },
    h('h2', { text: 'ÜBER DIESEN PROTOTYP' }),
    h('div', { class: 'section' }, h('div', { class: 'title', text: 'KAPITEL 0' }), h('p', { text: 'Ein nicht-kanonischer technischer Vertical Slice für Die Kalibrierungsanlage III. Er zeigt Erkundung, Untersuchung, Inventar, ein Rätsel und die Reaktion der Anlage – ohne die eigentliche Geschichte vorwegzunehmen.' })),
    h('div', { class: 'section' }, h('div', { class: 'title', text: 'DARSTELLUNG' }), h('p', { text: 'Alles im Bild ist Code: 28 gesperrte Farben, Bayer-8×8-Dithering, gebackenes Licht. Isometrische Projektion 2:1, Tiefensortierung nach Bodenfläche, ganzzahlige Pixelskalierung.' })),
    h('div', { class: 'section' }, h('div', { class: 'title', text: 'TEAM_APERTURE' }), h('p', { text: 'Prototyp 0.1 · Ton synthetisch erzeugt · Schriften: Share Tech Mono, Space Mono, VT323 (SIL OFL).' })),
    h('div', { class: 'button-row' }, close),
  );
  return { el: h('div', { class: 'overlay' }, panel), closable: true };
}
