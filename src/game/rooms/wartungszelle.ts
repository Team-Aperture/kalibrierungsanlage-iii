/**
 * LOCATION 1 – DIE WARTUNGSZELLE
 *
 * Gameplay definition: props, collision, interactions, German texts, overlays,
 * the opening sequence and the room's response when power is restored.
 */

import Phaser from 'phaser';
import type { Rect } from '../../core/collision';
import { toScreen } from '../../core/projection';
import { WZ, type Box3 } from '../../content/rooms/wartungszelle.layout';
import { bakedInfo } from '../../art/bake';
import { C } from '../../art/palette';
import { drawText } from '../../art/font';
import { drawScreenEmblem } from '../../art/brand/screens';
import { DOOR_LAMP, LIGHTING, PANEL_SPARK, TALLY_COUNT, TERMINAL_SCREEN } from '../../art/rooms/wartungszelle';
import { bakeWartungszelle, WZK, wzArt } from '../../art/rooms/wartungszelleBake';
import { evaluate, ENERGIEPFAD } from '../puzzles/energiepfad';
import type { GameState } from '../../state/gameState';
import type { ScriptCtx } from '../script';
import type { PropDef, RoomDef, Verb } from './types';

const box = (b: Box3) => ({ x0: b[0], y0: b[1], z0: b[2], x1: b[3], y1: b[4], z1: b[5] });
const rect = (b: Box3): Rect => ({ x0: b[0], y0: b[1], x1: b[3], y1: b[4] });

/** Animation overrides used by cutscenes (null = derive from world state). */
const anim: { door: string | null; lamp: 'red' | 'amber' | 'green' | null; fan: number; power: boolean | null } = {
  door: null,
  lamp: null,
  fan: 0,
  power: null,
};

const powered = (s: GameState) => anim.power ?? s.puzzle.solved;

function doorVariant(s: GameState): string {
  if (anim.door) return anim.door;
  const d = s.door('schleuse01');
  return WZK.door(d === 'OPEN' ? 'l8' : d === 'UNLOCKED' ? 'b0' : 'b3');
}

function doorLamp(s: GameState): 'red' | 'amber' | 'green' {
  if (anim.lamp) return anim.lamp;
  const d = s.door('schleuse01');
  return d === 'LOCKED' ? 'red' : d === 'POWERED' ? 'amber' : 'green';
}

// ---------------------------------------------------------------------------
// Texts
// ---------------------------------------------------------------------------

function terminalLines(s: GameState): string[] {
  const head = ['~KA-WART 4.1 · WARTUNGSZELLE 03', '~AUTOMATISCHER NEUSTART ........ OK', '~----------------------------------------'];
  if (s.puzzle.solved) {
    return [
      ...head,
      '!SYSTEMSTATUS ........... TEILWEISE BEKANNT',
      ' NETZ A (NOTSTROM) ...... BEREIT',
      ' NETZ B (HAUPTSTROM) .... AKTIV · 100 %',
      ' VERTEILER V-2 .......... IN ORDNUNG',
      ' SCHLEUSE 0-1 ........... OFFEN',
      ' MESSWERK M-3 ........... MESSUNG LÄUFT',
      ' BEWEGUNGSMELDER ........ 1 KONTAKT',
      '!EINGEHENDE DATEN ....... KANAL 0 · OHNE KENNUNG',
      '~>> WEITERLEITUNG AN T-07 (BEOBACHTUNGSGANG)',
      '~----------------------------------------',
    ];
  }
  const fuse = s.flag('fuse.inserted');
  return [
    ...head,
    'xSYSTEMSTATUS ........... UNBEKANNT',
    ' LETZTE WARTUNG ......... ##.##.####',
    ' NETZ A (NOTSTROM) ...... AKTIV · 12 %',
    'xNETZ B (HAUPTSTROM) .... UNTERBROCHEN',
    '!VERTEILER V-2 .......... STÖRUNG',
    fuse ? '   > SICHERUNG F3 ....... EINGESETZT' : '!   > SICHERUNG F3 ....... FEHLT',
    '!   > LEITUNGSPFAD ....... OFFEN',
    ' SCHLEUSE 0-1 ........... VERRIEGELT (KEINE ENERGIE)',
    ' MESSWERK M-3 ........... RUHEZUSTAND',
    ' BEWEGUNGSMELDER ........ 1 KONTAKT',
    '~----------------------------------------',
    fuse ? ' EMPFEHLUNG: LEITUNGSMATRIX IN V-2 SCHLIESSEN.' : ' EMPFEHLUNG: VERTEILER V-2 INSTANDSETZEN.',
    fuse ? '~(VERBRANNTES SEGMENT NICHT BESTROMEN.)' : ' ERSATZTEILE: REGAL R-2, KASTEN „F“.',
  ];
}

const LOGBOOK = [
  '~WARTUNGSBUCH · ZELLE 03',
  '~Die meisten Einträge sind verwischt. Lesbar sind:',
  '',
  '~[unleserlich]',
  'V-2 wieder ausgefallen. Sicherung F3 ersetzt. Ersatz liegt im Kasten F im Regal.',
  '',
  '~[unleserlich]',
  'Matrix in V-2 neu gelegt. NIE durch das verbrannte Feld unten in der Mitte führen – sonst Kurzschluss, und wir fangen von vorn an.',
  '',
  '~[unleserlich]',
  'Messwerk läuft wieder. Niemand kann sagen, was es misst. Anweisung: laufen lassen.',
  '',
  '~[unleserlich]',
  'Der Lüfter dreht sich auch ohne Strom. Gemeldet. Keine Antwort.',
  '',
  '~[unleserlich]',
  'Habe aufgehört zu zählen.',
];

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

const look = (fn: (ctx: ScriptCtx) => Promise<void>): Verb => ({ id: 'look', label: 'Untersuchen', run: fn });

const props: PropDef[] = [
  {
    id: 'terminal',
    box: box(WZ.terminal),
    texture: () => WZK.terminal,
    interact: {
      name: 'Terminal T-01',
      points: [{ x: 41, y: 28 }],
      hotspot: { x: 41, y: 8, z: 44 },
      verbs: () => [
        {
          id: 'use',
          label: 'Lesen',
          primary: true,
          run: async (ctx) => {
            ctx.sfx('beep');
            await ctx.app.openReader('T-01 · KA-WART 4.1', terminalLines(ctx.state));
            const first = !ctx.state.flag('terminal.read');
            ctx.setFlag('terminal.read');
            if (first && !ctx.state.flag('fuse.taken')) await ctx.say('Netz B unterbrochen. Verteiler V-2 … Sicherung F3 fehlt. Regal R-2.');
            else if (first && ctx.state.puzzle.solved) await ctx.say('„Eingehende Daten. Ohne Kennung.“ Der Eintrag springt weiter – zu T-07.');
          },
        },
        look(async (ctx) =>
          ctx.say(
            ctx.state.puzzle.solved
              ? 'Das Terminal summt zufrieden. Eine neue Zeile blinkt am Ende der Liste.'
              : 'Ein Wartungsterminal mit gewölbter Bildröhre. Auf dem Gehäuse: KA-WART. Das Glas ist warm, als wäre es nie ausgeschaltet gewesen.',
          ),
        ),
      ],
    },
  },
  {
    id: 'panel',
    box: box(WZ.panel),
    texture: (s) => (s.flag('fuse.inserted') ? WZK.panelFuse : WZK.panelEmpty),
    interact: {
      name: 'Verteiler V-2',
      points: [{ x: 88, y: 18 }],
      hotspot: { x: 88, y: 5, z: 56 },
      verbs: (ctx) => {
        const s = ctx.state;
        const lookV = look(async (c) => {
          if (s.puzzle.solved) await c.say('Der Verteiler summt gleichmäßig. Alle neun Segmente leuchten grün.');
          else if (s.flag('fuse.inserted')) await c.say('Die Sicherung sitzt. Im Schrank brummt es, aber der Strom findet keinen Weg durch die Leitungsmatrix.');
          else await c.say('Ein Verteilerschrank, Kennung V-2. Von drei Sicherungen fehlt eine – Steckplatz F3 ist leer. Aus dem Sockel springen Funken.', 'Darunter, hinter einer Klappe: eine Matrix aus drehbaren Leitungssegmenten.');
        });
        if (s.puzzle.solved) return [{ ...lookV, primary: true }];
        if (!s.flag('fuse.inserted')) {
          return [
            {
              id: 'use',
              label: s.has('sicherung') ? 'Sicherung einsetzen' : 'Benutzen',
              primary: true,
              run: async (c) => {
                if (c.state.has('sicherung')) await insertFuse(c);
                else {
                  c.setFlag('panel.needsFuse');
                  await c.say('Ohne Sicherung in F3 bekommt der Verteiler keinen Strom. Die Matrix bleibt tot.');
                }
              },
            },
            lookV,
          ];
        }
        return [{ id: 'use', label: 'Matrix öffnen', primary: true, run: (c) => openMatrix(c) }, lookV];
      },
      accepts: (s, item) => item === 'sicherung' && !s.flag('fuse.inserted'),
      onItem: async (ctx, item) => {
        if (item !== 'sicherung') return false;
        if (ctx.state.flag('fuse.inserted')) return false;
        await insertFuse(ctx);
        return true;
      },
    },
  },
  {
    id: 'door',
    box: box(WZ.doorBox),
    texture: (s) => doorVariant(s),
    interact: {
      name: 'Schleuse 0-1',
      points: [{ x: 142, y: 20 }],
      hotspot: { x: 142, y: 4, z: 62 },
      reach: 12,
      verbs: (ctx) => {
        const open = ctx.state.door('schleuse01') === 'OPEN';
        const lookD = look(async (c) =>
          c.say(
            open
              ? 'Das Schott steht offen. Dahinter ein schmaler Gang, kühler Luftzug.'
              : 'Ein schweres Schott. Vier Riegel sitzen fest im Rahmen. Über der Tür glüht eine rote Lampe: keine Energie.',
          ),
        );
        if (open) return [{ id: 'use', label: 'Hindurchgehen', primary: true, run: async (c) => void (await c.walkTo(142, 4)) }, lookD];
        return [
          {
            id: 'use',
            label: 'Öffnen',
            primary: true,
            run: async (c) => {
              c.sfx('clank', { volume: 0.6 });
              await c.say('Die Tür rührt sich nicht. Ohne Strom bleiben die Riegel geschlossen.');
            },
          },
          lookD,
        ];
      },
    },
  },
  {
    id: 'shelf',
    box: box(WZ.shelf),
    texture: (s) => (s.flag('fuse.taken') ? WZK.shelfTaken : WZK.shelfFull),
    tall: true,
    interact: {
      name: 'Regal R-2',
      points: [{ x: 24, y: 44 }],
      hotspot: { x: 8, y: 42, z: 46 },
      verbs: (ctx) => {
        const taken = ctx.state.flag('fuse.taken');
        const lookS = look(async (c) =>
          c.say(
            taken
              ? 'Kartons, Ordner, Gläser voller Schrauben. Der Blechkasten mit dem „F“ ist jetzt leer.'
              : 'Ein Metallregal: Kartons, Ordner, Gläser voller Schrauben. Auf dem zweiten Fach steht ein Blechkasten, auf den jemand ein „F“ gemalt hat.',
          ),
        );
        if (taken) return [{ ...lookS, primary: true }];
        return [
          {
            id: 'take',
            label: 'Kasten öffnen',
            primary: true,
            run: async (c) => {
              c.sfx('switch');
              c.setFlag('fuse.taken');
              c.give('sicherung');
              await c.say('Im Kasten liegt ein einzelner Sicherungseinsatz. Auf dem Keramikkörper: F3.');
            },
          },
          lookS,
        ];
      },
    },
  },
  {
    id: 'machine',
    box: box(WZ.machine),
    texture: () => WZK.machine,
    tall: true,
    interact: {
      name: 'Messwerk M-3',
      points: [
        { x: 96, y: 110 },
        { x: 126, y: 80 },
        { x: 96, y: 50 },
        { x: 66, y: 80 },
      ],
      hotspot: { x: 96, y: 80, z: 68 },
      reach: 12,
      verbs: () => [
        look(async (c) =>
          c.say(
            powered(c.state)
              ? 'Das Messwerk läuft. Hinter dem Sichtschlitz kreist ein bernsteinfarbenes Licht, gleichmäßig wie ein Puls.'
              : 'Eine Maschine, größer als du. Durch einen Sichtschlitz im Zylinder: ein ruhendes Räderwerk. Typenschild: MESSWERK M-3 · TOLERANZ ±0,001.',
          ),
        ),
        {
          id: 'use',
          label: 'Bedienen',
          primary: true,
          run: async (c) => {
            c.sfx('switch');
            await c.say(
              powered(c.state)
                ? 'Die Zeiger der Anzeigen zittern um einen Wert, der sich nicht ablesen lässt. Was hier gemessen wird, verstehst du nicht – nur, dass gemessen wird.'
                : 'Die Schalter klicken ins Leere. Das Messwerk hat keine Energie.',
            );
          },
        },
      ],
    },
  },
  {
    id: 'transformer',
    box: box(WZ.transformer),
    texture: () => WZK.transformer,
    tall: true,
    interact: {
      name: 'Transformator TR-1',
      points: [
        { x: 172, y: 126 },
        { x: 150, y: 126 },
      ],
      hotspot: { x: 172, y: 101, z: 64 },
      reach: 12,
      verbs: () => [
        {
          ...look(async (c) =>
            c.say(
              powered(c.state)
                ? 'Der Transformator brummt jetzt tief und gleichmäßig. Die Luft um ihn herum ist warm.'
                : 'Ein Transformator: Kühlrippen, drei Keramikdurchführungen, ein Warnschild – 10 KV. Es riecht nach altem Öl.',
            ),
          ),
          primary: true,
        },
        { id: 'use', label: 'Anfassen', run: async (c) => c.say('Besser nicht.') },
      ],
    },
  },
  {
    id: 'bench',
    box: box(WZ.bench),
    texture: () => WZK.bench,
    interact: {
      name: 'Werkbank',
      points: [{ x: 30, y: 140 }],
      hotspot: { x: 10, y: 140, z: 26 },
      verbs: () => [
        {
          id: 'use',
          label: 'Wartungsbuch lesen',
          primary: true,
          run: async (c) => {
            c.sfx('switch', { volume: 0.4 });
            await c.app.openReader('WARTUNGSBUCH · ZELLE 03', LOGBOOK, true);
            c.setFlag('logbook.read');
          },
        },
        look(async (c) => c.say('Eine Werkbank. Ein aufgeschlagenes Wartungsbuch, eine Tasse mit eingetrocknetem Rest, ein roter Werkzeugkasten. Leer.')),
      ],
    },
  },
  {
    id: 'tally',
    box: box(WZ.tally),
    texture: null,
    embedded: true,
    interact: {
      name: 'Kratzspuren',
      points: [{ x: 30, y: 140 }],
      hotspot: { x: 1, y: 141, z: 48 },
      verbs: () => [
        {
          ...look(async (c) =>
            c.say(`Kratzer im Blech, sauber in Gruppen zu fünf. ${TALLY_COUNT} Striche. Die letzte Gruppe ist nicht fertig.`, 'Jemand hat hier gezählt. Tage? Schichten? Etwas anderes?'),
          ),
          primary: true,
        },
      ],
    },
  },
  {
    id: 'fan',
    box: box(WZ.fan),
    texture: () => WZK.fan(anim.fan),
    interact: {
      name: 'Wandlüfter',
      points: [{ x: 16, y: 105 }],
      hotspot: { x: 3, y: 105, z: 50 },
      verbs: () => [
        {
          ...look(async (c) =>
            c.say(
              powered(c.state)
                ? 'Der Lüfter dreht jetzt schneller. Das Geräusch hat einen Rhythmus, fast wie Atem.'
                : 'Ein Wandlüfter. Er dreht sich langsam – obwohl Netz B tot ist. Aus dem Gitter kommt ein kühler Luftzug. Von wo?',
            ),
          ),
          primary: true,
        },
      ],
    },
  },
  {
    id: 'lampA',
    box: { x0: WZ.lampA.x - 6, y0: WZ.lampA.y - 6, z0: WZ.lampA.z - 3, x1: WZ.lampA.x + 6, y1: WZ.lampA.y + 6, z1: 150 },
    texture: () => WZK.lamp('A', true),
    interact: {
      name: 'Hängelampe',
      points: [{ x: WZ.lampA.x, y: WZ.lampA.y + 8 }],
      pick: { x0: WZ.lampA.x - 5, y0: WZ.lampA.y - 5, z0: WZ.lampA.z - 3, x1: WZ.lampA.x + 5, y1: WZ.lampA.y + 5, z1: WZ.lampA.z + 6 },
      hotspot: { x: WZ.lampA.x, y: WZ.lampA.y, z: WZ.lampA.z + 10 },
      reach: 14,
      verbs: () => [
        {
          ...look(async (c) =>
            c.say(
              powered(c.state)
                ? 'Jetzt brennen alle Lampen ruhig. Auch diese.'
                : 'Eine Hängelampe am Notstromkreis. Sie flackert in einem unregelmäßigen Takt. Wenn man lange genug hinsieht, glaubt man ein Muster zu erkennen.',
            ),
          ),
          primary: true,
        },
      ],
    },
  },
  { id: 'lampB', box: box(WZ.lampB), texture: (s) => WZK.lamp('B', powered(s)) },
  { id: 'lampC', box: box(WZ.lampC), texture: (s) => WZK.lamp('C', powered(s)) },
  {
    id: 'crates',
    box: box(WZ.crates),
    texture: () => WZK.crates,
    interact: {
      name: 'Transportkisten',
      points: [{ x: 178, y: 40 }],
      hotspot: { x: 178, y: 19, z: 32 },
      verbs: () => [
        { ...look(async (c) => c.say('Transportkisten. Auf der unteren steht ERSATZ. Die Bretter sind fest vernagelt.')), primary: true },
        { id: 'use', label: 'Aufbrechen', run: async (c) => c.say('Ohne Werkzeug keine Chance. Und so dringend ist es nicht.') },
      ],
    },
  },
  {
    id: 'grate',
    box: { x0: WZ.grate[0], y0: WZ.grate[1], z0: 0, x1: WZ.grate[2], y1: WZ.grate[3], z1: 0.5 },
    texture: null,
    embedded: true,
    interact: {
      name: 'Abflussgitter',
      points: [{ x: 48, y: 126 }],
      hotspot: { x: 48, y: 140, z: 4 },
      verbs: () => [{ ...look(async (c) => c.say('Ein Abflussgitter. Tief unten tropft etwas, in gleichmäßigen Abständen.')), primary: true }],
    },
  },
  // Volumetric light cones (decor, depth-sorted like thin columns).
  { id: 'coneA', box: { x0: WZ.lampA.x - 1, y0: WZ.lampA.y - 1, z0: 0, x1: WZ.lampA.x + 1, y1: WZ.lampA.y + 1, z1: WZ.lampA.z }, texture: null },
];

// ---------------------------------------------------------------------------
// Scripts
// ---------------------------------------------------------------------------

async function insertFuse(ctx: ScriptCtx): Promise<void> {
  ctx.take('sicherung');
  ctx.sfx('clank');
  ctx.setFlag('fuse.inserted');
  await ctx.wait(250);
  ctx.sfx('relay');
  await ctx.say('Die Sicherung rastet in F3 ein. Die Funken verstummen.', 'Hinter der Klappe darunter: neun drehbare Leitungssegmente. Nur das linke führt Strom.');
  await openMatrix(ctx);
}

async function openMatrix(ctx: ScriptCtx): Promise<void> {
  const solved = await ctx.app.openPuzzle();
  if (solved) await powerUp(ctx);
  else if (!ctx.state.flag('matrix.seen')) {
    ctx.setFlag('matrix.seen');
    await ctx.say('Der Strom kommt noch nicht durch. Die Matrix bleibt offen – du kannst jederzeit weitermachen.');
  }
}

/** The room responds: power surges, lights strobe on, the machine starts and the door opens. */
async function powerUp(ctx: ScriptCtx): Promise<void> {
  const scene = ctx.scene;
  const rm = ctx.settings.reducedMotion;
  await ctx.cutscene(async () => {
    anim.power = false;
    anim.door = WZK.door('b3');
    anim.lamp = 'red';
    scene.overrideLight = 'dark';
    ctx.state.puzzle.solved = true;
    ctx.persist();
    ctx.refresh();
    ctx.sfx('relay');
    await ctx.wait(500);
    // Power surge: tubes strike, stutter, then hold.
    ctx.sfx('powerUp');
    const pattern = rm ? [0, 1] : [1, 0, 1, 0, 0, 1, 0, 1];
    for (const on of pattern) {
      scene.overrideLight = on ? 'lit' : 'dark';
      anim.power = !!on;
      ctx.refresh();
      if (on) ctx.sfx('tink', { volume: 0.7 });
      await ctx.wait(60 + Math.random() * 140);
    }
    anim.power = true;
    scene.overrideLight = 'lit';
    ctx.refresh();
    ctx.app.ambience('humLit');
    await ctx.wait(800);
    // Door: LOCKED → POWERED → UNLOCKED → OPEN, each step persisted.
    await ctx.panTo({ x: 142, y: 20, z: 24 }, 1100);
    ctx.state.setDoor('schleuse01', 'POWERED');
    anim.lamp = 'amber';
    ctx.persist();
    ctx.refresh();
    ctx.sfx('beep');
    await ctx.wait(650);
    for (const v of ['b2', 'b1', 'b0']) {
      anim.door = WZK.door(v);
      ctx.refresh();
      ctx.sfx('clank', { volume: 0.8 });
      await ctx.wait(230);
    }
    ctx.state.setDoor('schleuse01', 'UNLOCKED');
    anim.lamp = 'green';
    ctx.persist();
    ctx.refresh();
    await ctx.wait(500);
    ctx.sfx('door');
    for (let k = 1; k <= 8; k++) {
      anim.door = WZK.door(`l${k}`);
      ctx.refresh();
      await ctx.wait(rm ? 60 : 300);
    }
    ctx.state.setDoor('schleuse01', 'OPEN');
    anim.door = null;
    anim.lamp = null;
    anim.power = null;
    ctx.persist();
    ctx.refresh();
    await ctx.wait(400);
    await ctx.followPlayer(900);
    scene.overrideLight = null;
  });
  await ctx.say('Das Messwerk läuft. Das Schott 0-1 steht offen.');
}

async function intro(ctx: ScriptCtx): Promise<void> {
  const scene = ctx.scene;
  const veil = scene.veil;
  const rm = ctx.settings.reducedMotion;
  await ctx.cutscene(async () => {
    veil.alpha = 1;
    veil.clearHoles();
    screen.mode = 'off';
    const cam = scene.cameras.main;
    cam.stopFollow();
    const t = toScreen(41, 14, 30);
    cam.centerOn(t.sx, t.sy);
    await ctx.wait(rm ? 300 : 1100);
    // A faint mechanical sound.
    ctx.app.ambience('hum');
    ctx.sfx('relay', { volume: 0.6 });
    await ctx.wait(rm ? 300 : 1000);
    // An indicator light activates.
    const ind = veil.hole({ ...DOOR_LAMP }, 9, 0);
    ctx.sfx('beep', { volume: 0.5 });
    for (const v of [0.6, 0, 1]) {
      ind.on = v;
      await ctx.wait(90);
    }
    await ctx.wait(rm ? 300 : 900);
    // The old terminal flickers to life.
    const th = veil.hole({ x: 41, y: 22, z: 26 }, 40, 0);
    ctx.sfx('terminal');
    for (const [v, ms] of [
      [1, 70],
      [0, 120],
      [0.7, 60],
      [0, 200],
      [1, 0],
    ] as const) {
      th.on = v;
      screen.mode = v > 0 ? 'boot' : 'off';
      if (ms) await ctx.wait(ms);
    }
    // Manufacturer splash: the Team_Aperture emblem powers on, then the boot text.
    screen.mode = 'logo';
    screen.t = -1;
    await ctx.wait(rm ? 400 : 1500);
    screen.mode = 'boot';
    await ctx.wait(rm ? 300 : 600);
    screen.mode = 'unknown';
    ctx.app.ui.setStatus('SYSTEMSTATUS: UNBEKANNT');
    await ctx.app.ui.bigMessage('SYSTEMSTATUS: UNBEKANNT', rm ? 1400 : 2300);
    // The camera reveals the room and the figure in it.
    const reveal = veil.fadeTo(0, rm ? 400 : 2800);
    if (!rm) th.radius = 60;
    await Promise.all([reveal, ctx.followPlayer(rm ? 0 : 2800)]);
    veil.clearHoles();
    screen.mode = 'idle';
    ctx.setFlag('intro.done');
  });
  ctx.app.ui.showIntroHint();
}

// ---------------------------------------------------------------------------
// Terminal screen content (in-world)
// ---------------------------------------------------------------------------

const screen: { mode: 'off' | 'logo' | 'boot' | 'unknown' | 'idle' | 'ok'; t: number } = { mode: 'idle', t: 0 };

/** After power returns, T-01 alternates between its status and the emblem (ms). */
const OK_CYCLE = 9000;
const OK_LOGO_AT = 5600;

function screenRaster(mode: typeof screen.mode, t: number): Uint8Array {
  const w = TERMINAL_SCREEN.w;
  const hh = TERMINAL_SCREEN.h;
  const r = new Uint8Array(w * hh).fill(255);
  if (mode === 'off') return r;
  for (let y = 0; y < hh; y++) for (let x = 0; x < w; x++) r[y * w + x] = y % 2 === 0 ? C.G0 : C.G1;
  const frame = Math.floor(t / 220);
  if (mode === 'logo') {
    drawScreenEmblem(r, w, hh, { ms: t, boot: screen.t < 0 ? 0 : (t - screen.t) / 700 });
    return r;
  }
  if (mode === 'ok' && t % OK_CYCLE >= OK_LOGO_AT) {
    drawScreenEmblem(r, w, hh, { ms: t, boot: ((t % OK_CYCLE) - OK_LOGO_AT) / 550 });
    return r;
  }
  if (mode === 'boot') {
    for (let row = 0; row < 7; row++) {
      const y = 1 + row * 2;
      const len = 3 + ((row * 7 + frame * 3) % 14);
      for (let x = 1; x < Math.min(w - 1, 1 + len); x++) if ((x + row) % 5 !== 0) r[y * w + x] = row === 0 ? C.CYAN : C.G2;
    }
    return r;
  }
  if (mode === 'unknown') {
    drawText(r, w, hh, 'SYS', 2, 2, C.MINT);
    if (frame % 2 === 0) drawText(r, w, hh, '???', 2, 9, C.CYAN);
    else drawText(r, w, hh, '???', 2, 9, C.MINT);
    return r;
  }
  if (mode === 'ok') {
    drawText(r, w, hh, 'NETZ', 1, 1, C.MINT);
    drawText(r, w, hh, 'OK', 1, 8, C.CYAN);
    if (frame % 2 === 0) for (let x = 10; x < 13; x++) r[12 * w + x] = C.MINT;
    return r;
  }
  // idle: status bars with a warning and a blinking cursor.
  drawText(r, w, hh, 'V-2', 1, 1, C.MINT);
  if (frame % 4 < 2) drawText(r, w, hh, '!', 15, 1, C.AMBER);
  for (let row = 0; row < 3; row++) {
    const y = 8 + row * 2;
    const len = [12, 8, 15][row] - ((frame + row) % 3);
    for (let x = 1; x < len; x++) if ((x + row * 2) % 4 !== 0) r[y * w + x] = C.G2;
  }
  if (frame % 2 === 0) for (let x = 1; x < 4; x++) r[14 * w + x] = C.MINT;
  return r;
}

// ---------------------------------------------------------------------------
// Lighting rules
// ---------------------------------------------------------------------------

/** Irregular emergency-lamp flicker (deterministic). */
function flickerOn(time: number): boolean {
  const cycle = 6100;
  const t = time % (cycle * 3);
  const c = Math.floor(t / cycle);
  const p = t % cycle;
  const offs: Array<[number, number]> =
    c === 0
      ? [
          [3900, 3990],
          [4060, 4210],
        ]
      : c === 1
        ? [[2500, 2570]]
        : [
            [1200, 1260],
            [1330, 1420],
            [1480, 1700],
            [5200, 5260],
          ];
  return !offs.some(([a, b]) => p >= a && p < b);
}

// ---------------------------------------------------------------------------
// Room definition
// ---------------------------------------------------------------------------

export const wartungszelle: RoomDef = {
  id: 'wartungszelle',
  title: 'Wartungszelle 03',
  bounds: { x0: 0, y0: 0, x1: WZ.W, y1: WZ.D },
  bg: WZK.bg,
  lighting: LIGHTING,
  props,
  solids: () => [
    rect(WZ.terminal),
    rect(WZ.panel),
    { x0: 120, y0: 0, x1: 127, y1: 7 },
    { x0: 157, y0: 0, x1: 164, y1: 7 },
    rect(WZ.shelf),
    rect(WZ.fan),
    rect(WZ.machine),
    rect(WZ.transformer),
    rect(WZ.bench),
    rect(WZ.crates),
    ...WZ.columnsLeft.map(rect),
    ...WZ.columnsRight.map(rect),
  ],
  lightingKey: (s, time, settings) => {
    if (powered(s)) return 'lit';
    if (!settings.flicker || settings.reducedMotion) return 'dark';
    return flickerOn(time) ? 'dark' : 'darkOff';
  },
  arrivals: {
    start: { x: WZ.spawn.x, y: WZ.spawn.y, facing: 'NE' },
    fromSchleuse: { x: 142, y: 24, facing: 'SW' },
  },
  camera: () => wzArt().bounds,
  status: (s) =>
    !s.flag('intro.done')
      ? 'SYSTEMSTATUS: UNBEKANNT'
      : `SEKTOR 0 · WARTUNGSZELLE 03 · NETZ B: ${s.puzzle.solved ? 'AKTIV' : 'UNTERBROCHEN'}`,
  zones: [
    {
      id: 'exit',
      rect: { x0: 128, y0: 0, x1: 156, y1: 9 },
      active: (s) => s.door('schleuse01') === 'OPEN',
      enter: async (ctx) => {
        ctx.sfx('step');
        await ctx.changeRoom('schleuse', 'fromZelle');
      },
    },
  ],
  bake: async (scene, progress) => {
    await bakeWartungszelle(scene, progress);
  },
  onEnter: async (ctx, arrival) => {
    const s = ctx.state;
    ctx.app.ambience(powered(s) ? 'humLit' : 'hum');
    if (!s.flag('intro.done') && arrival !== 'fromSchleuse') await intro(ctx);
    else ctx.app.ui.setStatus(wartungszelle.status(s));
  },
  setup: (ctx) => setupOverlays(ctx),
};

// ---------------------------------------------------------------------------
// Overlays: screen, rotor, lamps, cones, sparks, dust, fan
// ---------------------------------------------------------------------------

function setupOverlays(ctx: ScriptCtx) {
  const scene = ctx.scene;
  const s = ctx.state;
  const art = wzArt();
  anim.door = null;
  anim.lamp = null;
  anim.power = null;
  screen.mode = s.flag('intro.done') || scene.attract ? (powered(s) ? 'ok' : 'idle') : 'off';

  // Terminal screen (CanvasTexture redrawn a few times per second).
  const termInfo = bakedInfo(`${WZK.terminal}@dark`);
  const screenKey = `${WZK.screen}.${Phaser.Math.RND.uuid()}`;
  const screenTex = scene.textures.createCanvas(screenKey, termInfo.w, termInfo.h)!;
  scene.attach('terminal', scene.addOverlay(screenKey, termInfo.ox, termInfo.oy), 1);
  let lastScreen = '';
  const drawScreen = (time: number) => {
    const mode = screen.mode === 'idle' && powered(s) ? 'ok' : screen.mode;
    if (mode === 'logo' && screen.t < 0) screen.t = time;
    const fine = mode === 'logo' || (mode === 'ok' && time % OK_CYCLE >= OK_LOGO_AT - 50);
    const key = `${mode}:${Math.floor(time / (fine ? 45 : 220))}`;
    if (key === lastScreen) return;
    lastScreen = key;
    art.screen.renderInto(screenTex.getContext(), screenRaster(mode, time));
    screenTex.refresh();
  };

  // Panel indicator grid (puzzle mirror).
  const panelInfo = bakedInfo(`${WZK.panelEmpty}@dark`);
  const gridKey = `${WZK.panelGrid}.${Phaser.Math.RND.uuid()}`;
  const gridTex = scene.textures.createCanvas(gridKey, panelInfo.w, panelInfo.h)!;
  scene.attach('panel', scene.addOverlay(gridKey, panelInfo.ox, panelInfo.oy), 1);
  const drawGrid = () => {
    const ctx2 = gridTex.getContext();
    ctx2.clearRect(0, 0, panelInfo.w, panelInfo.h);
    if (s.flag('fuse.inserted') || powered(s)) {
      const res = evaluate(ENERGIEPFAD, s.puzzle.rot);
      const colors = res.powered.map((p, i) => (powered(s) ? (i % 2 ? C.CYAN : C.MINT) : res.shortAt === i ? C.RED : p ? C.MINT : C.G1));
      ctx2.drawImage(art.renderPanelGrid(colors), 0, 0);
    }
    gridTex.refresh();
  };

  // Door indicator lamp.
  const doorInfo = bakedInfo(`${WZK.door('b3')}@dark`);
  const doorLampImg = scene.attach('door', scene.addOverlay(WZK.doorLamp('red'), doorInfo.ox, doorInfo.oy), 1);
  let lampBlink = 0;

  // Machine rotor + lamps.
  const machInfo = bakedInfo(`${WZK.machine}@dark`);
  const rotor = scene.attach('machine', scene.addOverlay(WZK.rotor(0), machInfo.ox, machInfo.oy), 1);
  const machLamps = scene.attach('machine', scene.addOverlay(WZK.machineLamps, machInfo.ox, machInfo.oy), 2);

  // Light cone + dust.
  const coneInfo = bakedInfo(WZK.cone('A'));
  const coneA = scene.attach('coneA', scene.addOverlay(coneInfo.key, coneInfo.ox, coneInfo.oy).setBlendMode(Phaser.BlendModes.ADD), 1);
  const dust = scene.add.particles(0, 0, 'px.peach', {
    x: { min: -22, max: 22 },
    y: { min: -60, max: 0 },
    lifespan: 5200,
    speedY: { min: 1, max: 4 },
    speedX: { min: -2, max: 2 },
    alpha: { onEmit: () => 0, onUpdate: (_p: unknown, _k: string, t: number) => Math.sin(t * Math.PI) * 0.7 },
    frequency: 650,
    blendMode: Phaser.BlendModes.ADD,
  });
  const lampScreen = toScreen(WZ.lampA.x, WZ.lampA.y, 30);
  dust.setPosition(Math.round(lampScreen.sx), Math.round(lampScreen.sy));
  scene.attach('coneA', dust, 2);
  if (ctx.settings.reducedMotion || ctx.settings.lite) dust.stop();

  // Sparks from the empty fuse socket.
  const sp = toScreen(PANEL_SPARK.x, PANEL_SPARK.y, PANEL_SPARK.z);
  const sparks = scene.add.particles(Math.round(sp.sx), Math.round(sp.sy), 'px.white', {
    lifespan: { min: 180, max: 420 },
    speed: { min: 18, max: 55 },
    angle: { min: 20, max: 160 },
    gravityY: 160,
    quantity: 1,
    emitting: false,
    blendMode: Phaser.BlendModes.ADD,
    tint: [0xffffff, 0xffd5c2, 0x3cf2e2, 0xe9b44c],
  });
  scene.attach('panel', sparks, 3);
  let sparkTimer = 1200;

  let fanTimer = 0;
  let lastLight = '';
  let rotorFrame = 0;
  let rotorTimer = 0;

  const refresh = () => {
    drawGrid();
    const p = powered(s);
    rotor.setVisible(p);
    machLamps.setVisible(p);
    doorLampImg.setTexture(WZK.doorLamp(doorLamp(s)));
  };
  refresh();

  return {
    refresh,
    update: (dt: number, time: number) => {
      drawScreen(time);
      // Lamp A follows the flicker; the cone fades with it.
      if (scene.lightId !== lastLight) {
        lastLight = scene.lightId;
        const on = lastLight !== 'darkOff';
        scene.setPropBase('lampA', WZK.lamp('A', on));
        coneA.setVisible(on);
        if (lastLight === 'darkOff') ctx.sfx('tink', { volume: 0.15 });
      }
      // Fan turns even without power.
      fanTimer += dt;
      const fanStep = powered(s) ? 0.07 : 0.16;
      if (fanTimer > fanStep) {
        fanTimer = 0;
        anim.fan = (anim.fan + 1) % 4;
        scene.setPropBase('fan', WZK.fan(anim.fan));
      }
      if (powered(s)) {
        rotorTimer += dt;
        if (rotorTimer > 0.09) {
          rotorTimer = 0;
          rotorFrame = (rotorFrame + 1) % 8;
          rotor.setTexture(WZK.rotor(rotorFrame));
        }
      }
      // Red lamp breathes while locked.
      lampBlink += dt;
      if (doorLamp(s) === 'red') doorLampImg.setAlpha(ctx.settings.reducedMotion ? 1 : 0.55 + 0.45 * Math.abs(Math.sin(lampBlink * 1.6)));
      else doorLampImg.setAlpha(1);
      // Sparks while the socket is empty.
      if (!s.flag('fuse.inserted') && !scene.attract) {
        sparkTimer -= dt * 1000;
        if (sparkTimer <= 0) {
          sparkTimer = 900 + Math.random() * 2600;
          sparks.explode(ctx.settings.reducedMotion ? 2 : 4 + Math.floor(Math.random() * 6));
          const d = Math.hypot(scene.player.x - PANEL_SPARK.x, scene.player.y - PANEL_SPARK.y);
          if (scene.veil.alpha < 0.5) ctx.sfx('spark', { volume: Math.max(0.15, 1 - d / 160) });
        }
      }
    },
    destroy: () => {
      scene.textures.remove(screenKey);
      scene.textures.remove(gridKey);
    },
  };
}
