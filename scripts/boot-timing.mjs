// Dev helper: measure boot (texture bake) time over repeated reloads.
import { chromium } from '@playwright/test';
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
page.on('pageerror', (e) => console.log('ERR', e.message));
for (let i = 0; i < 4; i++) {
  const t = Date.now();
  if (i === 0) await page.goto('http://localhost:4173/kalibrierungsanlage-iii/?e2e=1');
  else await page.reload();
  try {
    await page.waitForFunction(() => window.__ka3?.mode === 'menu', null, { timeout: 120000 });
    console.log('boot', i, Date.now() - t, 'ms');
  } catch {
    console.log('boot', i, 'TIMEOUT', await page.evaluate(() => document.getElementById('loader')?.textContent));
  }
}
await browser.close();
