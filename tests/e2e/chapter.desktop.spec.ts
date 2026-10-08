import { expect, test } from '@playwright/test';
import {
  boot,
  clickObject,
  clickWorld,
  collectErrors,
  continueGame,
  dismissDialogue,
  holdKey,
  info,
  newGame,
  rotate,
  solvePuzzle,
  waitDialogue,
  waitIdle,
} from './helpers';

test('Kapitel 0 is completable with mouse + keyboard and survives reloads', async ({ page }) => {
  const errors = collectErrors(page);
  await boot(page);
  const t0 = Date.now();
  await newGame(page);
  expect(Date.now() - t0, 'first interactive moment').toBeLessThan(30_000);
  expect((await info(page)).renderer).toBe('webgl');

  await test.step('keyboard movement in all directions', async () => {
    const screen = async () => {
      const p = (await info(page)).player!;
      return { sx: p.x - p.y, sy: (p.x + p.y) / 2 };
    };
    for (const [key, axis, sign] of [
      ['KeyD', 'sx', 1],
      ['KeyA', 'sx', -1],
      ['KeyW', 'sy', -1],
      ['KeyS', 'sy', 1],
      ['ArrowRight', 'sx', 1],
      ['ArrowUp', 'sy', -1],
    ] as const) {
      const a = await screen();
      await holdKey(page, key, 350);
      const b = await screen();
      expect((b[axis] - a[axis]) * sign, key).toBeGreaterThan(4);
    }
    // Diagonal (two keys) follows an iso axis.
    const a = (await info(page)).player!;
    await page.keyboard.down('KeyD');
    await page.keyboard.down('KeyS');
    await page.waitForTimeout(350);
    await page.keyboard.up('KeyD');
    await page.keyboard.up('KeyS');
    const b = (await info(page)).player!;
    expect(b.x - a.x).toBeGreaterThan(4);
    expect(Math.abs(b.y - a.y)).toBeLessThan(2);
  });

  await test.step('walking into walls is blocked', async () => {
    await holdKey(page, 'KeyA', 2500);
    await holdKey(page, 'KeyW', 2500);
    const p = (await info(page)).player!;
    expect(p.x).toBeGreaterThanOrEqual(4.4);
    expect(p.y).toBeGreaterThanOrEqual(4.4);
  });

  await test.step('click-to-move, rapid retargeting and unreachable targets', async () => {
    await clickWorld(page, 60, 140);
    await page.waitForTimeout(150);
    await clickWorld(page, 150, 60);
    await page.waitForTimeout(150);
    await clickWorld(page, 130, 140);
    await waitIdle(page);
    let p = (await info(page)).player!;
    expect(Math.hypot(p.x - 130, p.y - 140)).toBeLessThan(2.5);
    // Around the transformer (path finding, never through solids).
    await clickWorld(page, 140, 30);
    await waitIdle(page);
    p = (await info(page)).player!;
    expect(Math.hypot(p.x - 140, p.y - 30)).toBeLessThan(2.5);
    // Outside the room: walks to the closest reachable spot, no teleport, no crash.
    await clickWorld(page, 205, 120);
    await waitIdle(page);
    p = (await info(page)).player!;
    expect(p.x).toBeLessThanOrEqual(192);
    expect(p.y).toBeLessThanOrEqual(160);
  });

  await test.step('inspect and use objects', async () => {
    await clickObject(page, 'terminal');
    await expect(page.locator('.terminal-view')).toBeVisible({ timeout: 20_000 });
    await expect(page.locator('.terminal-view')).toContainText('SICHERUNG F3');
    await page.keyboard.press('Escape');
    await waitDialogue(page);
    await dismissDialogue(page);
    // Right click = inspect.
    await clickObject(page, 'machine', { right: true });
    expect(await waitDialogue(page)).toContain('');
    const t = await dismissDialogue(page);
    expect(t.join(' ')).toMatch(/Maschine|MESSWERK/);
    expect((await info(page)).flags).toBeTruthy();
  });

  await test.step('collect the fuse', async () => {
    await clickObject(page, 'shelf');
    await waitDialogue(page);
    await dismissDialogue(page);
    const s = await info(page);
    expect(s.inventory).toEqual(['sicherung']);
    expect(s.flags['fuse.taken']).toBe(true);
    // Using the shelf again does not duplicate the item.
    await clickObject(page, 'shelf');
    await waitDialogue(page);
    await dismissDialogue(page);
    expect((await info(page)).inventory).toEqual(['sicherung']);
  });

  await test.step('use the fuse from the inventory on the panel', async () => {
    await clickWorld(page, 88, 18);
    await waitIdle(page);
    await page.keyboard.press('KeyI');
    await expect(page.locator('#inventory')).toBeVisible();
    await expect(page.locator('#inventory')).toContainText('Sicherungseinsatz F3');
    await page.getByRole('button', { name: /Benutzen mit/ }).click();
    await waitDialogue(page);
    await dismissDialogue(page);
    await expect(page.locator('#puzzle')).toBeVisible({ timeout: 10_000 });
    const s = await info(page);
    expect(s.inventory).toEqual([]);
    expect(s.flags['fuse.inserted']).toBe(true);
  });

  await test.step('puzzle: wrong path, short circuit, undo, reset, hints', async () => {
    await expect(page.locator('#puzzle .readout')).toContainText('1/9');
    // Turn the bottom-left corner so power runs into the burnt segment.
    await rotate(page, 6, 3);
    await expect(page.locator('#puzzle .readout')).toContainText('KURZSCHLUSS');
    expect((await info(page)).puzzle.solved).toBe(false);
    await page.getByRole('button', { name: /Rückgängig/ }).click();
    await expect(page.locator('#puzzle .readout')).not.toContainText('KURZSCHLUSS');
    // Fixed segments do not turn.
    const before = (await info(page)).puzzle.rot.slice();
    await expect(page.locator('.tile-btn').nth(4)).toHaveAttribute('aria-disabled', 'true');
    await page.locator('.tile-btn').nth(4).click({ force: true });
    expect((await info(page)).puzzle.rot[4]).toBe(before[4]);
    await rotate(page, 0, 2);
    await page.getByRole('button', { name: 'Zurücksetzen' }).click();
    expect((await info(page)).puzzle.rot).toEqual([2, 0, 0, 0, 0, 0, 1, 0, 3]);
    // Hints escalate one at a time.
    await page.getByRole('button', { name: /Hinweis 1\/3/ }).click();
    await expect(page.locator('.hint-box')).toContainText('HINWEIS 1');
    await expect(page.locator('.hint-box')).not.toContainText('HINWEIS 2');
    expect((await info(page)).puzzle.hints).toBe(1);
    // Keyboard control on the board.
    await page.locator('.tile-btn').nth(3).focus();
    await page.keyboard.press('Enter');
    expect((await info(page)).puzzle.rot[3]).toBe(1);
    await page.keyboard.press('Shift+Enter');
    expect((await info(page)).puzzle.rot[3]).toBe(0);
    // Partial progress, then leave the panel.
    await rotate(page, 3, 1);
    await rotate(page, 0, 3);
    await page.getByRole('button', { name: /Schließen/ }).click();
    await waitDialogue(page);
    await dismissDialogue(page);
  });

  await test.step('saving halfway through the puzzle and reloading', async () => {
    const saved = (await info(page)).puzzle;
    await page.evaluate(() => window.__ka3.persistNow());
    await page.reload();
    await boot(page);
    await continueGame(page);
    const s = await info(page);
    expect(s.puzzle.rot).toEqual(saved.rot);
    expect(s.puzzle.hints).toBe(1);
    expect(s.flags['fuse.inserted']).toBe(true);
    expect(s.doors.schleuse01).toBe('LOCKED');
  });

  await test.step('solve the puzzle – the room responds', async () => {
    await clickObject(page, 'panel');
    await expect(page.locator('#puzzle')).toBeVisible({ timeout: 15_000 });
    await solvePuzzle(page);
    await expect(page.locator('#puzzle .readout')).toContainText('ZIEL UNTER SPANNUNG');
    await expect(page.locator('#puzzle')).toBeHidden({ timeout: 10_000 });
    // Power-up sequence: lighting changes, door unlocks and opens.
    await page.waitForFunction(() => window.__ka3.debugInfo().light === 'lit', null, { timeout: 10_000 });
    await waitDialogue(page, 30_000);
    const s = await info(page);
    expect(s.doors.schleuse01).toBe('OPEN');
    expect(s.puzzle.solved).toBe(true);
    await dismissDialogue(page);
  });

  await test.step('repeated interaction after completion does not re-trigger', async () => {
    await clickObject(page, 'panel');
    const t = await waitDialogue(page);
    expect(t).toBeDefined();
    await dismissDialogue(page);
    await expect(page.locator('#puzzle')).toHaveCount(0);
    expect((await info(page)).doors.schleuse01).toBe('OPEN');
  });

  await test.step('reload keeps the door open and the room powered', async () => {
    await page.evaluate(() => window.__ka3.persistNow());
    await page.reload();
    await boot(page);
    await continueGame(page);
    const s = await info(page);
    expect(s.doors.schleuse01).toBe('OPEN');
    expect(s.light).toBe('lit');
  });

  await test.step('scene transition through the door', async () => {
    await clickObject(page, 'door');
    await page.waitForFunction(() => window.__ka3.debugInfo().room === 'schleuse' && !!window.__ka3.scene && window.__ka3.scene.room.id === 'schleuse', null, { timeout: 20_000 });
    await waitDialogue(page);
    await dismissDialogue(page);
  });

  await test.step('reload after the transition', async () => {
    await page.evaluate(() => window.__ka3.persistNow());
    await page.reload();
    await boot(page);
    await continueGame(page);
    expect((await info(page)).room).toBe('schleuse');
  });

  await test.step('locker, crank and gate', async () => {
    // The gate blocks the walkway.
    await clickWorld(page, 240, 24);
    await waitIdle(page);
    expect((await info(page)).player!.x).toBeLessThan(176);
    await clickObject(page, 'locker');
    await waitDialogue(page);
    await dismissDialogue(page);
    await clickObject(page, 'locker');
    await waitDialogue(page);
    await dismissDialogue(page);
    expect((await info(page)).inventory).toEqual(['kurbel']);
    await clickObject(page, 'gateBox');
    await waitDialogue(page);
    await dismissDialogue(page);
    await page.waitForFunction(() => window.__ka3.debugInfo().doors.schott02 === 'OPEN', null, { timeout: 15_000 });
    await waitDialogue(page);
    await dismissDialogue(page);
  });

  await test.step('the signal event ends the chapter', async () => {
    await clickWorld(page, 250, 26);
    await page.waitForFunction(() => window.__ka3.state.flag('signal.started'), null, { timeout: 20_000 });
    await waitDialogue(page, 30_000);
    const texts = await dismissDialogue(page);
    expect(texts.join(' ')).toContain('EINGEHENDES SIGNAL');
    await waitDialogue(page, 15_000);
    await dismissDialogue(page);
    await expect(page.locator('#ending')).toBeVisible({ timeout: 20_000 });
    await expect(page.locator('#ending')).toContainText('KAPITEL 0 ABGESCHLOSSEN');
    await expect(page.locator('#ending')).toContainText('DIE KALIBRIERUNGSANLAGE III');
    await expect(page.locator('#btn-replay')).toBeVisible({ timeout: 10_000 });
    expect((await info(page)).playTime).toBeGreaterThan(5);
  });

  await test.step('replay starts a fresh chapter', async () => {
    await page.click('#btn-replay');
    await page.waitForFunction(() => window.__ka3.state.flag('intro.done') && !window.__ka3.scene?.inputLocked, null, { timeout: 30_000 });
    const s = await info(page);
    expect(s.room).toBe('wartungszelle');
    expect(s.inventory).toEqual([]);
    expect(s.doors.schleuse01).toBe('LOCKED');
    expect(s.puzzle.solved).toBe(false);
  });

  expect(errors, errors.join('\n')).toEqual([]);
});
