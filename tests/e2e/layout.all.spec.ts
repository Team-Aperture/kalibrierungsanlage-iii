import { expect, test, type Page } from '@playwright/test';
import { boot, clickObject, clickWorld, collectErrors, dismissDialogue, info, newGame, waitDialogue, waitIdle } from './helpers';

async function noHorizontalScroll(page: Page): Promise<void> {
  const r = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, w: window.innerWidth, sh: document.documentElement.scrollHeight, h: window.innerHeight }));
  expect(r.sw).toBeLessThanOrEqual(r.w);
  expect(r.sh).toBeLessThanOrEqual(r.h + 1);
}

async function crispCanvas(page: Page): Promise<void> {
  const r = await page.evaluate(() => {
    const c = document.querySelector('#game canvas') as HTMLCanvasElement;
    const b = c.getBoundingClientRect();
    return { cw: c.width, ch: c.height, bw: b.width, bh: b.height, dpr: window.devicePixelRatio };
  });
  // Every game pixel covers a whole number of device pixels.
  const sx = (r.bw * r.dpr) / r.cw;
  const sy = (r.bh * r.dpr) / r.ch;
  expect(Math.abs(sx - Math.round(sx))).toBeLessThan(0.02);
  expect(Math.abs(sy - Math.round(sy))).toBeLessThan(0.02);
  expect(Math.round(sx)).toBeGreaterThanOrEqual(1);
  expect(r.cw).toBeGreaterThanOrEqual(256);
  expect(r.ch).toBeGreaterThanOrEqual(200);
}

async function targetsAreLarge(page: Page, scope: string): Promise<void> {
  const small = await page.evaluate((sel) => {
    const out: string[] = [];
    for (const b of document.querySelectorAll<HTMLElement>(`${sel} button`)) {
      if (b.offsetParent === null || b.classList.contains('tile-btn')) continue;
      const r = b.getBoundingClientRect();
      if (r.width < 43.5 || r.height < 43.5) out.push(`${b.textContent?.trim()} ${r.width}x${r.height}`);
    }
    return out;
  }, scope);
  expect(small).toEqual([]);
}

test('layout, crisp scaling, touch-sized controls and first interaction', async ({ page }, testInfo) => {
  const errors = collectErrors(page);
  await boot(page);
  await noHorizontalScroll(page);
  await targetsAreLarge(page, '#main-menu');
  await newGame(page);
  await crispCanvas(page);
  await noHorizontalScroll(page);
  await targetsAreLarge(page, '#hud');
  const l = (await info(page)).layout;
  const portrait = testInfo.project.name === 'phone-portrait';
  expect(l.portrait).toBe(portrait);
  // Primary interaction works with the device's natural input.
  const touch = testInfo.project.name.startsWith('phone');
  await clickWorld(page, 70, 110, touch);
  await waitIdle(page);
  expect(Math.hypot((await info(page)).player!.x - 70, (await info(page)).player!.y - 110)).toBeLessThan(2.5);
  await clickObject(page, 'terminal', { touch });
  await expect(page.locator('.terminal-view')).toBeVisible({ timeout: 20_000 });
  await noHorizontalScroll(page);
  await targetsAreLarge(page, '.terminal-view');
  if (touch) await page.getByRole('button', { name: /Schließen/ }).tap();
  else await page.keyboard.press('Escape');
  await waitDialogue(page);
  await dismissDialogue(page, touch);
  await targetsAreLarge(page, '#dock');
  await page.screenshot({ path: testInfo.outputPath('play.png') });
  expect(errors, errors.join('\n')).toEqual([]);
});
