import { expect, test } from '@playwright/test';
import { boot, clickObject, clickWorld, collectErrors, dismissDialogue, info, newGame, solvePuzzle, waitDialogue, waitIdle } from './helpers';

test('Kapitel 0 is completable with touch only', async ({ page }) => {
  const errors = collectErrors(page);
  await boot(page);
  await newGame(page);
  const touch = true;

  await test.step('tap to move', async () => {
    const a = (await info(page)).player!;
    await clickWorld(page, 70, 110, touch);
    await waitIdle(page);
    const b = (await info(page)).player!;
    expect(Math.hypot(b.x - 70, b.y - 110)).toBeLessThan(2.5);
    expect(Math.hypot(b.x - a.x, b.y - a.y)).toBeGreaterThan(5);
  });

  await test.step('tap objects, tap to advance dialogue', async () => {
    await clickObject(page, 'shelf', { touch });
    await waitDialogue(page);
    await dismissDialogue(page, touch);
    expect((await info(page)).inventory).toEqual(['sicherung']);
  });

  await test.step('long press inspects', async () => {
    // Long-press the shelf the player is standing at (always on screen).
    const p = await page.evaluate(() => window.__ka3.debugHotspot('shelf'));
    // A long touch: dispatch touchstart, wait, touchend through CDP.
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: p.x, y: p.y }] });
    await page.waitForTimeout(650);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    const t = await waitDialogue(page);
    expect(t).toMatch(/Metallregal|Kartons/);
    await dismissDialogue(page, touch);
  });

  await test.step('quick item strip (portrait) or object tap inserts the fuse', async () => {
    await clickObject(page, 'panel', { touch });
    await waitDialogue(page);
    await dismissDialogue(page, touch);
    await expect(page.locator('#puzzle')).toBeVisible({ timeout: 10_000 });
  });

  await test.step('solve the puzzle with taps', async () => {
    // Touch targets on the board are at least 44 CSS px.
    const box = await page.locator('.tile-btn').first().boundingBox();
    expect(box!.width).toBeGreaterThanOrEqual(44);
    await solvePuzzle(page, touch);
    await expect(page.locator('#puzzle')).toBeHidden({ timeout: 10_000 });
    await waitDialogue(page, 30_000);
    await dismissDialogue(page, touch);
    expect((await info(page)).doors.schleuse01).toBe('OPEN');
  });

  await test.step('through the door to the walkway', async () => {
    await clickObject(page, 'door', { touch });
    await page.waitForFunction(() => window.__ka3.scene?.room.id === 'schleuse', null, { timeout: 20_000 });
    await waitDialogue(page);
    await dismissDialogue(page, touch);
  });

  await test.step('crank via the inventory panel', async () => {
    await clickObject(page, 'locker', { touch });
    await waitDialogue(page);
    await dismissDialogue(page, touch);
    await clickObject(page, 'locker', { touch });
    await waitDialogue(page);
    await dismissDialogue(page, touch);
    expect((await info(page)).inventory).toEqual(['kurbel']);
    // Select the crank in the inventory, then tap the crank box as target.
    await page.locator('#hud .btn', { hasText: 'Inventar' }).tap();
    await expect(page.locator('#inventory')).toBeVisible();
    await page.getByRole('button', { name: /Benutzen mit/ }).tap();
    const focus = (await info(page)).focus;
    if (!(await page.evaluate(() => window.__ka3.ui.dialogue.open))) {
      // Not in reach of anything: the game asks for a target.
      expect(focus === null || focus === 'locker').toBe(true);
      await clickObject(page, 'gateBox', { touch });
    }
    await waitDialogue(page);
    await dismissDialogue(page, touch);
    await page.waitForFunction(() => window.__ka3.debugInfo().doors.schott02 === 'OPEN', null, { timeout: 20_000 });
    await waitDialogue(page);
    await dismissDialogue(page, touch);
  });

  await test.step('signal and chapter end', async () => {
    await clickWorld(page, 250, 26, touch);
    await page.waitForFunction(() => window.__ka3.state.flag('signal.started'), null, { timeout: 25_000 });
    await waitDialogue(page, 30_000);
    await dismissDialogue(page, touch);
    await waitDialogue(page, 15_000);
    await dismissDialogue(page, touch);
    await expect(page.locator('#ending')).toContainText('KAPITEL 0 ABGESCHLOSSEN', { timeout: 20_000 });
    await expect(page.locator('#btn-menu')).toBeVisible({ timeout: 10_000 });
    await page.locator('#btn-menu').tap();
    await expect(page.locator('#main-menu')).toBeVisible();
    await expect(page.locator('#btn-continue')).toBeVisible();
  });

  expect(errors, errors.join('\n')).toEqual([]);
});
