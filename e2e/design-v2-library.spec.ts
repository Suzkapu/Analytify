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

test('v2 playlists uses stable controls and preserves v2 navigation', async ({page}) => {
  await page.goto('/new/playlists');
  await expect(page.getByRole('heading', {name: 'Your playlists', exact: true})).toBeVisible();
  await expect(page.getByRole('searchbox', {name: 'Search playlists'})).toBeVisible({timeout: 15_000});
  await expect(page.getByRole('button', {name: /Song count: default order/})).toBeVisible();

  const playlistCard = page.locator('.item-card').filter({hasText: 'Test Playlist'});
  const open = playlistCard.locator('a[href="/new/songs/playlist-1"]');
  const analyze = playlistCard.locator('a[href="/new/analysis/playlist-1"]');
  await expect(open).toHaveAttribute('href', '/new/songs/playlist-1');
  await expect(analyze).toHaveAttribute('href', '/new/analysis/playlist-1');
  await open.click();
  await expect(page).toHaveURL(/\/new\/songs\/playlist-1$/);
  await expect(page.getByRole('heading', {name: 'Playlist contents'})).toBeVisible();
  await expect(page.locator('main')).toHaveCount(1);
  await expectNoBlockingAxeViolations(page);
});

test('v2 library remains reflow-safe at 320 CSS pixels', async ({page}) => {
  await page.setViewportSize({width: 320, height: 800});
  await page.goto('/new/playlists');
  const playlistCard = page.locator('.item-card').filter({hasText: 'Test Playlist'});
  await expect(playlistCard.locator('a[href="/new/songs/playlist-1"]')).toBeVisible({timeout: 15_000});
  await expect(playlistCard.locator('a[href="/new/analysis/playlist-1"]')).toBeVisible();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(1);
  await expectNoBlockingAxeViolations(page);
});

test('every v2 library child route retains the shared shell', async ({page}) => {
  for (const [path, heading] of [
    ['/new/songs/playlist-1', 'Playlist contents'],
    ['/new/artistDetails/artist-1', 'Artist details'],
    ['/new/analysis/playlist-1', 'Playlist analysis']
  ] as const) {
    await page.goto(path);
    await expect(page.getByRole('heading', {name: heading, exact: true}).first()).toBeVisible();
    await expect(page.locator('app-design-v2-shell')).toHaveCount(1);
    await expect(page.locator('main')).toHaveCount(1);
  }
});

test('account hub is keyboard reachable on desktop and mobile', async ({page}) => {
  await page.goto('/new/playlists');
  const account = page.getByRole('button', {name: 'Open account and data settings'});
  await account.focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('dialog', {name: /Browser test user/})).toBeVisible();
  await expect(page.getByRole('button', {name: 'Notifications'})).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog', {name: /Browser test user/})).toBeHidden();

  await page.setViewportSize({width: 320, height: 800});
  await account.click();
  await expect(page.getByRole('dialog', {name: /Browser test user/})).toBeVisible();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(1);
  await expectNoBlockingAxeViolations(page);
});

test('local data clear uses a consequence-first confirmation flow', async ({page}) => {
  await page.goto('/new/playlists');
  await page.getByRole('button', {name: 'Open account and data settings'}).click();
  await page.getByRole('button', {name: 'Clear data'}).click();
  await expect(page.getByRole('alertdialog', {name: 'What would you like to clear?'})).toBeVisible();
  await page.getByRole('button', {name: /Clear this browser and log out/}).click();
  await expect(page.getByRole('alertdialog', {name: 'Clear this browser and log out?'})).toBeVisible();
  await page.getByRole('button', {name: 'Clear and log out'}).click();
  await expect(page).toHaveURL(/\/new\/login$/);
});
