/** Main menu, pause menu, settings, confirmation and info panels. */

import { PALETTE_HEX } from '../art/palette';
import type { Settings } from '../state/types';
import { bannerMark, emblemMark } from './brand';
import { button, h } from './dom';
import type { Modal } from './ui';

export interface MainMenuOpts {
  hasSave: boolean;
  saveInfo?: string;
  /** Chapter 0 finished (the stored signal shows up in the system texts). */
  signal?: boolean;
  onContinue: () => void;
  onNew: () => void;
  onSettings: () => void;
  onAbout: () => void;
}

/** Idle remarks of the facility, shown one at a time on large screens. */
const IDLE_LINES = [
  'Letzte Kalibrierung: nicht dokumentiert.',
  'Netz B meldet: keine Spannung.',
  'Wartungszelle 03: Bewegung registriert. Vermutlich ein Messfehler.',
  'Kanal 0 ist still. Meistens.',
  'Testprotokoll wartet auf Eingabe.',
  'Umgebungstemperatur unter Sollwert. Seit längerem.',
  'Lüfter W-01 dreht sich. Stromaufnahme: null.',
];

/** Largest scale ≤ `max` at which every art pixel covers whole device pixels. */
function crispScale(max: number): number {
  const dpr = window.devicePixelRatio || 1;
  return Math.max(1, Math.floor(max * dpr)) / dpr;
}

function bracket(label: string, onClick: () => void, opts: { id?: string; primary?: boolean } = {}): HTMLButtonElement {
  return button(label, onClick, { cls: `ka-btn ${opts.primary ? 'primary' : ''}`, id: opts.id });
}

/**
 * Title screen in the manner of the KA-II menu, rebuilt in pixel art: system bar,
 * the KA-III banner between two warning lights with a passing scan bar, bracket
 * buttons, an idle remark and the Team_Aperture studio mark.
 */
export function mainMenu(o: MainMenuOpts): Modal {
  const status = h('span', { class: 'sys-status blink', text: 'OFFLINE' });
  const sys = h(
    'header',
    { class: 'sys-bar' },
    h('span', { class: 'sys-left' }, 'KA-III SYSTEM // STATUS: ', status),
    h('span', { class: 'sys-right' }, 'KANAL 0: ', h('span', { class: o.signal ? 'amber' : 'dim', text: o.signal ? 'SIGNAL GESPEICHERT' : 'KEIN SIGNAL' })),
  );

  const banner = bannerMark({ cls: 'hero-banner' });
  const hero = h(
    'section',
    { class: 'hero' },
    h('h1', { class: 'sr-only', text: 'Die Kalibrierungsanlage III – Die Übergabe. Kapitel 0: Nullsignal' }),
    h('div', { class: 'hero-logo-wrap' }, h('span', { class: 'hero-light l', 'aria-hidden': 'true' }), banner, h('span', { class: 'hero-light r', 'aria-hidden': 'true' }), h('span', { class: 'hero-scanbar', 'aria-hidden': 'true' })),
    h('div', { class: 'subtitle', text: 'KAPITEL 0 — NULLSIGNAL' }),
    o.saveInfo ? h('div', { class: 'meta', text: o.saveInfo }) : null,
  );

  const buttons = h('nav', { class: 'title-menu', 'aria-label': 'Hauptmenü' });
  if (o.hasSave) {
    const b = bracket('Fortsetzen', o.onContinue, { primary: true, id: 'btn-continue' });
    b.dataset.autofocus = '';
    buttons.append(b);
  }
  const nb = bracket('Neues Spiel', o.onNew, { primary: !o.hasSave, id: 'btn-new' });
  if (!o.hasSave) nb.dataset.autofocus = '';
  buttons.append(nb, bracket('Einstellungen', o.onSettings, { id: 'btn-settings' }), bracket('Über diesen Prototyp', o.onAbout, { id: 'btn-about' }));

  const idleText = h('span', { class: 'idle-text' });
  const idle = h('aside', { class: 'idle-comment', 'aria-hidden': 'true' }, h('span', { class: 'idle-who', text: 'SYSTEM' }), idleText);

  const studio = h(
    'footer',
    { class: 'studio' },
    emblemMark('simple', { cls: 'studio-emblem', label: 'Team_Aperture' }),
    h('div', { class: 'studio-text' }, h('div', { class: 'studio-name', text: 'TEAM_APERTURE' }), h('div', { class: 'studio-ver', text: 'PROTOTYP 0.1 // NICHT-KANONISCH' })),
  );

  const main = h(
    'main',
    { class: 'title-main', role: 'dialog', 'aria-label': 'Hauptmenü' },
    hero,
    buttons,
    h('div', { class: 'foot', text: 'Technischer Vertical Slice. Ton, Speicherstand und Einstellungen bleiben lokal in diesem Browser.' }),
  );
  const el = h('div', { class: 'overlay title-screen', id: 'main-menu' }, sys, main, idle, studio);

  // Banner scale: as large as fits, snapped to whole device pixels.
  const fit = () => {
    if (!el.isConnected) return;
    const cv = banner.querySelector('canvas');
    if (!cv) return;
    const portrait = window.innerHeight > window.innerWidth;
    const maxW = Math.min(window.innerWidth - 40, 1160) / cv.width;
    const maxH = (window.innerHeight * (portrait ? 0.3 : 0.44)) / cv.height;
    const s = crispScale(Math.min(maxW, maxH, 4));
    cv.style.width = `${cv.width * s}px`;
    cv.style.height = `${cv.height * s}px`;
  };
  fit();
  requestAnimationFrame(fit);
  window.addEventListener('resize', fit);

  // System status comes up, then the facility starts muttering.
  const timers: number[] = [];
  const later = (ms: number, fn: () => void) => timers.push(window.setTimeout(() => (el.isConnected ? fn() : cleanup()), ms));
  const cleanup = () => {
    for (const t of timers) clearTimeout(t);
    window.removeEventListener('resize', fit);
  };
  later(900, () => {
    status.textContent = 'STANDBY';
    status.className = 'sys-status standby blink';
  });
  const pool = o.signal ? [...IDLE_LINES, 'Kanal 0: Signal gespeichert. Quelle nicht zuordenbar.'] : IDLE_LINES;
  let order: string[] = [];
  const showIdle = () => {
    if (!order.length) order = [...pool].sort(() => Math.random() - 0.5);
    idleText.textContent = order.pop()!;
    idle.classList.add('visible');
    later(7000, () => {
      idle.classList.remove('visible');
      later(15000 + Math.random() * 10000, showIdle);
    });
  };
  later(9000, showIdle);
  const cleanupWatch = window.setInterval(() => {
    if (!el.isConnected) {
      cleanup();
      clearInterval(cleanupWatch);
    }
  }, 2000);

  return { el, closable: false };
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
    h('div', { class: 'label-row' }, emblemMark('badge', { scale: 2, cls: 'label-badge', animate: false }), h('span', { class: 'accent', text: 'PAUSE' }), h('span', { text: o.room })),
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
  const toggle = (label: string, key: 'flicker' | 'reducedMotion' | 'muted' | 'joystick' | 'lite', on = 'AN', off = 'AUS') => {
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
  toggle('Leistungsmodus', 'lite');
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
  const strip = h('div', { class: 'palette-strip', 'aria-hidden': 'true' });
  for (const c of PALETTE_HEX) strip.append(h('span', { style: `background:${c}` }));
  const panel = h(
    'div',
    { class: 'panel about', role: 'dialog', 'aria-label': 'Über diesen Prototyp' },
    h('div', { class: 'about-head' }, emblemMark('simple', { cls: 'about-emblem' }), h('div', {}, h('h2', { text: 'ÜBER DIESEN PROTOTYP' }), h('div', { class: 'about-studio', text: 'TEAM_APERTURE · PROTOTYP 0.1' }))),
    h('div', { class: 'section' }, h('div', { class: 'title', text: 'KAPITEL 0' }), h('p', { text: 'Ein nicht-kanonischer technischer Vertical Slice für Die Kalibrierungsanlage III. Er zeigt Erkundung, Untersuchung, Inventar, ein Rätsel und die Reaktion der Anlage – ohne die eigentliche Geschichte vorwegzunehmen.' })),
    h('div', { class: 'section' }, h('div', { class: 'title', text: 'DARSTELLUNG' }), h('p', { text: 'Alles im Bild ist Code: 28 gesperrte Farben, Bayer-8×8-Dithering, gebackenes Licht. Isometrische Projektion 2:1, Tiefensortierung nach Bodenfläche, ganzzahlige Pixelskalierung. Auch das Emblem und das Logo werden aus diesen 28 Farben gebaut.' }), strip),
    h('div', { class: 'section' }, h('div', { class: 'title', text: 'TEAM_APERTURE' }), h('p', { text: 'Ein kleiner roter und ein großer grüner Roboter, die sich abklatschen. Ton synthetisch erzeugt · Schriften: Share Tech Mono, Space Mono, VT323 (SIL OFL).' })),
    h('div', { class: 'button-row' }, close),
  );
  return { el: h('div', { class: 'overlay' }, panel), closable: true };
}
