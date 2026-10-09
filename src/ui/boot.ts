/**
 * Boot screen: the loader dressed as the facility's BIOS, in the manner of the
 * KA-II title boot. The Team_Aperture emblem powers on like a CRT while system lines
 * appear; the bar underneath is the real texture bake progress (BootScene drives it
 * through `#loader .bar i` and `#loader .label`). The boot never adds waiting time
 * beyond a short minimum that lets the emblem finish its reveal.
 *
 * Full boot once per browser session; afterwards, and with reduced motion, a short
 * "Sitzung wird fortgesetzt" variant.
 */

import { emblemMark } from './brand';
import { h } from './dom';

type Kind = '' | 'dim' | 'warn' | 'err' | 'ok';

const SESSION_KEY = 'ka3.boot.seen';

function fullLines(signal: boolean): Array<[number, string, Kind]> {
  return [
    [0, 'KA-III BIOS v0.1 // TEAM_APERTURE', 'dim'],
    [260, 'Systemprüfung wird gestartet …', ''],
    [480, '> Kalibrierspeicher: 640 KB erkannt', ''],
    [700, '> Netz A: STABIL', 'ok'],
    [900, '> Netz B: KEINE SPANNUNG', 'err'],
    [1100, '> Sensorik Sektor 0: EINGESCHRÄNKT', 'warn'],
    [1300, signal ? '> Kanal 0: 1 SIGNAL GESPEICHERT' : '> Kanal 0: kein Signal', signal ? 'warn' : 'dim'],
    [1560, '.', 'dim'],
    [1720, '. .', 'dim'],
    [1880, '. . .', 'dim'],
    [2080, '> Wartungsprotokoll geladen.', 'ok'],
    [2320, 'WARNUNG: Letzte Kalibrierung: unbekannt.', 'warn'],
  ];
}

const SHORT: Array<[number, string, Kind]> = [[0, 'KA-III // SITZUNG WIRD FORTGESETZT', 'dim']];

export interface BootScreen {
  /**
   * Plays out the remaining lines, then calls `reveal` the moment the overlay starts to
   * fade (so whatever it shows underneath only becomes interactive once visible).
   * Resolves when the overlay is gone.
   */
  finish(reveal?: () => void): Promise<void>;
}

function sessionSeen(): boolean {
  try {
    const seen = sessionStorage.getItem(SESSION_KEY) === '1';
    sessionStorage.setItem(SESSION_KEY, '1');
    return seen;
  } catch {
    return false;
  }
}

export function showBootScreen(o: { reduced: boolean; signal: boolean }): BootScreen {
  const full = !o.reduced && !sessionSeen();
  const lines = full ? fullLines(o.signal) : SHORT;
  const t0 = performance.now();
  const minMs = full ? 1700 : 0;

  const list = h('div', { class: 'boot-lines', 'aria-live': 'polite' });
  const cursor = h('span', { class: 'boot-cursor', 'aria-hidden': 'true' });
  const mark = emblemMark(full ? 'full' : 'screen', { scale: full ? 2 : 2, boot: full ? 150 : undefined, cls: 'boot-emblem' });
  const el = h(
    'div',
    { id: 'loader', class: `loader boot ${full ? 'full' : 'short'}`, role: 'status', 'aria-label': 'System startet' },
    h(
      'div',
      { class: 'boot-splash' },
      mark,
      h('div', { class: 'boot-studio', text: 'TEAM_APERTURE' }),
      h('div', { class: 'boot-sub', text: full ? 'PRÄSENTIERT' : 'KA-III' }),
    ),
    h(
      'div',
      { class: 'boot-console' },
      list,
      h('div', { class: 'bar' }, h('i')),
      h('div', { class: 'label', text: 'INITIALISIERE' }),
    ),
  );
  document.body.append(el);

  let shown = 0;
  const timers: number[] = [];
  const addLine = () => {
    const [, text, kind] = lines[shown++];
    const line = h('div', { class: `boot-line ${kind}`, text });
    list.append(line);
    list.append(cursor);
    requestAnimationFrame(() => requestAnimationFrame(() => line.classList.add('visible')));
  };
  for (let i = 0; i < lines.length; i++) timers.push(window.setTimeout(addLine, lines[i][0]));

  return {
    finish: async (reveal) => {
      // Remaining lines flush quickly, the emblem gets its minimum stage time.
      for (const t of timers) clearTimeout(t);
      while (shown < lines.length) {
        addLine();
        await new Promise((r) => setTimeout(r, full ? 70 : 0));
      }
      if (full) {
        const last = h('div', { class: 'boot-line', text: 'Starte Benutzeroberfläche …' });
        list.append(last, cursor);
        requestAnimationFrame(() => last.classList.add('visible'));
      }
      const wait = minMs - (performance.now() - t0);
      if (wait > 0) await new Promise((r) => setTimeout(r, wait));
      el.classList.add('done');
      reveal?.();
      await new Promise((r) => setTimeout(r, o.reduced ? 0 : 470));
      el.remove();
    },
  };
}
