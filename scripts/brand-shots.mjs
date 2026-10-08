// Screenshots of the branding milestone from a running preview server (npm run preview):
// boot splash, title screen (desktop + phone), in-world uses (zoomed crops).
// usage: node scripts/brand-shots.mjs [outDir]
import { chromium, devices } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';

const BASE = process.env.URL || 'http://localhost:4173/kalibrierungsanlage-iii/?e2e=1';
const OUT = process.argv[2] || 'docs/images';
mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const SETTINGS = { v: 1, crt: 0.6, flicker: true, reducedMotion: false, volume: 0.7, muted: true, joystick: false, textSpeed: 55, lite: false, perfChecked: true };

async function open(ctxOpts, waitMenu = true) {
  const ctx = await browser.newContext(ctxOpts);
  const page = await ctx.newPage();
  await page.addInitScript((s) => localStorage.setItem('ka3.settings.v1', JSON.stringify(s)), SETTINGS);
  await page.goto(BASE);
  if (waitMenu) await page.waitForFunction(() => window.__ka3?.mode === 'menu', null, { timeout: 90000 });
  return page;
}

/** Crops a region (CSS px) of a screenshot and enlarges it with nearest-neighbour. */
function crop(src, dst, x, y, w, h, scale) {
  execFileSync('python3', ['-I', '-c', `
import sys
from PIL import Image
im = Image.open(sys.argv[1]).crop((int(sys.argv[3]), int(sys.argv[4]), int(sys.argv[3]) + int(sys.argv[5]), int(sys.argv[4]) + int(sys.argv[6])))
s = float(sys.argv[7])
im.resize((int(im.width * s), int(im.height * s)), Image.NEAREST).save(sys.argv[2])
`, src, dst, String(Math.round(x)), String(Math.round(y)), String(Math.round(w)), String(Math.round(h)), String(scale)]);
}

const state = (room, x, y, facing, extra = {}) => `(() => {
  const a = window.__ka3;
  const d = JSON.parse(JSON.stringify(a.state.data));
  d.flags = { 'intro.done': true, 'fuse.taken': true, 'fuse.inserted': true, 'terminal.read': true, ...${JSON.stringify(extra)} };
  d.inventory = [];
  d.puzzles.energiepfad = { rot: [1,2,2,1,0,2,1,0,3], solved: true, hints: 0, moves: 9 };
  d.doors.schleuse01 = 'OPEN';
  d.room = '${room}';
  d.player = { x: ${x}, y: ${y}, facing: '${facing}' };
  a.ui.closeAll();
  a.state.reset(d);
  a.enterPlay({ roomId: '${room}', arrival: 'saved' });
})()`;

// 1. Boot splash (first visit in a session) and the title screen.
{
  const page = await open({ viewport: { width: 1280, height: 720 } }, false);
  await page.waitForSelector('#loader .boot-line.visible');
  await page.waitForTimeout(1250);
  await page.screenshot({ path: `${OUT}/boot.png` });
  await page.waitForFunction(() => window.__ka3?.mode === 'menu', null, { timeout: 90000 });
  await page.waitForTimeout(3600);
  await page.evaluate(() => document.activeElement?.blur());
  await page.screenshot({ path: `${OUT}/title.png` });
  await page.context().close();
}
// 2. Title screen on a phone (portrait).
{
  const page = await open({ ...devices['Pixel 7'] });
  await page.waitForTimeout(3600);
  await page.screenshot({ path: `${OUT}/title-phone.png` });
  await page.context().close();
}
// 3. In-world: T-01 showing the emblem (powered room), then the terminal reader.
{
  const page = await open({ viewport: { width: 1280, height: 720 } });
  await page.evaluate(state('wartungszelle', 70, 40, 'N'));
  await page.waitForFunction(() => window.__ka3.scene && !window.__ka3.scene.attract, null, { timeout: 20000 });
  // Wait for the emblem phase of T-01's cycle (9 s, emblem from 5.6 s), plus its boot.
  await page.waitForFunction(() => {
    const t = window.__ka3.scene.time.now % 9000;
    return t > 6500 && t < 8000;
  }, null, { timeout: 20000, polling: 50 });
  await page.screenshot({ path: `${OUT}/_t01.png` });
  const p = await page.evaluate(() => window.__ka3.debugHotspot('terminal'));
  crop(`${OUT}/_t01.png`, `${OUT}/inworld-t01.png`, p.x - 160, p.y - 20, 320, 180, 2);
  await page.keyboard.press('Escape').catch(() => {});
  await page.context().close();
}
// 4. In-world: the painted emblem on the hall wall.
{
  const page = await open({ viewport: { width: 1280, height: 720 } });
  await page.evaluate(state('schleuse', 22, 22, 'W', { 'schleuse.seen': true }));
  await page.waitForFunction(() => window.__ka3.scene && !window.__ka3.scene.attract, null, { timeout: 20000 });
  await page.waitForTimeout(3500);
  await page.screenshot({ path: `${OUT}/inworld-hall.png` });
  const p = await page.evaluate(() => window.__ka3.debugHotspot('wandbild'));
  crop(`${OUT}/inworld-hall.png`, `${OUT}/inworld-hall-zoom.png`, p.x - 150, p.y - 30, 300, 220, 2);
  await page.context().close();
}
await browser.close();
console.log('done');
