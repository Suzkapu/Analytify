import {defineConfig, devices} from '@playwright/test';

const isolatedBuildSpecs = ['design-v2-friends.spec.ts', 'design-v2-navigation.spec.ts'];

export default defineConfig({
  testDir: './e2e',
  // These suites require the loopback-only build and run separately in preview CI.
  testIgnore: isolatedBuildSpecs,
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
    {name: 'firefox-stats', testIgnore: [...isolatedBuildSpecs, 'design-v2-chromium-performance.spec.ts'], use: {...devices['Desktop Firefox']}},
    {name: 'webkit-stats', testIgnore: [...isolatedBuildSpecs, 'design-v2-chromium-performance.spec.ts'], use: {
      ...devices['Desktop Safari'],
      ...(process.env['ANALYTIFY_WEBKIT_EXECUTABLE']
        ? {launchOptions: {executablePath: process.env['ANALYTIFY_WEBKIT_EXECUTABLE']}}
        : {})
    }}
  ],
  webServer: {
    command: 'npm start -- --host 127.0.0.1 --port 4200 --watch=false --hmr=false --live-reload=false',
    url: 'http://127.0.0.1:4200/new/login',
    reuseExistingServer: !process.env['CI'],
    timeout: 120_000
  }
});
