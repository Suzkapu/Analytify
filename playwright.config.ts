import {defineConfig, devices} from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env['CI'],
  retries: 0,
  workers: 2,
  reporter: process.env['CI'] ? [['html', {open: 'never'}], ['github']] : 'list',
  use: {
    baseURL: 'http://127.0.0.1:4200/new/',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure'
  },
  projects: [
    {name: 'desktop', use: {...devices['Desktop Chrome']}},
    {name: 'mobile', use: {...devices['Pixel 7']}},
    {name: 'firefox-stats', testIgnore: 'design-v2-chromium-performance.spec.ts', use: {...devices['Desktop Firefox']}},
    {name: 'webkit-stats', testIgnore: 'design-v2-chromium-performance.spec.ts', use: {...devices['Desktop Safari']}}
  ],
  webServer: {
    command: 'npm start -- --host 127.0.0.1 --port 4200',
    url: 'http://127.0.0.1:4200/new/login',
    reuseExistingServer: !process.env['CI'],
    timeout: 120_000
  }
});
