import {defineConfig} from '@playwright/test';
import friends from '../../../playwright.friends.config';

// Diagnostic only: isolate headless glyph-advance quantization. Production and
// canonical assertions remain unchanged; reviewed baselines are not updated.
export default defineConfig({
  ...friends,
  testDir: '../../../e2e',
  projects: friends.projects?.map(project => ({...project,
    use: {...project.use, ...(['desktop', 'mobile'].includes(project.name ?? '') ? {
      launchOptions: {...project.use?.launchOptions, args: [...(project.use?.launchOptions?.args ?? []), '--font-render-hinting=slight']}
    } : {})}
  }))
});
