import {test, expect} from './fixtures';
import {mockSpotify, seedAuthenticatedBrowser, expectNoBlockingAxeViolations} from './helpers/authenticated-browser';
import {writeFile} from 'node:fs/promises';

for (const cloudIdentity of [false, true]) for (const motion of ['no-preference', 'reduce'] as const) {
  test(`account retains settings and excludes blocked management (cloud=${cloudIdentity}, ${motion})`, async ({page}, info) => {
    await page.emulateMedia({reducedMotion: motion});
    await mockSpotify(page);
    await seedAuthenticatedBrowser(page, {cloudIdentity});
    await page.goto('/new/stats');
    await expect(page.getByRole('status', {name: 'Loading Analytify', exact: true})).toHaveCount(0);
    await expect(page.locator('.v2-ranking-list strong')).toHaveText('Test Song');
    const trigger = page.getByRole('button', {name: 'Open account and data settings', exact: true});
    await trigger.press('Enter');
    const menu = page.locator('.v2-account-dialog');
    await expect(menu).toBeVisible();
    await expect(menu.getByRole('button', {name: 'Close account settings', exact: true})).toBeFocused();
    await page.evaluate(() => document.fonts.ready);
    await expect(menu.getByRole('button', {name: 'Blocked users', exact: true})).toHaveCount(0);
    await expect(menu.getByRole('button', {name: 'Notifications', exact: true})).toBeVisible();
    await expect(menu.getByRole('button', {name: 'Automatic updates', exact: true})).toHaveCount(cloudIdentity ? 1 : 0);
    await expect(menu.getByRole('switch', {name: 'Cloud Backup', exact: true})).toBeVisible();
    await expect(menu.getByRole('link', {name: 'Manage Spotify access', exact: true})).toHaveAttribute('href', 'https://www.spotify.com/account/apps/');
    await expect(menu.getByRole('link', {name: 'Privacy notice', exact: true})).toHaveAttribute('href', '/new/legal#privacy');
    await expect(menu.getByRole('button', {name: 'Log out', exact: true})).toBeVisible();
    const geometry = [];
    for (const width of [320, 390, 1440]) for (const height of [480, 1080]) {
      await page.setViewportSize({width, height});
      const clear = menu.getByRole('button', {name: 'Clear data', exact: true});
      let sample!: {width: number; height: number; overflow: number; left: number; right: number; top: number; bottom: number; dialogLeft: number; dialogRight: number; dialogTop: number; dialogBottom: number; reachable: boolean};
      await expect(async () => {
      await clear.scrollIntoViewIfNeeded();
      sample = await clear.evaluate(button => {
        const rect = button.getBoundingClientRect(), dialog = button.closest('[role="dialog"]')!.getBoundingClientRect();
        return {width: innerWidth, height: innerHeight, overflow: document.documentElement.scrollWidth - innerWidth,
          left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom,
          dialogLeft: dialog.left, dialogRight: dialog.right, dialogTop: dialog.top, dialogBottom: dialog.bottom,
          reachable: document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2)?.closest('button') === button};
      });
      expect(sample.overflow).toBe(0);
      expect(sample.dialogLeft).toBeGreaterThanOrEqual(0); expect(sample.dialogRight).toBeLessThanOrEqual(width);
      expect(sample.dialogTop).toBeGreaterThanOrEqual(0); expect(sample.dialogBottom).toBeLessThanOrEqual(height);
      expect(sample.top).toBeGreaterThanOrEqual(sample.dialogTop); expect(sample.bottom).toBeLessThanOrEqual(sample.dialogBottom);
      expect(sample.reachable).toBe(true);
      }).toPass({timeout: 5000});
      geometry.push(sample);
      if (height === 480) await menu.screenshot({path: info.outputPath(`account-${width}.png`)});
    }
    await expectNoBlockingAxeViolations(page);
    await menu.getByRole('button', {name: 'Close account settings', exact: true}).focus();
    await page.keyboard.press('Escape'); await expect(menu).toHaveCount(0); await expect(trigger).toBeFocused();
    await trigger.press('Enter');
    await menu.getByRole('button', {name: 'Notifications', exact: true}).press('Enter');
    const notifications = page.getByRole('dialog', {name: 'Notifications', exact: true});
    await expect(notifications).toBeVisible(); await expect(menu).toHaveCount(0);
    await expect(notifications.getByRole('button', {name: 'Close notification settings', exact: true})).toBeFocused();
    await page.keyboard.press('Escape'); await expect(notifications).toHaveCount(0);
    if (cloudIdentity) {
      await trigger.press('Enter');
      await menu.getByRole('button', {name: 'Automatic updates', exact: true}).press('Enter');
      const updates = page.getByRole('dialog', {name: 'Automatic updates', exact: true});
      await expect(updates).toBeVisible(); await expect(menu).toHaveCount(0);
      await expect(updates.getByRole('button', {name: 'Close automatic updates', exact: true})).toBeFocused();
      await page.keyboard.press('Escape'); await expect(updates).toHaveCount(0);
    }
    await writeFile(info.outputPath('account-geometry.json'), JSON.stringify(geometry, null, 2));
  });
}
