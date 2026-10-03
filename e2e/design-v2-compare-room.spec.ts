import {expect, test} from '@playwright/test';
import {expectNoBlockingAxeViolations, mockSpotify, seedAuthenticatedBrowser} from './helpers/authenticated-browser';

test.beforeEach(async ({page}) => {
  await mockSpotify(page);
  await seedAuthenticatedBrowser(page);
});

test('v2 Compare Room presents the compact three-step host task', async ({page}) => {
  await page.goto('/new/compare-room');
  await expect(page.getByRole('main', {name: 'Compare Room content'})).toBeVisible();
  await expect(page.getByLabel(/Compare progress\. Step [123] of 3/)).toBeVisible();
  await expect(page.getByText('Guest logins are not saved')).toBeVisible();
  await expect(page.getByText('Join myself')).toHaveCount(0);
  await expect(page.locator('app-design-v2-shell')).toHaveCount(1);
  await expectNoBlockingAxeViolations(page);
});

test('v2 Compare Room prioritizes progress and participant actions at 320 CSS pixels', async ({page}) => {
  await page.setViewportSize({width: 320, height: 800});
  await page.goto('/new/compare-room');
  await expect(page.getByLabel(/Compare progress\. Step [123] of 3/)).toBeVisible();
  await expect(page.getByText('Guest logins are not saved')).toBeVisible();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(1);
});

test('v2 join route stays inside the v2 shell and exposes a text invite flow', async ({page}) => {
  await page.goto('/new/compare-room/join/room-1#invitation=invite&secret=secret');
  await expect(page.getByRole('heading', {name: 'Bring your playlists'})).toBeVisible();
  await expect(page.getByLabel('Compare progress. Step 1 of 3')).toBeVisible();
  await expect(page.getByRole('button', {name: 'Continue with Spotify'})).toBeVisible();
  await expect(page.locator('app-design-v2-shell')).toHaveCount(1);
});
