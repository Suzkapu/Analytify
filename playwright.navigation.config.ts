import {defineConfig} from '@playwright/test';
import isolated from './playwright.friends.config';

export default defineConfig({...isolated, testMatch: 'design-v2-navigation.spec.ts',
  outputDir: 'docs/testing-evidence/design-v2/navigation-browser-artifacts'});
