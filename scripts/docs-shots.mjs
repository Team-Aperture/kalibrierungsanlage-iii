// Captures the README screenshots from a running preview server (npm run preview).
import { chromium, devices } from '@playwright/test';
const BASE = process.env.URL || 'http://localhost:4173/kalibrierungsanlage-iii/?e2e=1';
const OUT = 'docs/images';
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });

async function open(ctxOpts) {
  const ctx = await browser.newContext(ctxOpts);
  const page = await ctx.newPage();
  await page.goto(BASE);
  await page.waitForFunction(() => window.__ka3?.mode === 'menu', null, { timeout: 90000 });
  return page;
}
const solved = (room, x, y, facing, extra = {}) => `(() => {
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

// 1. Dark room right after the opening.
{
  const page = await open({ viewport: { width: 1280, height: 720 } });
  await page.click('#btn-new');
  await page.waitForFunction(() => window.__ka3.state.flag('intro.done') && !window.__ka3.scene.inputLocked, null, { timeout: 30000 });
  const p = await page.evaluate(() => window.__ka3.debugScreenPoint(48, 70, 0));
  await page.mouse.click(p.x, p.y);
  await page.waitForTimeout(4500);
  await page.evaluate(() => document.querySelector('.hint-line')?.classList.remove('show'));
  await page.screenshot({ path: `${OUT}/wartungszelle-dark.png` });
  // Puzzle mid-solve.
  await page.evaluate(() => {
    const a = window.__ka3;
    a.state.data.flags['fuse.taken'] = true;
    a.state.data.flags['fuse.inserted'] = true;
    a.state.data.puzzles.energiepfad.rot = [1, 2, 0, 1, 0, 0, 1, 0, 3];
    a.openPuzzle();
  });
  await page.waitForTimeout(800);
  await page.click('text=Hinweis 1/3');
  await page.waitForTimeout(600);
  await page.screenshot({ path: `${OUT}/puzzle.png` });
  await page.context().close();
}
// 2. Powered room, door open.
{
  const page = await open({ viewport: { width: 1280, height: 720 } });
  await page.evaluate(solved('wartungszelle', 132, 30, 'S'));
  await page.waitForTimeout(3000);
  await page.screenshot({ path: `${OUT}/wartungszelle-lit.png` });
  await page.context().close();
}
// 3. Observation walkway.
{
  const page = await open({ viewport: { width: 1280, height: 720 } });
  await page.evaluate(solved('schleuse', 150, 22, 'SE', { 'schleuse.seen': true }));
  await page.waitForTimeout(3500);
  await page.screenshot({ path: `${OUT}/schleuse.png` });
  await page.context().close();
}
// 4. Phone portrait.
{
  const page = await open({ ...devices['Pixel 7'] });
  await page.click('#btn-new');
  await page.waitForFunction(() => window.__ka3.state.flag('intro.done') && !window.__ka3.scene.inputLocked, null, { timeout: 30000 });
  const p = await page.evaluate(() => window.__ka3.debugHotspot('shelf'));
  await page.touchscreen.tap(p.x, p.y);
  await page.waitForFunction(() => window.__ka3.ui.dialogue.open, null, { timeout: 20000 });
  await page.waitForTimeout(2500);
  await page.screenshot({ path: `${OUT}/phone-portrait.png` });
  await page.context().close();
}
await browser.close();
console.log('done');
