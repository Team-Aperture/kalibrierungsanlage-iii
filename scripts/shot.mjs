// Dev helper: screenshot a URL with the preinstalled Chromium.
// usage: node scripts/shot.mjs <url> <out.png> [width] [height] [fullPage] [waitMs]
import { chromium } from '@playwright/test';
const [url, out, w = '1400', h = '900', full = '1', wait = '1500'] = process.argv.slice(2);
const browser = await chromium.launch({ executablePath: process.env.PW_CHROMIUM_PATH || undefined, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: +w, height: +h } });
const logs = [];
page.on('console', (m) => logs.push(`[${m.type()}] ${m.text()}`));
page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}`));
await page.goto(url, { waitUntil: 'load' });
await page.waitForTimeout(+wait);
await page.screenshot({ path: out, fullPage: full === '1' });
console.log(logs.join('\n'));
await browser.close();
