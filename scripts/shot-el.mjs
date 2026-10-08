// Dev helper: screenshot the n-th element matching a selector.
// usage: node scripts/shot-el.mjs <url> <out.png> <selector> [index] [waitMs] [w] [h]
import { chromium } from '@playwright/test';
const [url, out, sel, idx = '0', wait = '3000', w = '1600', h = '1000'] = process.argv.slice(2);
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: +w, height: +h } });
const logs = [];
page.on('console', (m) => logs.push(`[${m.type()}] ${m.text()}`));
page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}`));
await page.goto(url, { waitUntil: 'load' });
await page.waitForTimeout(+wait);
await page.locator(sel).nth(+idx).screenshot({ path: out });
console.log(logs.filter((l) => !l.includes('[vite]')).join('\n'));
await browser.close();
