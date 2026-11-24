import { defineConfig, devices } from '@playwright/test';

/**
 * E2E against the real API + web app and the development database seeded with
 * SEED_DEV_USERS=true. Locally, start them yourself or let webServer do it.
 */
export default defineConfig({
  testDir: './e2e',
  timeout: 90_000,
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: { baseURL: process.env.E2E_BASE_URL ?? 'http://localhost:3000', trace: 'retain-on-failure' },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
    {
      name: 'mobile-390',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 390, height: 844 },
        isMobile: true,
        hasTouch: true,
      },
    },
  ],
  webServer: [
    {
      command: 'pnpm --filter @mzn/api start',
      url: 'http://localhost:4000/health',
      reuseExistingServer: true,
      timeout: 120_000,
    },
    {
      command: 'pnpm --filter @mzn/web start',
      url: 'http://localhost:3000/healthz',
      reuseExistingServer: true,
      timeout: 120_000,
    },
  ],
});
