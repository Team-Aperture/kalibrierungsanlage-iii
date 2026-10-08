/**
 * LOCATION 2 – HINTER DER SCHLEUSE
 *
 * The observation walkway above the machine hall. The walkway is blocked by a
 * lattice gate whose motor is dead; a hand crank in a locker opens it. At the far
 * end, terminal T-07 reacts to an unidentified signal – the chapter's final event.
 */

import Phaser from 'phaser';
import type { Rect } from '../../core/collision';
import { toScreen } from '../../core/projection';
import { SL } from '../../content/rooms/schleuse.layout';
import type { Box3 } from '../../content/rooms/wartungszelle.layout';
import { bakedInfo } from '../../art/bake';
import { drawText } from '../../art/font';
import { C } from '../../art/palette';
import { LIGHTING, PENDANTS, PISTON_FRAMES, SENSOR_EYE, T07_SCREEN, WALKWAY_BOX } from '../../art/rooms/schleuse';
import { bakeSchleuse, GATE_FRAMES, SLK, slArt } from '../../art/rooms/schleuseBake';
import type { GameState } from '../../state/gameState';
import type { ScriptCtx } from '../script';
import type { PropDef, RoomDef, Verb } from './types';

const box = (b: Box3) => ({ x0: b[0], y0: b[1], z0: b[2], x1: b[3], y1: b[4], z1: b[5] });
const rect = (b: Box3): Rect => ({ x0: b[0], y0: b[1], x1: b[3], y1: b[4] });
const look = (fn: (ctx: ScriptCtx) => Promise<void>): Verb => ({ id: 'look', label: 'Untersuchen', run: fn });

/** Cutscene overrides. */
const anim = {
  gate: null as number | null,
  pistons: true,
  fan: 0,
  pistonFrame: 0,
  lightsOff: new Set<string>(),
  pattern: false,
};

const gateOpen = (s: GameState) => s.door('schott02') === 'OPEN';
const signalDone = (s: GameState) => s.flag('signal.done');

function gateFrame(s: GameState): number {
  if (anim.gate !== null) return anim.gate;
  return gateOpen(s) ? GATE_FRAMES : 0;
}

function lockerState(s: GameState): 'closed' | 'crank' | 'empty' {
  if (!s.flag('locker.open')) return 'closed';
  return s.flag('crank.taken') ? 'empty' : 'crank';
}

// ---------------------------------------------------------------------------
// Texts
// ---------------------------------------------------------------------------

const PROTOKOLL = [
  '~SCHICHTPROTOKOLL · BEOBACHTUNGSGANG B-0',
  '~Ein Klemmbrett. Die oberen Blätter fehlen.',
  '',
  '~06:00',
  'Kolben 1–3 im Takt. Abweichung: 0.',
  '~12:00',
  'Kolben 1–3 im Takt. Abweichung: 0.',
  '~18:00',
  'Kolben 1–3 im Takt. Abweichung: 0.',
  'T-07 meldet wieder Daten auf Kanal 0. Ohne Kennung. Nicht weitergeleitet.',
  '~00:00',
  'Sperrgitter klemmt erneut. Motor ausgefallen. Handkurbel liegt in Spind 3.',
  '',
  '~[Darunter eine weitere Zeile, sorgfältig durchgestrichen.]',
];

function t07Lines(s: GameState): string[] {
  if (!signalDone(s)) return ['~T-07 · KANALÜBERWACHUNG', '~----------------------------------', ' KANAL 0 ........... LAUSCHT', '_'];
  return [
    '~T-07 · KANALÜBERWACHUNG',
    '~----------------------------------',
    '!EINGANG ............ KANAL 0',
    ' QUELLE ............. NICHT ZUORDENBAR',
    ' KENNUNG ............ —',
    ' DAUER .............. 00:00:06',
    ' INHALT ............. #.##. .#..# ##.#. ..###',
    ' STATUS ............. GESPEICHERT',
    '~----------------------------------',
    '~WEITERLEITUNG: GESPERRT',
  ];
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

const walkwayPts = (x: number) => [{ x, y: 30 }];

const props: PropDef[] = [
  { id: 'walkway', box: box(WALKWAY_BOX), texture: () => SLK.walkway },
  { id: 'railing', box: box(SL.railing), texture: () => SLK.railing },
  { id: 'endRailing', box: { x0: SL.L - 2, y0: 0, z0: 0, x1: SL.L, y1: SL.Wd, z1: 13 }, texture: () => SLK.endRailing },
  {
    id: 'overlook',
    box: { x0: 16, y0: 36, z0: 0, x1: 84, y1: 42, z1: 14 },
    texture: null,
    embedded: true,
    interact: {
      name: 'Geländer',
      points: walkwayPts(50),
      hotspot: { x: 50, y: 39, z: 16 },
      verbs: () => [
        {
          ...look(async (c) =>
            c.say(
              signalDone(c.state)
                ? 'Die Halle ist still. Die Kolben stehen. Nur der große Lüfter dreht sich weiter.'
                : 'Unter dir ein Maschinensaal, so tief, dass das Licht unten im Dunst verschwindet. Kolben heben und senken sich im Gleichtakt. Niemand bedient sie.',
            ),
          ),
          primary: true,
        },
      ],
    },
  },
  ...SL.pistons.map(
    (px, i): PropDef => ({
      id: `piston${i}`,
      box: { x0: px - 13, y0: SL.pistonY - 13, z0: -SL.PD, x1: px + 13, y1: SL.pistonY + 13, z1: -20 },
      texture: () => SLK.piston(i, anim.pistonFrame),
      interact: {
        name: `Kolben ${i + 1}`,
        points: walkwayPts(px - 20),
        hotspot: { x: px, y: SL.pistonY, z: -14 },
        reach: 14,
        verbs: () => [
          {
            ...look(async (c) =>
              c.say(
                signalDone(c.state) || !anim.pistons
                  ? 'Der Kolben steht still, halb ausgefahren. Hydrauliköl tropft von der Stange.'
                  : 'Hydraulikkolben, jeder so dick wie ein Baumstamm. Ihr Takt ist exakt: oben, unten, oben. Wie ein Metronom für etwas Größeres.',
              ),
            ),
            primary: true,
          },
        ],
      },
    }),
  ),
  {
    id: 'fanBig',
    box: { x0: SL.fan.cx - SL.fan.r, y0: 0, z0: SL.fan.cz - SL.fan.r, x1: SL.fan.cx + SL.fan.r, y1: 1.5, z1: SL.fan.cz + SL.fan.r },
    texture: () => SLK.fan(anim.fan),
    interact: {
      name: 'Großer Lüfter',
      points: walkwayPts(SL.fan.cx),
      hotspot: { x: SL.fan.cx, y: 2, z: SL.fan.cz + SL.fan.r + 2 },
      reach: 14,
      verbs: () => [
        {
          ...look(async (c) => c.say('Ein Lüfter, groß genug, um einen Menschen hindurchzuziehen. Er saugt die warme Luft aus der Halle. Wohin, steht nirgends.')),
          primary: true,
        },
      ],
    },
  },
  {
    id: 'tanks',
    box: { x0: SL.tanks.x0, y0: SL.tanks.y - 46, z0: -SL.PD, x1: SL.tanks.x1, y1: SL.tanks.y + 14, z1: SL.tanks.z + SL.tanks.r },
    texture: null,
    embedded: true,
    interact: {
      name: 'Druckbehälter',
      points: walkwayPts(36),
      hotspot: { x: 60, y: SL.tanks.y - 16, z: SL.tanks.z + SL.tanks.r + 4 },
      reach: 16,
      verbs: () => [{ ...look(async (c) => c.say('Zwei Druckbehälter auf Stahlsätteln. Auf dem Warnschild: DRUCK. Die Manometer sind zu weit weg, um sie abzulesen.')), primary: true }],
    },
  },
  {
    id: 'entrance',
    box: { x0: -2, y0: SL.entrance.y0, z0: 0, x1: 1, y1: SL.entrance.y1, z1: SL.entrance.h },
    texture: null,
    embedded: true,
    interact: {
      name: 'Schleuse 0-1',
      points: [{ x: 12, y: 21 }],
      hotspot: { x: 0, y: 21, z: SL.entrance.h + 4 },
      reach: 12,
      verbs: () => [
        { id: 'use', label: 'Zurückgehen', primary: true, run: async (c) => void (await c.walkTo(2, 21)) },
        look(async (c) => c.say('Der Weg zurück in die Wartungszelle.')),
      ],
    },
  },
  {
    id: 'locker',
    box: box(SL.locker),
    texture: (s) => SLK.locker(lockerState(s)),
    interact: {
      name: 'Spind 3',
      points: [{ x: 66, y: 22 }],
      hotspot: { x: 66, y: 6, z: 50 },
      verbs: (ctx) => {
        const st = lockerState(ctx.state);
        const lookL = look(async (c) =>
          c.say(
            st === 'closed'
              ? 'Ein Stahlspind. Auf dem Etikett: SPIND 3. Die Tür klemmt ein wenig.'
              : st === 'crank'
                ? 'Im Spind: ein Schutzhelm und eine Handkurbel mit rotem Griff.'
                : 'Nur noch ein Schutzhelm. Kein Name darauf.',
          ),
        );
        if (st === 'closed') {
          return [
            {
              id: 'use',
              label: 'Öffnen',
              primary: true,
              run: async (c) => {
                c.sfx('clank', { volume: 0.7 });
                c.setFlag('locker.open');
                await c.wait(250);
                await c.say('Die Tür gibt quietschend nach. Darin: ein Schutzhelm und eine Handkurbel mit rotem Griff.');
              },
            },
            lookL,
          ];
        }
        if (st === 'crank') {
          return [
            {
              id: 'take',
              label: 'Kurbel nehmen',
              primary: true,
              run: async (c) => {
                c.setFlag('crank.taken');
                c.give('kurbel');
                await c.say('Die Kurbel ist schwer. Der Vierkant am Ende ist blank gescheuert.');
              },
            },
            lookL,
          ];
        }
        return [{ ...lookL, primary: true }];
      },
    },
  },
  {
    id: 'clipboard',
    box: box(SL.clipboard),
    texture: null,
    embedded: true,
    interact: {
      name: 'Schichtprotokoll',
      points: [{ x: 91, y: 18 }],
      hotspot: { x: 91, y: 1, z: 40 },
      verbs: () => [
        {
          id: 'use',
          label: 'Lesen',
          primary: true,
          run: async (c) => {
            await c.app.openReader('SCHICHTPROTOKOLL · B-0', PROTOKOLL, true);
            c.setFlag('protokoll.read');
          },
        },
      ],
    },
  },
  {
    id: 'sensor',
    box: box(SL.sensor),
    texture: () => SLK.sensor,
    interact: {
      name: 'Sensor',
      points: [{ x: 108, y: 20 }],
      hotspot: { x: 108, y: 3, z: 68 },
      reach: 14,
      verbs: () => [
        { ...look(async (c) => c.say('Ein Sensor an der Wand. Die rote Linse folgt dir, wenn du dich bewegst. Oder bildest du dir das ein?')), primary: true },
        { id: 'use', label: 'Berühren', run: async (c) => c.say('Zu hoch. Du kommst nicht heran.') },
      ],
    },
  },
  {
    id: 'gateBox',
    box: box(SL.gateBox),
    texture: (s) => SLK.gateBox(s.flag('crank.used')),
    interact: {
      name: 'Kurbelaufnahme',
      points: [{ x: 134, y: 18 }],
      hotspot: { x: 134, y: 4, z: 38 },
      verbs: (ctx) => {
        const used = ctx.state.flag('crank.used');
        const lookB = look(async (c) =>
          c.say(used ? 'Die Kurbel steckt noch in der Aufnahme.' : 'Ein Kasten mit einer vierkantigen Aufnahme und einem kleinen Manometer. Darüber: HANDBETRIEB.'),
        );
        if (used) return [{ ...lookB, primary: true }];
        return [
          {
            id: 'use',
            label: ctx.state.has('kurbel') ? 'Kurbel ansetzen' : 'Benutzen',
            primary: true,
            run: async (c) => {
              if (c.state.has('kurbel')) await crankGate(c);
              else await c.say('Die Aufnahme ist leer. Hier gehört eine Handkurbel hinein.');
            },
          },
          lookB,
        ];
      },
      accepts: (s, item) => item === 'kurbel' && !s.flag('crank.used'),
      onItem: async (ctx, item) => {
        if (item !== 'kurbel' || ctx.state.flag('crank.used')) return false;
        await crankGate(ctx);
        return true;
      },
    },
  },
  {
    id: 'gate',
    box: box(SL.gate),
    texture: (s) => SLK.gate(gateFrame(s)),
    tall: true,
    interact: {
      name: 'Sperrgitter B-0',
      points: [{ x: 168, y: 24 }],
      hotspot: { x: 180, y: 20, z: 52 },
      reach: 12,
      verbs: (ctx) => {
        const open = gateOpen(ctx.state);
        const lookG = look(async (c) =>
          c.say(open ? 'Das Gitter steckt oben im Rahmen. Der Weg ist frei.' : 'Ein Sperrgitter quer über den Gang. Der Motor ist tot. Am Kasten daneben steht: HANDBETRIEB.'),
        );
        if (open) return [{ ...lookG, primary: true }];
        if (ctx.state.has('kurbel')) {
          return [
            {
              id: 'use',
              label: 'Kurbel ansetzen',
              primary: true,
              run: async (c) => {
                const ok = await c.walkTo(134, 18);
                if (ok) await crankGate(c);
              },
            },
            lookG,
          ];
        }
        return [
          {
            id: 'use',
            label: 'Anheben',
            primary: true,
            run: async (c) => {
              c.sfx('clank', { volume: 0.5 });
              await c.say('Das Gitter rührt sich keinen Millimeter.');
            },
          },
          lookG,
        ];
      },
      accepts: (s, item) => item === 'kurbel' && !s.flag('crank.used'),
      onItem: async (ctx, item) => {
        if (item !== 'kurbel' || ctx.state.flag('crank.used')) return false;
        if (await ctx.walkTo(134, 18)) await crankGate(ctx);
        return true;
      },
    },
  },
  { id: 'crates', box: box(SL.crates), texture: () => SLK.crates, interact: {
    name: 'Kisten',
    points: [{ x: 213, y: 24 }],
    hotspot: { x: 213, y: 7, z: 22 },
    verbs: () => [{ ...look(async (c) => c.say('Zwei Kisten mit dem Aufdruck KA. Verplombt. Die Plomben sind neu.')), primary: true }],
  } },
  {
    id: 't07',
    box: box(SL.terminal),
    texture: () => SLK.terminal,
    interact: {
      name: 'Terminal T-07',
      points: [{ x: 268, y: 30 }],
      hotspot: { x: 268, y: 6, z: 44 },
      verbs: (ctx) => [
        {
          id: 'use',
          label: 'Lesen',
          primary: true,
          run: async (c) => {
            c.sfx('beep');
            await c.app.openReader('T-07 · KANALÜBERWACHUNG', t07Lines(c.state));
          },
        },
        look(async (c) =>
          c.say(
            signalDone(ctx.state)
              ? 'T-07 zeigt nur noch eine Zeile: SIGNAL GESPEICHERT.'
              : 'Ein zweites Terminal, Kennung T-07. Ein breiter, dunkler Schirm. Das Gehäuse ist warm.',
          ),
        ),
      ],
    },
  },
  {
    id: 'door2',
    box: box(SL.door2Box),
    texture: () => SLK.door2,
    interact: {
      name: 'Schleuse 0-2',
      points: [{ x: 305, y: 18 }],
      hotspot: { x: 305, y: 2, z: 56 },
      verbs: () => [
        { ...look(async (c) => c.say('Schleuse 0-2. Fest verschlossen. Auf dem Display ein einziges Wort: WARTEN.')), primary: true },
        { id: 'use', label: 'Öffnen', run: async (c) => c.say('Kein Griff, keine Kurbelaufnahme. Diese Tür öffnet sich nicht von dieser Seite.') },
      ],
    },
  },
  ...SL.columns.map((c, i): PropDef => ({ id: `column${i}`, box: box(c), texture: () => SLK.column(i), tall: true })),
  { id: 'gantry', box: box(SL.gantry), texture: () => SLK.gantry },
  ...PENDANTS.map(
    (p, i): PropDef => ({
      id: `pendant${i}`,
      box: { x0: p.x - 9, y0: p.y - 9, z0: p.z - 3, x1: p.x + 9, y1: p.y + 9, z1: 130 },
      texture: (s) => SLK.pendant(i, lightOn(s, `pendant${i}`)),
    }),
  ),
  ...PENDANTS.map((p, i): PropDef => ({ id: `cone${i}`, box: { x0: p.x - 1, y0: p.y - 1, z0: -SL.PD, x1: p.x + 1, y1: p.y + 1, z1: p.z - 3 }, texture: null })),
  ...SL.lamps.map(
    (x, i): PropDef => ({
      id: `tube${i}`,
      box: { x0: x - 10, y0: 0, z0: 66, x1: x + 10, y1: 4, z1: 74 },
      texture: (s) => SLK.tube(i, lightOn(s, `tube${i}`)),
    }),
  ),
];

function lightOn(s: GameState, id: string): boolean {
  if (anim.lightsOff.has(id)) return false;
  return !s.flag('signal.active');
}

// ---------------------------------------------------------------------------
// Scripts
// ---------------------------------------------------------------------------

async function crankGate(ctx: ScriptCtx): Promise<void> {
  await ctx.cutscene(async () => {
    ctx.take('kurbel');
    ctx.setFlag('crank.used');
    ctx.sfx('clank');
    await ctx.say('Die Kurbel passt in den Vierkant. Du drehst – schwer, dann leichter.');
    ctx.state.setDoor('schott02', 'UNLOCKED');
    for (let k = 1; k <= GATE_FRAMES; k++) {
      anim.gate = k;
      ctx.refresh();
      ctx.sfx('ratchet', { volume: 0.8 });
      await ctx.wait(ctx.settings.reducedMotion ? 80 : 260);
    }
    ctx.sfx('clank');
    ctx.state.setDoor('schott02', 'OPEN');
    anim.gate = null;
    ctx.persist();
    ctx.refresh();
  });
  await ctx.say('Das Sperrgitter rastet oben ein. Der Gang ist frei.');
}

const t07 = { mode: 'off' as 'off' | 'wake' | 'signal' | 'saved', t: 0 };

/** The unidentified signal: T-07 wakes, the hall falls silent, the chapter ends. */
async function signalEvent(ctx: ScriptCtx): Promise<void> {
  const scene = ctx.scene;
  const rm = ctx.settings.reducedMotion;
  await ctx.cutscene(async () => {
    ctx.setFlag('signal.started');
    await ctx.panTo({ x: 268, y: 14, z: 30 }, 1300);
    t07.mode = 'wake';
    ctx.sfx('terminal');
    await ctx.wait(rm ? 300 : 900);
    t07.mode = 'signal';
    ctx.sfx('beep');
    await ctx.wait(500);
    // The hall falls silent: pistons stop, lights go out from far to near.
    anim.pistons = false;
    ctx.app.ambience('hallQuiet');
    const order = ['pendant1', 'tube2', 'tube1', 'pendant0', 'tube0'];
    for (const id of order) {
      anim.lightsOff.add(id);
      ctx.refresh();
      ctx.sfx('tink', { volume: 0.6 });
      await ctx.wait(rm ? 120 : 420);
    }
    scene.overrideLight = 'dark';
    ctx.setFlag('signal.active');
    ctx.refresh();
    await ctx.wait(600);
    anim.pattern = true;
    ctx.sfx('signal');
    await ctx.wait(rm ? 600 : 1800);
    await ctx.say(
      { style: 'terminal', speaker: 'T-07', text: 'EINGEHENDES SIGNAL' },
      { style: 'terminal', speaker: 'T-07', text: 'KANAL 0 · QUELLE: NICHT ZUORDENBAR' },
      { style: 'terminal', speaker: 'T-07', text: 'KENNUNG: —' },
      { style: 'terminal', speaker: 'T-07', text: 'INHALT: #.##. .#..# ##.#. ..###' },
      { style: 'terminal', speaker: 'T-07', text: 'SIGNAL GESPEICHERT.' },
    );
    anim.pattern = false;
    t07.mode = 'saved';
    ctx.setFlag('signal.done');
    ctx.persist();
    await ctx.wait(900);
    await ctx.say('Die Kolben stehen. Irgendwo in der Halle tickt Metall beim Abkühlen.', 'Dann ist es still.');
    await scene.veil.fadeTo(1, rm ? 600 : 2600);
  });
  await ctx.app.chapterComplete();
}

// ---------------------------------------------------------------------------
// Room
// ---------------------------------------------------------------------------

export const schleuse: RoomDef = {
  id: 'schleuse',
  title: 'Hinter der Schleuse',
  bounds: { x0: 0, y0: 0, x1: SL.L - 2, y1: SL.railing[1] - 0.5 },
  bg: SLK.bg,
  lighting: LIGHTING,
  props,
  solids: (s) => [
    rect(SL.locker),
    rect(SL.gateBox),
    ...(gateOpen(s) && anim.gate === null
      ? [
          { x0: SL.gate[0], y0: 0, x1: SL.gate[3], y1: 3 },
          { x0: SL.gate[0], y0: SL.gate[4] - 3, x1: SL.gate[3], y1: SL.gate[4] },
        ]
      : [rect(SL.gate)]),
    rect(SL.terminal),
    { x0: SL.door2.x0, y0: 0, x1: SL.door2.x1, y1: 5 },
    rect(SL.crates),
  ],
  lightingKey: (s) => (s.flag('signal.active') && !signalDone(s) ? 'dark' : 'hall'),
  arrivals: {
    start: { x: SL.spawn.x, y: SL.spawn.y, facing: 'SE' },
    fromZelle: { x: SL.spawn.x, y: SL.spawn.y, facing: 'SE' },
  },
  camera: () => slArt().bounds,
  status: (s) => `SEKTOR 0 · BEOBACHTUNGSGANG B-0 · KANAL 0: ${signalDone(s) ? 'SIGNAL GESPEICHERT' : '—'}`,
  zones: [
    {
      id: 'back',
      rect: { x0: 0, y0: SL.entrance.y0, x1: 5, y1: SL.entrance.y1 },
      active: () => true,
      enter: async (ctx) => ctx.changeRoom('wartungszelle', 'fromSchleuse'),
    },
    {
      id: 'signal',
      rect: { x0: 236, y0: 0, x1: SL.L, y1: SL.Wd },
      active: (s) => gateOpen(s) && !signalDone(s),
      enter: (ctx) => signalEvent(ctx),
      triggerOnSpawn: true,
    },
  ],
  bake: async (scene, progress) => {
    await bakeSchleuse(scene, progress);
  },
  onEnter: async (ctx) => {
    const s = ctx.state;
    ctx.app.ambience(signalDone(s) ? 'hallQuiet' : 'hall');
    ctx.app.ui.setStatus(schleuse.status(s));
    if (!s.flag('schleuse.seen')) {
      ctx.setFlag('schleuse.seen');
      await ctx.wait(600);
      await ctx.say('Kühlere Luft. Unter dem Gitterboden öffnet sich eine Halle – tief, laut, in Bewegung.');
    }
    if (signalDone(s) && !s.data.chapterComplete) await ctx.app.chapterComplete();
  },
  setup: (ctx) => setup(ctx),
};

function t07Raster(mode: typeof t07.mode, t: number): Uint8Array {
  const w = T07_SCREEN.w;
  const h = T07_SCREEN.h;
  const r = new Uint8Array(w * h).fill(255);
  if (mode === 'off') return r;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) r[y * w + x] = y % 2 === 0 ? C.G0 : C.G1;
  if (mode === 'wake') {
    for (let k = 0; k < 40; k++) {
      const x = Math.floor(Math.random() * w);
      const y = Math.floor(Math.random() * h);
      r[y * w + x] = Math.random() > 0.5 ? C.G2 : C.MINT;
    }
    return r;
  }
  if (mode === 'saved') {
    drawText(r, w, h, 'OK', 2, 2, C.MINT);
    for (let x = 2; x < w - 2; x++) r[10 * w + x] = C.G2;
    return r;
  }
  // Signal: a travelling waveform with bursts.
  const phase = t / 160;
  let prev = -1;
  for (let x = 0; x < w; x++) {
    const burst = Math.sin(x * 0.7 - phase * 1.7) > 0.2 ? 1 : 0.35;
    const y = Math.round(h / 2 + Math.sin(x * 0.9 + phase) * (h / 2 - 2) * burst * 0.8);
    r[y * w + x] = C.CYAN;
    if (prev >= 0) for (let yy = Math.min(prev, y); yy <= Math.max(prev, y); yy++) r[yy * w + x] = yy === y ? C.CYAN : C.MINT;
    prev = y;
  }
  return r;
}

function setup(ctx: ScriptCtx) {
  const scene = ctx.scene;
  const s = ctx.state;
  const art = slArt();
  anim.gate = null;
  anim.pistons = !signalDone(s);
  anim.lightsOff.clear();
  anim.pattern = false;
  t07.mode = signalDone(s) ? 'saved' : 'off';
  if (s.flag('signal.active') && !signalDone(s)) s.setFlag('signal.active', false);

  // T-07 screen.
  const ti = bakedInfo(`${SLK.terminal}@hall`);
  const screenKey = `${SLK.screen}.${Phaser.Math.RND.uuid()}`;
  const screenTex = scene.textures.createCanvas(screenKey, ti.w, ti.h)!;
  scene.attach('t07', scene.addOverlay(screenKey, ti.ox, ti.oy), 1);
  let lastKey = '';

  // Door 0-2 lamp, piston beacons, cones, the sensor's eye.
  const d2 = bakedInfo(`${SLK.door2}@hall`);
  const doorLamp = scene.attach('door2', scene.addOverlay(SLK.doorLamp, d2.ox, d2.oy), 1);
  const beacons = SL.pistons.map((_x, i) => {
    const pi = bakedInfo(`${SLK.piston(i, 0)}@hall`);
    return scene.attach(`piston${i}`, scene.addOverlay(SLK.beacon(i, true), pi.ox, pi.oy), 1);
  });
  const cones = PENDANTS.map((_p, i) => {
    const ci = bakedInfo(SLK.cone(i));
    return scene.attach(`cone${i}`, scene.addOverlay(ci.key, ci.ox, ci.oy).setBlendMode(Phaser.BlendModes.ADD), 1);
  });
  const eyeBase = toScreen(SENSOR_EYE.x, SENSOR_EYE.y, SENSOR_EYE.z);
  const eye = scene.attach('sensor', scene.add.image(0, 0, 'px.red').setOrigin(0, 0).setDisplaySize(2, 1), 1);

  // Steam from the pit floor.
  const steam = SL.pistons.slice(0, 2).map((px) => {
    const p = toScreen(px + 18, SL.pistonY + 22, -SL.PD + 2);
    const em = scene.add.particles(Math.round(p.sx), Math.round(p.sy), 'px.s9', {
      lifespan: 2600,
      speedY: { min: -14, max: -7 },
      speedX: { min: -3, max: 3 },
      scale: { start: 1, end: 3 },
      alpha: { start: 0.5, end: 0 },
      frequency: 140,
      blendMode: Phaser.BlendModes.ADD,
    });
    if (ctx.settings.reducedMotion || ctx.settings.lite) em.frequency = 600;
    return em;
  });
  SL.pistons.slice(0, 2).forEach((_x, i) => scene.attach(`piston${i}`, steam[i], 2));

  let fanTimer = 0;
  let pistonTimer = 0;
  let beaconTimer = 0;

  const refresh = () => {
    for (let i = 0; i < cones.length; i++) cones[i].setVisible(lightOn(s, `pendant${i}`));
  };
  refresh();

  return {
    refresh,
    update: (dt: number, time: number) => {
      // T-07 screen.
      const key = `${t07.mode}:${t07.mode === 'signal' ? Math.floor(time / 60) : t07.mode === 'wake' ? Math.floor(time / 50) : 0}`;
      if (key !== lastKey) {
        lastKey = key;
        art.screen.renderInto(screenTex.getContext(), t07Raster(t07.mode, time));
        screenTex.refresh();
      }
      // Fan keeps turning, even when everything else stops.
      fanTimer += dt;
      if (fanTimer > (anim.pistons ? 0.08 : 0.14)) {
        fanTimer = 0;
        anim.fan = (anim.fan + 1) % 4;
        scene.setPropBase('fanBig', SLK.fan(anim.fan));
      }
      // Pistons.
      if (anim.pistons) {
        pistonTimer += dt;
        if (pistonTimer > 0.13) {
          pistonTimer = 0;
          anim.pistonFrame = (anim.pistonFrame + 1) % PISTON_FRAMES;
          SL.pistons.forEach((_x, i) => scene.setPropBase(`piston${i}`, SLK.piston(i, anim.pistonFrame)));
          if (anim.pistonFrame === 0) ctx.sfx('clank', { volume: 0.12 });
        }
      }
      for (const em of steam) em.emitting = anim.pistons;
      // Beacons rotate (blink) while the hall runs; during the signal they pulse in its rhythm.
      beaconTimer += dt;
      const pulse = anim.pattern ? [0, 0.5, 1.5, 2, 2.25, 3.5].some((d) => Math.abs(((time / 1000) % 4) - d) < 0.12) : false;
      beacons.forEach((b, i) => {
        const on = anim.pattern ? pulse : anim.pistons && Math.floor(beaconTimer * 2.2 + i * 0.7) % 2 === 0;
        b.setTexture(SLK.beacon(i, on));
      });
      doorLamp.setAlpha(anim.pattern ? (pulse ? 1 : 0.2) : 0.6 + 0.4 * Math.abs(Math.sin(time / 700)));
      // The sensor's eye follows the player.
      const dx = Math.max(-1, Math.min(1, Math.round((scene.player.x - SENSOR_EYE.x) / 40)));
      eye.setPosition(Math.round(eyeBase.sx) + dx - 1, Math.round(eyeBase.sy));
      eye.setAlpha(anim.pattern ? (pulse ? 1 : 0.3) : 1);
    },
    destroy: () => {
      scene.textures.remove(screenKey);
    },
  };
}
