import {defineConfig} from '@playwright/test';
import friends from '../../../playwright.friends.config';

// Diagnostic only: use full Chromium modern headless with its default renderer.
// No font flags, production styles, assertions or reviewed baselines change.
export default defineConfig({
  ...friends,
  testDir: '../../../e2e',
  projects: friends.projects?.map(project => ({...project,
    use: {...project.use, ...(['desktop', 'mobile'].includes(project.name ?? '') ? {channel: 'chromium'} : {})}
  }))
});
