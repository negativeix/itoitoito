import { defineConfig } from '@playwright/test'

// Browser E2E against local Supabase only (npx supabase start). Playwright starts its own dev server
// in "e2e" mode, which reads .env.e2e.local, so a production .env.local is never touched by tests.
export default defineConfig({
  webServer: {
    command: 'npx vite --mode e2e --port 5174 --strictPort',
    url: 'http://localhost:5174',
    reuseExistingServer: false,
    timeout: 60_000,
  },
  testDir: 'e2e',
  timeout: 120_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  outputDir: 'e2e/.results',
  use: {
    baseURL: 'http://localhost:5174',
    channel: 'chrome',
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
    locale: 'th-TH',
    trace: 'retain-on-failure',
  },
})
