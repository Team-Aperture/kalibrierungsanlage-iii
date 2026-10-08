// Dev helper: screenshot a clipped region of the page.
// usage: node scripts/shot-clip.mjs <url> <out.png> x y w h [waitMs] [vw] [vh]
import { chromium } from '@playwright/test';
const [url, out, x, y, w, h, wait = '3000', vw = '1600', vh = '1200'] = process.argv.slice(2);
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: +vw, height: +vh } });
await page.goto(url, { waitUntil: 'load' });
await page.waitForTimeout(+wait);
await page.screenshot({ path: out, clip: { x: +x, y: +y, width: +w, height: +h }, fullPage: true });
await browser.close();
