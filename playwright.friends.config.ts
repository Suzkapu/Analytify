import {defineConfig} from '@playwright/test';
import base from './playwright.config';

export default defineConfig({
  ...base,
  testMatch: 'design-v2-friends.spec.ts',
  testIgnore: [],
  workers: 1,
  // Full Chromium's modern headless renderer preserves the bundled font's
  // fractional advances. Legacy headless-shell full hinting changes wrapping.
  // See docs/testing-evidence/design-v2/friends-font-quantization-result.json.
  projects: base.projects?.map(project => ({...project, testIgnore: [],
    use: {...project.use, ...(['desktop', 'mobile'].includes(project.name ?? '') ? {channel: 'chromium'} : {})}
  })),
  outputDir: 'docs/testing-evidence/design-v2/friends-browser-artifacts',
  use: {...base.use, baseURL: 'http://127.0.0.1:4214/'},
  webServer: {
    command: 'npm start -- --configuration browser-testing --host 127.0.0.1 --port 4214 --watch=false --hmr=false --live-reload=false',
    url: 'http://127.0.0.1:4214/login',
    reuseExistingServer: false,
    timeout: 120_000
  }
});
