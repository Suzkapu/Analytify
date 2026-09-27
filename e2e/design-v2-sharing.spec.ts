import {expect, test} from '@playwright/test';
import {
  expectNoBlockingAxeViolations,
  mockSpotify,
  seedAuthenticatedBrowser
} from './helpers/authenticated-browser';

test.beforeEach(async ({page}) => {
  await mockSpotify(page);
  await seedAuthenticatedBrowser(page);
});

test('v2 Private Sharing keeps Playlists and Stats as linkable native navigation', async ({page}) => {
  await page.goto('/new/shared-playlists?tab=playlists');
  await expect(page.getByRole('main', {name: 'Private Sharing content'})).toBeVisible();
  await expect(page.getByRole('heading', {name: 'Private sharing'})).toBeVisible();

  const localNavigation = page.getByRole('navigation', {name: 'Private sharing views'});
  const playlists = localNavigation.getByRole('link', {name: 'Playlists', exact: true});
  const stats = localNavigation.getByRole('link', {name: 'Stats', exact: true});
  await expect(playlists).toHaveAttribute('aria-current', 'page');
  await stats.click();
  await expect(page).toHaveURL(/\/new\/shared-playlists\?tab=stats$/);
  await expect(stats).toHaveAttribute('aria-current', 'page');

  await page.reload();
  await expect(page.getByRole('navigation', {name: 'Private sharing views'})
    .getByRole('link', {name: 'Stats', exact: true})).toHaveAttribute('aria-current', 'page');
  await expect(page.locator('app-design-v2-shell')).toHaveCount(1);
  await expectNoBlockingAxeViolations(page);
});

test('v2 Private Sharing reflows at 320 CSS pixels', async ({page}) => {
  await page.setViewportSize({width: 320, height: 800});
  await page.goto('/new/shared-playlists?tab=playlists');
  await expect(page.getByRole('heading', {name: 'Private sharing'})).toBeVisible();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(1);
});
