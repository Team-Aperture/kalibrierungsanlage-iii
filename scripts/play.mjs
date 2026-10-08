// Dev helper: drive the game with a small script of steps and take screenshots.
// usage: node scripts/play.mjs <out-prefix> [w] [h] [mobile] -- steps as JSON in STEPS env
import { chromium, devices } from '@playwright/test';
const [prefix, w = '1280', h = '720', mobile = ''] = process.argv.slice(2);
const steps = JSON.parse(process.env.STEPS || '[]');
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'] });
const ctxOpts = mobile ? { ...devices[mobile] } : { viewport: { width: +w, height: +h } };
const context = await browser.newContext(ctxOpts);
const page = await context.newPage();
const logs = [];
page.on('console', (m) => { if (!m.text().includes('[vite]')) logs.push(`[${m.type()}] ${m.text()}`); });
page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}\n${e.stack}`));
const base = process.env.URL || 'http://localhost:5173/?e2e=1';
await page.goto(base, { waitUntil: 'load' });
let n = 0;
for (const s of steps) {
  if (s.wait) await page.waitForTimeout(s.wait);
  if (s.click) await page.click(s.click);
  if (s.key) await page.keyboard.press(s.key);
  if (s.down) await page.keyboard.down(s.down);
  if (s.up) await page.keyboard.up(s.up);
  if (s.mouse) await page.mouse.click(s.mouse[0], s.mouse[1], s.button ? { button: s.button } : undefined);
  if (s.tap) await page.touchscreen.tap(s.tap[0], s.tap[1]);
  if (s.eval) { const r = await page.evaluate(s.eval); if (r !== undefined) logs.push(`[eval] ${JSON.stringify(r)}`); }
  if (s.shot) await page.screenshot({ path: `${prefix}-${String(n++).padStart(2, '0')}-${s.shot}.png` });
}
console.log(logs.join('\n'));
await browser.close();
