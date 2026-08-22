import { defineConfig, devices } from '@playwright/test';

/** @see https://playwright.dev/docs/test-configuration */
export default defineConfig({
  testDir: './e2e-tests',
  // Slow dev machines: the dashboard login flow mounts lazily, so allow
  // more than the 30s default per test, and give expect() retries time
  // to see the lazily-mounted dashboard instead of failing at 5s.
  timeout: 120000,
  // This dev machine is very slow (cold esbuild + lazy dashboard mount can
  // take 30–40s), so expect() needs a generous timeout to avoid flaky
  // failures on perfectly healthy code.
  expect: { timeout: 45000 },
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: [['html', { outputFolder: 'playwright-report' }], ['list']],

  // Auto-start the Vite dev server before E2E tests
  // NOTE: vite.config.js pins the dev server to port 5174 (strictPort),
  // so Playwright must wait on 5174 — NOT the default 5173.
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:5174',
    reuseExistingServer: !process.env.CI,
    timeout: 60000,
  },
  
  use: {
    baseURL: 'http://localhost:5174',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});
