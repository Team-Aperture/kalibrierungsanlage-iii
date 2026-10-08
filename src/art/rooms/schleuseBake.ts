/** Bakes all textures and overlays of Location 2. */

import type Phaser from 'phaser';
import { SL } from '../../content/rooms/schleuse.layout';
import { addCanvasTexture, bakeSurface, nextFrame } from '../bake';
import { M } from '../materials';
import { C } from '../palette';
import { FaceMapper, lightCone, maskOverlay } from '../overlay';
import type { Surface } from '../surface';
import * as A from './schleuse';

export const SL_LIGHTS = ['hall', 'dark'] as const;

export const SLK = {
  bg: 'sl.bg',
  walkway: 'sl.walkway',
  railing: 'sl.railing',
  endRailing: 'sl.endRailing',
  gate: (k: number) => `sl.gate.${k}`,
  gateBox: (crank: boolean) => `sl.gateBox.${crank ? 'crank' : 'empty'}`,
  locker: (st: 'closed' | 'crank' | 'empty') => `sl.locker.${st}`,
  sensor: 'sl.sensor',
  terminal: 'sl.t07',
  door2: 'sl.door2',
  crates: 'sl.crates',
  column: (i: number) => `sl.column.${i}`,
  gantry: 'sl.gantry',
  fan: (f: number) => `sl.fan.${f}`,
  piston: (i: number, f: number) => `sl.piston.${i}.${f}`,
  pendant: (i: number, on: boolean) => `sl.pendant.${i}.${on ? 'on' : 'off'}`,
  tube: (i: number, on: boolean) => `sl.tube.${i}.${on ? 'on' : 'off'}`,
  cone: (i: number) => `sl.cone.${i}`,
  beacon: (i: number, on: boolean) => `sl.beacon.${i}.${on ? 'on' : 'off'}`,
  doorLamp: 'sl.door2.lamp',
  eye: 'sl.eye',
  screen: 'sl.screen',
} as const;

export const GATE_FRAMES = 8;
export const PISTON_PHASES = [0, 0.33, 0.66];

export interface SlArt {
  screen: FaceMapper;
  bounds: { x: number; y: number; w: number; h: number };
}

let cached: SlArt | null = null;

export async function bakeSchleuse(scene: Phaser.Scene, progress: (p: number) => void): Promise<SlArt> {
  const jobs: Array<{ key: string; build: () => Surface; lights?: readonly string[] }> = [
    { key: SLK.bg, build: () => A.buildBackground() },
    { key: SLK.walkway, build: () => A.buildWalkway() },
    { key: SLK.railing, build: () => A.buildRailing() },
    { key: SLK.endRailing, build: () => A.buildEndRailing() },
    { key: SLK.gateBox(false), build: () => A.buildGateBox(false) },
    { key: SLK.gateBox(true), build: () => A.buildGateBox(true) },
    { key: SLK.locker('closed'), build: () => A.buildLocker('closed') },
    { key: SLK.locker('crank'), build: () => A.buildLocker('crank') },
    { key: SLK.locker('empty'), build: () => A.buildLocker('empty') },
    { key: SLK.sensor, build: () => A.buildSensor() },
    { key: SLK.terminal, build: () => A.buildTerminal07() },
    { key: SLK.door2, build: () => A.buildDoor2() },
    { key: SLK.crates, build: () => A.buildCrates2() },
    { key: SLK.gantry, build: () => A.buildGantry() },
  ];
  SL.columns.forEach((c, i) => jobs.push({ key: SLK.column(i), build: () => A.buildColumn(c) }));
  for (let k = 0; k <= GATE_FRAMES; k++) jobs.push({ key: SLK.gate(k), build: () => A.buildGate(k / GATE_FRAMES) });
  for (let f = 0; f < 4; f++) jobs.push({ key: SLK.fan(f), build: () => A.buildBigFan(f) });
  SL.pistons.forEach((px, i) => {
    for (let f = 0; f < A.PISTON_FRAMES; f++) {
      jobs.push({ key: SLK.piston(i, f), build: () => A.buildPiston(px, A.pistonExt(f, PISTON_PHASES[i])) });
    }
  });
  A.PENDANTS.forEach((p, i) => {
    for (const on of [false, true]) jobs.push({ key: SLK.pendant(i, on), build: () => A.buildPendant(p.x, p.y, p.z, on) });
  });
  SL.lamps.forEach((x, i) => {
    for (const on of [false, true]) jobs.push({ key: SLK.tube(i, on), build: () => A.buildTubeLamp(x, on) });
  });

  const surfaces = new Map<string, Surface>();
  let done = 0;
  for (const job of jobs) {
    const surf = job.build();
    surfaces.set(job.key, surf);
    for (const light of job.lights ?? SL_LIGHTS) bakeSurface(scene, `${job.key}@${light}`, surf, A.LIGHTING[light]);
    done++;
    progress(done / jobs.length);
    if (done % 3 === 0) await nextFrame();
  }

  // Terminal T-07 screen mapping.
  const t07 = surfaces.get(SLK.terminal)!;
  const S = A.T07_SCREEN;
  const screen = new FaceMapper(t07, S.O, S.U, S.V, S.w, S.h, (m) => m === M.GLASS);

  // Piston warning beacons.
  SL.pistons.forEach((_px, i) => {
    const surf = surfaces.get(SLK.piston(i, 0))!;
    for (const on of [false, true]) {
      addCanvasTexture(
        scene,
        SLK.beacon(i, on),
        maskOverlay(surf, (m, _x, _y, z) => m === M.GLASS && z > -60, (px) => (on ? (px % 2 ? C.RED : C.SALMON) : C.RED_D)),
        surf.ox,
        surf.oy,
      );
    }
  });
  // Door 0-2 lamp and display.
  const d2 = surfaces.get(SLK.door2)!;
  addCanvasTexture(
    scene,
    SLK.doorLamp,
    maskOverlay(d2, (m) => m === M.GLASS, (px, _py, _x, _y, z) => (z > 45 ? (px % 2 ? C.RED : C.SALMON) : (px + Math.floor(z)) % 3 === 0 ? C.RED_D : 255)),
    d2.ox,
    d2.oy,
  );
  // Light cones below the pendants (long, into the haze of the hall).
  A.PENDANTS.forEach((p, i) => {
    const c = lightCone(p.x, p.y, p.z - 3 + SL.PD, 40, [C.S2, C.S4, C.S6], 0.5);
    // lightCone assumes the floor is at z = 0; shift it down to the pit floor.
    addCanvasTexture(scene, SLK.cone(i), c.cv, c.ox, c.oy + SL.PD);
  });

  const bg = surfaces.get(SLK.bg)!;
  cached = {
    screen,
    bounds: { x: bg.ox, y: bg.oy - 30, w: bg.w, h: bg.h - 20 },
  };
  return cached;
}

export function slArt(): SlArt {
  if (!cached) throw new Error('Schleuse not baked');
  return cached;
}
