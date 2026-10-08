import { expect, test } from '@playwright/test';
import { boot, clickWorld, collectErrors, dismissDialogue, holdKey, info, newGame, waitDialogue, waitIdle } from './helpers';

test('pause menu freezes the world and Escape resumes', async ({ page }) => {
  const errors = collectErrors(page);
  await boot(page);
  await newGame(page);
  await page.keyboard.press('Escape');
  await expect(page.locator('#pause-menu')).toBeVisible();
  const a = (await info(page)).player!;
  await holdKey(page, 'KeyD', 500);
  expect((await info(page)).player).toEqual(a);
  expect((await info(page)).mode).toBe('paused');
  await page.keyboard.press('Escape');
  await expect(page.locator('#pause-menu')).toBeHidden();
  await holdKey(page, 'KeyD', 400);
  expect((await info(page)).player!.x).not.toBe(a.x);
  // Pause button + inventory from the pause menu.
  await page.getByRole('button', { name: 'Pausenmenü öffnen' }).click();
  await page.locator('#pause-menu').getByRole('button', { name: /Inventar/ }).click();
  await expect(page.locator('#inventory')).toContainText('Keine Gegenstände');
  await page.keyboard.press('Escape');
  await expect(page.locator('#inventory')).toBeHidden();
  await page.locator('#pause-menu').getByRole('button', { name: /Fortsetzen/ }).click();
  expect((await info(page)).mode).toBe('play');
  // Back to the main menu and continue.
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: /Hauptmenü/ }).click();
  await expect(page.locator('#main-menu')).toBeVisible();
  await page.click('#btn-continue');
  await page.waitForFunction(() => window.__ka3.mode === 'play');
  expect(errors).toEqual([]);
});

test('settings apply immediately and persist', async ({ page }) => {
  await boot(page);
  await page.click('#btn-settings');
  const crt = page.getByRole('slider', { name: 'CRT-Intensität' });
  await crt.fill('20');
  await page.getByRole('button', { name: 'Bewegung reduzieren' }).click();
  await page.getByRole('button', { name: 'Bildschirmflackern' }).click();
  await page.getByRole('button', { name: 'Ton stumm' }).click();
  const crtVar = await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--crt'));
  expect(Number(crtVar)).toBeCloseTo(0.2, 2);
  await page.reload();
  await boot(page);
  const s = await page.evaluate(() => window.__ka3.settings);
  expect(s.crt).toBeCloseTo(0.2, 2);
  expect(s.muted).toBe(true);
  expect(typeof s.reducedMotion).toBe('boolean');
  expect(await page.evaluate(() => document.body.classList.contains('no-flicker'))).toBe(s.flicker === false);
});

test('missing, corrupt and incompatible saves are handled', async ({ page }) => {
  await page.goto('./?e2e=1');
  await page.evaluate(() => localStorage.setItem('ka3.save.v1', '{"v":1,"room":'));
  await boot(page);
  await expect(page.locator('#main-menu')).toContainText('beschädigt');
  await expect(page.locator('#btn-continue')).toHaveCount(0);
  await page.evaluate(() => localStorage.setItem('ka3.save.v1', JSON.stringify({ v: 7, room: 'x' })));
  await page.reload();
  await boot(page);
  await expect(page.locator('#main-menu')).toContainText('inkompatiblen');
  // A new game replaces the broken save.
  await newGame(page);
  await page.evaluate(() => window.__ka3.persistNow());
  const raw = await page.evaluate(() => JSON.parse(localStorage.getItem('ka3.save.v1')!));
  expect(raw.v).toBe(1);
});

test('browser resizing and orientation changes keep the game consistent', async ({ page }) => {
  const errors = collectErrors(page);
  await boot(page);
  await newGame(page);
  await clickWorld(page, 70, 110);
  await waitIdle(page);
  const before = (await info(page)).player!;
  for (const [w, h] of [
    [900, 600],
    [1600, 900],
    [420, 860],
    [860, 420],
    [1280, 720],
  ]) {
    await page.setViewportSize({ width: w, height: h });
    await page.waitForTimeout(500);
    const l = (await info(page)).layout;
    expect(l.portrait).toBe(h > w * 1.1);
    const r = await page.evaluate(() => {
      const c = document.querySelector('#game canvas') as HTMLCanvasElement;
      return { cw: c.width, bw: c.getBoundingClientRect().width, dpr: devicePixelRatio, sw: document.documentElement.scrollWidth, iw: innerWidth };
    });
    expect(r.cw).toBe(l.gameW);
    const k = (r.bw * r.dpr) / r.cw;
    expect(Math.abs(k - Math.round(k))).toBeLessThan(0.02);
    expect(r.sw).toBeLessThanOrEqual(r.iw);
  }
  expect((await info(page)).player).toEqual(before);
  await holdKey(page, 'KeyS', 300);
  expect((await info(page)).player!.y).toBeGreaterThan(before.y);
  expect(errors).toEqual([]);
});

test('reduced motion is respected by default and shortens the opening', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await boot(page);
  expect(await page.evaluate(() => window.__ka3.settings.reducedMotion)).toBe(true);
  const t = Date.now();
  await newGame(page);
  expect(Date.now() - t).toBeLessThan(12_000);
  expect(await page.evaluate(() => document.body.classList.contains('reduce-motion'))).toBe(true);
});

test('Canvas renderer fallback works', async ({ page }) => {
  const errors = collectErrors(page);
  await boot(page, '&renderer=canvas');
  expect((await info(page)).renderer).toBe('canvas');
  await newGame(page);
  await clickWorld(page, 70, 110);
  await waitIdle(page);
  expect(Math.hypot((await info(page)).player!.x - 70, (await info(page)).player!.y - 110)).toBeLessThan(2.5);
  await page.keyboard.press('KeyE');
  await page.waitForTimeout(300);
  if (await page.evaluate(() => window.__ka3.ui.dialogue.open)) {
    await waitDialogue(page);
    await dismissDialogue(page);
  }
  expect(errors).toEqual([]);
});
