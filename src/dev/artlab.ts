/**
 * Development art lab (open with ?lab). Renders baked room art and the player sheet
 * straight onto canvases, without the game engine, for fast visual iteration.
 */

import { compareBoxes, type SortBox } from '../core/depthSort';
import { indicesToCanvas, shade, type LightingState } from '../art/light';
import { PALETTE_U32 } from '../art/palette';
import { renderPlayerSheet, LIGHT_LEVELS } from '../art/player';
import * as WZA from '../art/rooms/wartungszelle';
import { WZ, type Box3 } from '../content/rooms/wartungszelle.layout';
import * as SLA from '../art/rooms/schleuse';
import { SL } from '../content/rooms/schleuse.layout';
import type { Surface } from '../art/surface';

interface Item {
  surf: Surface;
  box: SortBox;
}

function toBox(b: Box3): SortBox {
  return { x0: b[0], y0: b[1], z0: b[2], x1: b[3], y1: b[4], z1: b[5] };
}

export function runArtLab(root: HTMLElement): void {
  document.body.style.background = '#05060a';
  document.body.style.overflow = 'auto';
  root.innerHTML = '';
  const params = new URLSearchParams(location.search);
  const scale = Number(params.get('scale') || 3);
  const t0 = performance.now();
  const room2 = params.get('room') === 'schleuse';
  const bg = room2 ? SLA.buildBackground() : WZA.buildBackground();
  const props: Item[] = room2 ? schleuseProps() : [
    { surf: WZA.buildTerminal(), box: toBox(WZ.terminal) },
    { surf: WZA.buildPanel(false), box: toBox(WZ.panel) },
    { surf: WZA.buildDoor(0, 1), box: toBox(WZ.doorBox) },
    { surf: WZA.buildShelf(false), box: toBox(WZ.shelf) },
    { surf: WZA.buildMachine(), box: toBox(WZ.machine) },
    { surf: WZA.buildTransformer(), box: toBox(WZ.transformer) },
    { surf: WZA.buildBench(), box: toBox(WZ.bench) },
    { surf: WZA.buildCrates(), box: toBox(WZ.crates) },
    { surf: WZA.buildFan(0), box: toBox(WZ.fan) },
    { surf: WZA.buildHangingLamp(WZ.lampA.x, WZ.lampA.y, WZ.lampA.z, true), box: { x0: WZ.lampA.x - 6, y0: WZ.lampA.y - 6, z0: WZ.lampA.z - 2, x1: WZ.lampA.x + 6, y1: WZ.lampA.y + 6, z1: 160 } },
    { surf: WZA.buildWallLamp(WZ.lampB, 'x', true), box: toBox(WZ.lampB) },
    { surf: WZA.buildWallLamp(WZ.lampC, 'y', true), box: toBox(WZ.lampC) },
  ];
  // Simple O(n²) insertion order respecting the iso comparator.
  props.sort((a, b) => compareBoxes(a.box, b.box));
  const t1 = performance.now();
  const states = (params.get('states') || (room2 ? 'hall,dark' : 'dark,lit')).split(',');
  for (const id of states) {
    const st: LightingState = (room2 ? SLA.LIGHTING : WZA.LIGHTING)[id];
    const minX = bg.ox;
    const minY = Math.min(bg.oy, ...props.map((p) => p.surf.oy));
    const maxX = bg.ox + bg.w;
    const maxY = bg.oy + bg.h;
    const cv = document.createElement('canvas');
    cv.width = maxX - minX;
    cv.height = maxY - minY;
    const ctx = cv.getContext('2d')!;
    ctx.fillStyle = '#07080d';
    ctx.fillRect(0, 0, cv.width, cv.height);
    const draw = (s: Surface) => ctx.drawImage(indicesToCanvas(shade(s, st), s.w, s.h, PALETTE_U32), s.ox - minX, s.oy - minY);
    draw(bg);
    for (const p of props) draw(p.surf);
    cv.style.width = `${cv.width * scale}px`;
    cv.style.imageRendering = 'pixelated';
    cv.style.display = 'block';
    cv.style.margin = '8px';
    const label = document.createElement('div');
    label.textContent = `state: ${id}`;
    label.style.cssText = 'color:#9aa;font:12px monospace;margin:8px';
    root.append(label, cv);
  }
  const sheets = document.createElement('div');
  for (const lv of [LIGHT_LEVELS[1], LIGHT_LEVELS[3], LIGHT_LEVELS[5]]) {
    const s = renderPlayerSheet(lv);
    s.style.width = `${s.width * 4}px`;
    s.style.imageRendering = 'pixelated';
    s.style.display = 'block';
    s.style.margin = '8px';
    s.style.background = '#212a3b';
    sheets.append(s);
  }
  root.append(sheets);
  const info = document.createElement('div');
  info.style.cssText = 'color:#9aa;font:12px monospace;margin:8px';
  info.textContent = `geometry ${(t1 - t0).toFixed(0)} ms, total ${(performance.now() - t0).toFixed(0)} ms`;
  info.id = 'lab-info';
  root.prepend(info);
}

function schleuseProps(): Item[] {
  const items: Item[] = [
    { surf: SLA.buildWalkway(), box: toBox(SLA.WALKWAY_BOX) },
    { surf: SLA.buildRailing(), box: toBox(SL.railing) },
    { surf: SLA.buildGate(0), box: toBox(SL.gate) },
    { surf: SLA.buildGateBox(false), box: toBox(SL.gateBox) },
    { surf: SLA.buildLocker('closed'), box: toBox(SL.locker) },
    { surf: SLA.buildSensor(), box: toBox(SL.sensor) },
    { surf: SLA.buildTerminal07(), box: toBox(SL.terminal) },
    { surf: SLA.buildDoor2(), box: toBox(SL.door2Box) },
    { surf: SLA.buildCrates2(), box: toBox(SL.crates) },
    { surf: SLA.buildGantry(), box: toBox(SL.gantry) },
    { surf: SLA.buildBigFan(0), box: { x0: 34, y0: 0, z0: -80, x1: 94, y1: 1.5, z1: -20 } },
  ];
  SL.columns.forEach((c) => items.push({ surf: SLA.buildColumn(c), box: toBox(c) }));
  SL.pistons.forEach((px) => items.push({ surf: SLA.buildPiston(px, 0.5), box: { x0: px - 13, y0: SL.pistonY - 13, z0: -SL.PD, x1: px + 13, y1: SL.pistonY + 13, z1: -20 } }));
  SLA.PENDANTS.forEach((p) => items.push({ surf: SLA.buildPendant(p.x, p.y, p.z, true), box: { x0: p.x - 9, y0: p.y - 9, z0: p.z - 3, x1: p.x + 9, y1: p.y + 9, z1: 130 } }));
  SL.lamps.forEach((x) => items.push({ surf: SLA.buildTubeLamp(x, true), box: { x0: x - 10, y0: 0, z0: 66, x1: x + 10, y1: 4, z1: 74 } }));
  return items;
}
