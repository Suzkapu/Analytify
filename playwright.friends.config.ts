import {defineConfig} from '@playwright/test';
import base from './playwright.config';

export default defineConfig({
  ...base,
  testMatch: 'design-v2-friends.spec.ts',
  testIgnore: [],
  workers: 1,
  projects: base.projects?.map(project => ({...project, testIgnore: []})),
  outputDir: 'docs/testing-evidence/design-v2/friends-browser-artifacts',
  use: {...base.use, baseURL: 'http://127.0.0.1:4214/new/'},
  webServer: {
    command: 'npm start -- --configuration browser-testing --host 127.0.0.1 --port 4214 --watch=false --hmr=false --live-reload=false',
    url: 'http://127.0.0.1:4214/new/login',
    reuseExistingServer: false,
    timeout: 120_000
  }
});
