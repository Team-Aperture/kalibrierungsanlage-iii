/**
 * Bakes every texture of Location 1 for all of its lighting states and prepares the
 * overlay generators (terminal screen, machine rotor, lamps, cones).
 */

import type Phaser from 'phaser';
import { WZ } from '../../content/rooms/wartungszelle.layout';
import { addCanvasTexture, bakeSurface, nextFrame } from '../bake';
import { M } from '../materials';
import { C } from '../palette';
import { FaceMapper, lightCone, maskOverlay } from '../overlay';
import type { Surface } from '../surface';
import * as A from './wartungszelle';

export const WZ_LIGHTS = ['dark', 'darkOff', 'lit'] as const;
export type WzLight = (typeof WZ_LIGHTS)[number];

export const WZK = {
  bg: 'wz.bg',
  terminal: 'wz.terminal',
  panelEmpty: 'wz.panel.empty',
  panelFuse: 'wz.panel.fuse',
  door: (variant: string) => `wz.door.${variant}`,
  shelfFull: 'wz.shelf.full',
  shelfTaken: 'wz.shelf.taken',
  machine: 'wz.machine',
  transformer: 'wz.transformer',
  bench: 'wz.bench',
  crates: 'wz.crates',
  fan: (f: number) => `wz.fan.${f}`,
  lamp: (id: 'A' | 'B' | 'C', on: boolean) => `wz.lamp${id}.${on ? 'on' : 'off'}`,
  cone: (id: 'A' | 'B' | 'C') => `wz.cone${id}`,
  rotor: (f: number) => `wz.rotor.${f}`,
  machineLamps: 'wz.machine.lamps',
  doorLamp: (c: 'red' | 'amber' | 'green') => `wz.door.lamp.${c}`,
  panelGrid: 'wz.panel.grid',
  screen: 'wz.screen',
} as const;

/** Door animation variants: four bolt positions, eight lift steps. */
export const DOOR_VARIANTS = ['b3', 'b2', 'b1', 'b0', 'l1', 'l2', 'l3', 'l4', 'l5', 'l6', 'l7', 'l8'] as const;

export function lit(base: string, light: string): string {
  return `${base}@${light}`;
}

export interface WzArt {
  screen: FaceMapper;
  panelSurface: Surface;
  doorSurface: Surface;
  /** Renders the panel's 3×3 indicator lamps for a set of lamp colours (palette index or 255). */
  renderPanelGrid(colors: number[]): HTMLCanvasElement;
  bounds: { x: number; y: number; w: number; h: number };
}

let cached: WzArt | null = null;

export async function bakeWartungszelle(scene: Phaser.Scene, progress: (p: number) => void): Promise<WzArt> {
  const lamps = { A: WZ.lampA, B: WZ.lampB, C: WZ.lampC } as const;
  const jobs: Array<{ key: string; build: () => Surface; lights?: readonly string[] }> = [
    { key: WZK.bg, build: () => A.buildBackground() },
    { key: WZK.terminal, build: () => A.buildTerminal() },
    { key: WZK.panelEmpty, build: () => A.buildPanel(false) },
    { key: WZK.panelFuse, build: () => A.buildPanel(true) },
    { key: WZK.shelfFull, build: () => A.buildShelf(false) },
    { key: WZK.shelfTaken, build: () => A.buildShelf(true) },
    { key: WZK.machine, build: () => A.buildMachine() },
    { key: WZK.transformer, build: () => A.buildTransformer() },
    { key: WZK.bench, build: () => A.buildBench() },
    { key: WZK.crates, build: () => A.buildCrates() },
  ];
  for (let f = 0; f < 4; f++) jobs.push({ key: WZK.fan(f), build: () => A.buildFan(f) });
  const doorParams: Record<string, [number, number]> = {
    b3: [0, 1],
    b2: [0, 0.66],
    b1: [0, 0.33],
    b0: [0, 0],
  };
  for (let k = 1; k <= 8; k++) doorParams[`l${k}`] = [k / 8, 0];
  for (const v of DOOR_VARIANTS) jobs.push({ key: WZK.door(v), build: () => A.buildDoor(doorParams[v][0], doorParams[v][1]) });
  for (const id of ['A', 'B', 'C'] as const) {
    for (const on of [false, true]) {
      const p = lamps[id];
      jobs.push({ key: WZK.lamp(id, on), build: () => A.buildHangingLamp(p.x, p.y, p.z, on) });
    }
  }

  const surfaces = new Map<string, Surface>();
  const total = jobs.length;
  let done = 0;
  for (const job of jobs) {
    const surf = job.build();
    surfaces.set(job.key, surf);
    for (const light of job.lights ?? WZ_LIGHTS) bakeSurface(scene, lit(job.key, light), surf, A.LIGHTING[light]);
    done++;
    progress(done / total);
    await nextFrame();
  }

  // --- Overlays -----------------------------------------------------------
  const terminal = surfaces.get(WZK.terminal)!;
  const S = A.TERMINAL_SCREEN;
  const screen = new FaceMapper(terminal, S.O, S.U, S.V, S.w, S.h, (m) => m === M.GLASS);

  // Machine rotor glow seen through the drum slot (8 frames).
  const machine = surfaces.get(WZK.machine)!;
  const slot = A.MACHINE_SLOT;
  for (let f = 0; f < 8; f++) {
    const cv = maskOverlay(
      machine,
      (m, x, y, z) => m === M.GLASS && z > slot.z0 - 0.5 && z < slot.z1 + 0.5 && Math.hypot(x - slot.cx, y - slot.cy) > 13,
      (px, py, x, y, z) => {
        const a = Math.atan2(y - slot.cy, x - slot.cx);
        const wave = Math.sin(a * 5 - (f / 8) * Math.PI * 2 * 1.25 + (z - slot.z0) * 0.2);
        if (wave > 0.75) return C.PEACH;
        if (wave > 0.2) return C.AMBER;
        return ((px + py) & 1) === 0 ? C.BR3 : C.BR2;
      },
    );
    addCanvasTexture(scene, WZK.rotor(f), cv, machine.ox, machine.oy);
  }
  // Glass core in the crown + control lamps when powered.
  addCanvasTexture(
    scene,
    WZK.machineLamps,
    maskOverlay(
      machine,
      (m, _x, y, z) => m === M.GLASS && (z >= 51 || (y > 101.5 && z > 8 && z < 30)),
      (px, py, _x, y, z) => {
        if (z >= 51) return (py & 1) === 0 ? C.CYAN : C.MINT;
        return y > 101.5 ? (px % 3 === 0 ? C.AMBER : C.MINT) : 255;
      },
    ),
    machine.ox,
    machine.oy,
  );

  // Door indicator lamp colours.
  const doorSurface = surfaces.get(WZK.door('b3'))!;
  const lampPick = (m: number, _x: number, _y: number, z: number) => m === M.GLASS && z > WZ.door.lintel;
  const lampColors = { red: [C.RED, C.SALMON], amber: [C.AMBER, C.PEACH], green: [C.MINT, C.CYAN] } as const;
  for (const c of ['red', 'amber', 'green'] as const) {
    addCanvasTexture(
      scene,
      WZK.doorLamp(c),
      maskOverlay(doorSurface, lampPick, (px) => (px % 2 === 0 ? lampColors[c][0] : lampColors[c][1])),
      doorSurface.ox,
      doorSurface.oy,
    );
  }

  // Light cones under the hanging lamps.
  for (const id of ['A', 'B', 'C'] as const) {
    const p = lamps[id];
    const cone = lightCone(p.x, p.y, p.z - 3, 34, [C.S3, C.S5, C.S7], 0.62);
    addCanvasTexture(scene, WZK.cone(id), cone.cv, cone.ox, cone.oy);
  }

  const panelSurface = surfaces.get(WZK.panelEmpty)!;
  const grid = A.PANEL_GRID;
  const renderPanelGrid = (colors: number[]) =>
    maskOverlay(
      panelSurface,
      (m, x, _y, z) => m === M.GLASS && x >= grid.x0 && x < grid.x0 + 9 && z >= grid.z0 && z < grid.z0 + 9,
      (_px, _py, x, _y, z) => {
        const c = Math.floor((x - grid.x0) / 3);
        const r = 2 - Math.floor((z - grid.z0) / 3);
        return colors[r * 3 + c] ?? 255;
      },
    );

  const bg = surfaces.get(WZK.bg)!;
  cached = {
    screen,
    panelSurface,
    doorSurface,
    renderPanelGrid,
    bounds: { x: bg.ox, y: bg.oy - 60, w: bg.w, h: bg.h + 60 },
  };
  return cached;
}

export function wzArt(): WzArt {
  if (!cached) throw new Error('Wartungszelle not baked');
  return cached;
}
