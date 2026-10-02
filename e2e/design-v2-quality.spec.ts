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

test('the temporary /new compatibility URL resolves to the canonical route', async ({page}) => {
  await page.goto('/new/playlists?source=bookmark#library');
  await expect(page).toHaveURL(/\/playlists\?source=bookmark#library$/);
  await expect(page.getByRole('heading', {name: 'Your playlists', exact: true})).toBeVisible();
});

test('the shared shell and representative dense content reflow at every release width', async ({page}) => {
  await page.goto('/playlists');
  await expect(page.getByRole('heading', {name: 'Your playlists', exact: true})).toBeVisible();
  for (const width of widths) {
    await page.setViewportSize({width, height: 900});
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow, `${width}px must not overflow horizontally`).toBeLessThanOrEqual(1);
    await expect(page.locator('app-design-v2-shell')).toHaveCount(1);
  }
});

test('200% text enlargement preserves the primary task and does not create horizontal overflow', async ({page}) => {
  await page.setViewportSize({width: 768, height: 900});
  await page.goto('/playlists');
  await page.evaluate(() => { document.documentElement.style.fontSize = '200%'; });
  await expect(page.getByRole('searchbox', {name: 'Search your playlists'})).toBeVisible();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(1);
});

test('notification and automatic-update sheets restore focus and remain accessible', async ({page}) => {
  await page.goto('/playlists');
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
  await page.goto('/playlists');
  const card = page.locator('.v2-playlist-card').last();
  await expect(card).toBeVisible();
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  const cardBox = await card.boundingBox();
  const navBox = await page.getByRole('navigation', {name: 'Primary navigation'}).boundingBox();
  expect(cardBox).not.toBeNull();
  expect(navBox).not.toBeNull();
  expect(cardBox!.y + cardBox!.height).toBeLessThanOrEqual(navBox!.y);
});

test('populated schedule sheets retain reachable 44px controls at narrow and enlarged-text sizes', async ({page}) => {
  const tasks = ['listening_history', 'stats_short_term', 'stats_medium_term', 'stats_long_term',
    'song_league_playlists', 'shared_playlists'].map(task_key => ({
    task_key, optional_enabled: true, feature_required: task_key.endsWith('playlists'),
    effective_active: true, reasons: ['Required by the features you use'],
    editable: !task_key.endsWith('playlists'), interval_value: 60, interval_unit: 'minutes',
    minimum_interval_minutes: 60, policy_available: true
  }));
  await page.route('**/rest/v1/rpc/get_my_sync_task_status', route => route.fulfill({json: tasks}));
  for (const [width, fontSize] of [[320, '100%'], [768, '200%']] as const) {
    await page.setViewportSize({width, height: 800});
    await page.goto('/playlists');
    await page.evaluate(size => { document.documentElement.style.fontSize = size; }, fontSize);
    const account = page.getByRole('button', {name: 'Open account and data settings'});
    await account.click();
    await page.getByRole('button', {name: 'Automatic updates', exact: true}).click();
    const dialog = page.getByRole('dialog', {name: 'Automatic updates'});
    await expect(dialog.locator('.sync-task-row')).toHaveCount(6);
    await dialog.getByRole('button', {name: /^Listening history/}).click();
    const close = dialog.getByRole('button', {name: 'Close automatic updates'});
    for (const control of [close, dialog.getByRole('spinbutton', {name: 'Every'}), dialog.getByRole('combobox', {name: 'Unit'})]) {
      const box = await control.boundingBox();
      expect(box).not.toBeNull();
      expect(box!.width).toBeGreaterThanOrEqual(44);
      expect(box!.height).toBeGreaterThanOrEqual(44);
    }
    const body = dialog.locator('.settings-sheet-body');
    await body.evaluate(element => { element.scrollTop = element.scrollHeight; });
    const closeBox = await close.boundingBox();
    expect(closeBox!.y).toBeGreaterThanOrEqual(0);
    expect(closeBox!.y + closeBox!.height).toBeLessThanOrEqual(800);
    const hidden = await close.evaluate(element => {
      const box = element.getBoundingClientRect();
      return !element.contains(document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2));
    });
    expect(hidden).toBe(false);
    expect(await dialog.evaluate(element => element.scrollWidth - element.clientWidth)).toBeLessThanOrEqual(1);
    await expectNoBlockingAxeViolations(page);
    await close.press('Enter');
    await expect(dialog).toHaveCount(0);
    await expect(account).toBeFocused();
  }
});
