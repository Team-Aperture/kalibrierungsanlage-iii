// Measures boot (bake) time and frame pacing, optionally with CPU throttling to
// approximate a mid-range phone. usage: node scripts/perf.mjs [throttle=1]
import { chromium, devices } from '@playwright/test';
const throttle = Number(process.argv[2] || 1);
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const ctx = await browser.newContext(throttle > 1 ? { ...devices['Pixel 7'] } : { viewport: { width: 1280, height: 720 } });
const page = await ctx.newPage();
const cdp = await ctx.newCDPSession(page);
if (throttle > 1) await cdp.send('Emulation.setCPUThrottlingRate', { rate: throttle });
const t0 = Date.now();
await page.goto(process.env.URL || 'http://localhost:4173/kalibrierungsanlage-iii/?e2e=1');
await page.waitForFunction(() => window.__ka3?.mode === 'menu', null, { timeout: 240000 });
const boot = Date.now() - t0;
const t1 = Date.now();
await page.click('#btn-new');
await page.waitForFunction(() => window.__ka3.state.flag('intro.done') && !window.__ka3.scene.inputLocked, null, { timeout: 120000 });
const intro = Date.now() - t1;
// CPU cost of one game update (sorting, lighting rules, overlays), measured in-page.
const update = await page.evaluate(async () => {
  const s = window.__ka3.scene;
  const n = 300;
  const t = performance.now();
  for (let i = 0; i < n; i++) s.update(performance.now(), 16.7);
  return (performance.now() - t) / n;
});
const fps = await page.evaluate(() => new Promise((r) => {
  let frames = 0;
  const t = performance.now();
  const f = () => {
    frames++;
    if (performance.now() - t < 3000) requestAnimationFrame(f);
    else r((frames * 1000) / (performance.now() - t));
  };
  requestAnimationFrame(f);
}));
console.log(JSON.stringify({ throttle, bootMs: boot, introMs: intro, updateMs: +update.toFixed(3), rafFps: +fps.toFixed(1), renderer: (await page.evaluate(() => window.__ka3.debugInfo().renderer)) }));
await browser.close();
