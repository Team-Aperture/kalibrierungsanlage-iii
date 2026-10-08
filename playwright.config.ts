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
    command: 'npm run preview',
    url: 'http://localhost:4173/kalibrierungsanlage-iii/',
    reuseExistingServer: true,
    timeout: 60_000,
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 720 } } },
    { name: 'laptop', use: { ...devices['Desktop Chrome'], viewport: { width: 1366, height: 768 } } },
    { name: 'phone-portrait', use: { ...devices['Pixel 7'] } },
    { name: 'phone-landscape', use: { ...devices['Pixel 7 landscape'] } },
  ],
});
