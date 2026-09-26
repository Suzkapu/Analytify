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

test('v2 Stats exposes labeled independent controls and keyboard category tabs', async ({page}) => {
  await page.goto('/new/stats');
  await expect(page.getByRole('main', {name: 'Your Top Listening content'})).toBeVisible();
  await expect(page.getByRole('group', {name: 'Ranking period'})).toBeVisible();

  const songs = page.getByRole('tab', {name: 'Songs'});
  await expect(songs).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByRole('searchbox', {name: 'Search songs or artists'})).toBeVisible();
  await songs.press('ArrowRight');
  await expect(page.getByRole('tab', {name: 'Artists'})).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByRole('searchbox', {name: 'Search artists'})).toBeVisible();

  const historical = page.locator('.stats-past-toggle');
  await expect(historical).toHaveAttribute('aria-pressed', 'false');
  await historical.click();
  await expect(historical).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('app-design-v2-shell')).toHaveCount(1);
  await expectNoBlockingAxeViolations(page);
});

test('v2 Recently Played groups dates without chart-like position numbers', async ({page}) => {
  await page.goto('/new/history');
  await expect(page.getByRole('main', {name: 'Recently Played content'})).toBeVisible();
  await expect(page.getByRole('heading', {name: 'Today'})).toBeVisible({timeout: 15_000});
  await expect(page.getByRole('heading', {name: 'Yesterday'})).toBeVisible();
  await expect(page.getByText('Played today')).toBeVisible();
  const chronologyLabels = await page.locator('.history-index').allTextContents();
  expect(chronologyLabels.every(label => !label.includes('#'))).toBe(true);
  await expect(page.locator('time[datetime]')).toHaveCount(2);
  await expect(page.locator('app-design-v2-shell')).toHaveCount(1);
  await expectNoBlockingAxeViolations(page);
});

test('v2 Insights reflows at 320 CSS pixels', async ({page}) => {
  await page.setViewportSize({width: 320, height: 800});
  for (const path of ['/new/stats', '/new/history']) {
    await page.goto(path);
    await expect(page.locator('.stats-dashboard-container')).toBeVisible({timeout: 15_000});
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow, `${path} should not overflow horizontally`).toBeLessThanOrEqual(1);
  }
});
