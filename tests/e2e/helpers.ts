import { expect, type Page } from '@playwright/test';

/* eslint-disable @typescript-eslint/no-explicit-any */
type Ka3 = any;
declare global {
  interface Window {
    __ka3: Ka3;
  }
}

export interface Info {
  mode: string;
  room: string;
  player: { x: number; y: number; facing: string } | null;
  inventory: string[];
  flags: Record<string, boolean>;
  doors: Record<string, string>;
  puzzle: { rot: number[]; solved: boolean; hints: number; moves: number };
  blocking: boolean;
  focus: string | null;
  light: string | null;
  layout: { portrait: boolean; gameW: number; gameH: number; scale: number; cssW: number; cssH: number; cssPx: number };
  renderer: string;
  playTime: number;
}

export function collectErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  return errors;
}

export async function boot(page: Page, query = ''): Promise<void> {
  await page.goto(`./?e2e=1${query}`);
  await page.waitForFunction(() => window.__ka3?.mode === 'menu', null, { timeout: 90_000 });
}

export async function newGame(page: Page): Promise<void> {
  await page.click('#btn-new');
  // The first interactive moment must arrive within ~30 seconds.
  await page.waitForFunction(() => window.__ka3.state.flag('intro.done') && !window.__ka3.scene?.inputLocked, null, { timeout: 30_000 });
}

export async function continueGame(page: Page): Promise<void> {
  await page.click('#btn-continue');
  await page.waitForFunction(() => window.__ka3.mode === 'play' && !!window.__ka3.scene && !window.__ka3.scene.attract, null, { timeout: 20_000 });
  await page.waitForTimeout(600);
}

export function info(page: Page): Promise<Info> {
  return page.evaluate(() => window.__ka3.debugInfo());
}

export async function hotspot(page: Page, id: string): Promise<{ x: number; y: number }> {
  const p = await page.evaluate((i) => window.__ka3.debugHotspot(i), id);
  expect(p, `hotspot ${id}`).not.toBeNull();
  return p;
}

export async function clickObject(page: Page, id: string, opts: { touch?: boolean; right?: boolean } = {}): Promise<void> {
  const p = await hotspot(page, id);
  if (opts.touch) await page.touchscreen.tap(p.x, p.y);
  else await page.mouse.click(p.x, p.y, opts.right ? { button: 'right' } : undefined);
}

export async function clickWorld(page: Page, x: number, y: number, touch = false): Promise<void> {
  const p = await page.evaluate(([a, b]) => window.__ka3.debugScreenPoint(a, b, 0), [x, y]);
  if (touch) await page.touchscreen.tap(p.x, p.y);
  else await page.mouse.click(p.x, p.y);
}

export async function waitDialogue(page: Page, timeout = 20_000): Promise<string> {
  await page.waitForFunction(() => window.__ka3.ui.dialogue.open, null, { timeout });
  return page.evaluate(() => window.__ka3.ui.dialogue.text as string);
}

/** Advances dialogue until it is closed; returns all shown texts. */
export async function dismissDialogue(page: Page, touch = false): Promise<string[]> {
  const texts: string[] = [];
  for (let i = 0; i < 20; i++) {
    const open = await page.evaluate(() => window.__ka3.ui.dialogue.open);
    if (!open) break;
    // Finish typing, then advance.
    await page.waitForTimeout(150);
    texts.push(await page.evaluate(() => window.__ka3.ui.dialogue.text as string));
    if (touch) await page.locator('.dialogue').tap();
    else await page.keyboard.press('Enter');
    await page.waitForTimeout(200);
    // If the press only completed the typing, press once more to advance.
    const still = await page.evaluate(() => window.__ka3.ui.dialogue.text as string);
    if (still && still === texts[texts.length - 1]) {
      if (touch) await page.locator('.dialogue').tap();
      else await page.keyboard.press('Enter');
      await page.waitForTimeout(200);
    }
  }
  return texts;
}

export async function waitIdle(page: Page, timeout = 20_000): Promise<void> {
  await page.waitForFunction(() => !window.__ka3.scene?.player.following, null, { timeout });
  await page.waitForTimeout(150);
}

export async function holdKey(page: Page, key: string, ms: number): Promise<void> {
  await page.keyboard.down(key);
  await page.waitForTimeout(ms);
  await page.keyboard.up(key);
  await page.waitForTimeout(120);
}

export async function rotate(page: Page, tile: number, times = 1, touch = false): Promise<void> {
  for (let k = 0; k < times; k++) {
    const btn = page.locator('.tile-btn').nth(tile);
    if (touch) await btn.tap();
    else await btn.click();
    await page.waitForTimeout(60);
  }
}

/** Quarter turns needed (clockwise) to go from one rotation to another. */
export function turns(from: number, to: number): number {
  return (((to - from) % 4) + 4) % 4;
}

export const SOLUTION = [1, 2, 2, 1, 0, 2, 1, 0, 3];

export async function solvePuzzle(page: Page, touch = false): Promise<void> {
  for (const i of [3, 0, 1, 2, 6, 8, 5]) {
    for (;;) {
      const p = (await info(page)).puzzle;
      if (p.solved || p.rot[i] === SOLUTION[i]) break;
      await rotate(page, i, 1, touch);
    }
  }
}
