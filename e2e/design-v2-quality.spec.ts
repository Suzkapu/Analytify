import {expect, test} from '@playwright/test';
import {
  expectNoBlockingAxeViolations,
  mockSpotify,
  seedAuthenticatedBrowser
} from './helpers/authenticated-browser';

const widths = [320, 375, 430, 500, 768, 1024, 1440] as const;

test.beforeEach(async ({page}) => {
  await mockSpotify(page);
  await seedAuthenticatedBrowser(page, {cloudIdentity: true});
});

test('the shared shell and representative dense content reflow at every release width', async ({page}) => {
  for (const width of widths) {
    await page.setViewportSize({width, height: 900});
    await page.goto('/new/playlists');
    await expect(page.getByRole('heading', {name: 'Your playlists', exact: true})).toBeVisible();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow, `${width}px must not overflow horizontally`).toBeLessThanOrEqual(1);
    await expect(page.locator('app-design-v2-shell')).toHaveCount(1);
  }
});

test('200% text enlargement preserves the primary task and does not create horizontal overflow', async ({page}) => {
  await page.setViewportSize({width: 768, height: 900});
  await page.goto('/new/playlists');
  await page.evaluate(() => { document.documentElement.style.fontSize = '200%'; });
  await expect(page.getByRole('searchbox', {name: 'Search your playlists'})).toBeVisible();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(1);
});

test('notification and automatic-update sheets restore focus and remain accessible', async ({page}) => {
  await page.goto('/new/playlists');
  const account = page.getByRole('button', {name: 'Open account and data settings'});
  await account.click();

  const notifications = page.getByRole('button', {name: 'Notifications'});
  await notifications.focus();
  await notifications.press('Enter');
  await expect(page.getByRole('dialog', {name: 'Notifications'})).toBeVisible();
  await expectNoBlockingAxeViolations(page);
  await page.keyboard.press('Escape');
  await expect(account).toBeFocused();

  await account.click();
  const automaticUpdates = page.getByRole('button', {name: 'Automatic updates'});
  await automaticUpdates.focus();
  await automaticUpdates.press('Enter');
  await expect(page.getByRole('dialog', {name: 'Automatic updates'})).toBeVisible();
  await expectNoBlockingAxeViolations(page);
  await page.keyboard.press('Escape');
  await expect(account).toBeFocused();
});

test('mobile fixed navigation does not obscure the last task region', async ({page}) => {
  await page.setViewportSize({width: 320, height: 640});
  await page.goto('/new/playlists');
  const card = page.locator('.v2-playlist-card').last();
  await expect(card).toBeVisible();
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  const cardBox = await card.boundingBox();
  const navBox = await page.getByRole('navigation', {name: 'Primary navigation'}).boundingBox();
  expect(cardBox).not.toBeNull();
  expect(navBox).not.toBeNull();
  expect(cardBox!.y + cardBox!.height).toBeLessThanOrEqual(navBox!.y);
});
