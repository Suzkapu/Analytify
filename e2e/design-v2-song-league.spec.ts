import {expect, test} from '@playwright/test';
import {expectNoBlockingAxeViolations, mockSpotify, seedAuthenticatedBrowser} from './helpers/authenticated-browser';

test.beforeEach(async ({page}) => {
  await mockSpotify(page);
  await seedAuthenticatedBrowser(page);
});

test('v2 Song League home stays in the v2 shell and keeps rules on demand', async ({page}) => {
  await page.goto('/song-league');
  await expect(page.getByRole('main', {name: 'Song League content'})).toBeVisible();
  await expect(page.getByRole('heading', {name: 'Song League', exact: true})).toBeVisible();
  await expect(page.getByRole('button', {name: 'How Song League works'})).toBeVisible();
  await page.getByRole('button', {name: 'How Song League works'}).click();
  await expect(page.getByRole('dialog', {name: 'How Song League works'})).toBeVisible();
  await expect(page.locator('app-design-v2-shell')).toHaveCount(1);
  await expectNoBlockingAxeViolations(page);
});

test('v2 Song League reflows at 320 CSS pixels without a floating content obstruction', async ({page}) => {
  await page.setViewportSize({width: 320, height: 800});
  await page.goto('/song-league');
  await expect(page.getByRole('heading', {name: 'Song League', exact: true})).toBeVisible();
  await expect(page.locator('.scroll-to-top-btn')).toBeHidden();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(1);
});

test('v2 invite route never falls back to a legacy shell', async ({page}) => {
  await page.goto('/song-league/join/not-a-real-invite');
  await expect(page.locator('app-design-v2-shell')).toHaveCount(1);
  await expect(page.locator('app-header')).toHaveCount(0);
  await expect(page.locator('app-song-league-claim')).toBeVisible();
});
