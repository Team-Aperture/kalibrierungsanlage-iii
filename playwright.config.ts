import { defineConfig, devices } from '@playwright/test';

// End-to-end tests run against the real production build served by `vite preview`.
const executablePath = process.env.PW_CHROMIUM_PATH || undefined;

export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 180_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: 'http://localhost:4173/kalibrierungsanlage-iii/',
    trace: 'off',
    launchOptions: { executablePath, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] },
  },
  webServer: {
    command: 'npx vite build && npx vite preview --port 4173 --strictPort',
    url: 'http://localhost:4173/kalibrierungsanlage-iii/',
    reuseExistingServer: false,
    timeout: 120_000,
  },
  projects: [
    { name: 'desktop', testMatch: /(desktop|all)\.spec\.ts/, use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 720 } } },
    { name: 'laptop', testMatch: /all\.spec\.ts/, use: { ...devices['Desktop Chrome'], viewport: { width: 1366, height: 768 } } },
    { name: 'phone-portrait', testMatch: /(mobile|all)\.spec\.ts/, use: { ...devices['Pixel 7'] } },
    { name: 'phone-landscape', testMatch: /(mobile|all)\.spec\.ts/, use: { ...devices['Pixel 7 landscape'] } },
  ],
});
