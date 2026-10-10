import {test, expect} from './fixtures';
import {mockSpotify, seedAuthenticatedBrowser, expectNoBlockingAxeViolations} from './helpers/authenticated-browser';
import {writeFile} from 'node:fs/promises';

for (const motion of ['no-preference', 'reduce'] as const) {
  for (const height of [480, 1000]) {
    test(`Notifications save independently of this device (${motion}, height ${height})`, async ({page}, info) => {
      await page.emulateMedia({reducedMotion: motion}); await mockSpotify(page);
      await page.route('**/rest/v1/users?**', route => route.fulfill({json: null}));
      await page.route('**/rest/v1/rpc/get_public_site_settings', route => route.fulfill({json: {}}));
      await page.route('**/rest/v1/rpc/is_app_admin', route => route.fulfill({json: false}));
      let statsEnabled = false; let failSave = true; let holdSave: (() => void) | undefined;
      const writes: unknown[] = []; const unexpected: string[] = []; const transitionErrors: string[] = []; const expectedSaveFailures: string[] = [];
      page.on('console', message => {
        if (message.location().url.endsWith('/rpc/set_notification_preference') && /server responded with a status of 500/.test(message.text())) expectedSaveFailures.push(message.text());
        else if (message.type() === 'error' || /DOM update timed out|Transition was aborted|TimeoutError/.test(message.text())) transitionErrors.push(message.text());
      });
      page.on('pageerror', error => {transitionErrors.push(error.message);});
      page.on('request', request => {if (request.url().includes('upsert_push_subscription') || request.url().includes('/functions/v1/')) unexpected.push(request.url());});
      await page.route('**/rest/v1/rpc/get_notification_settings', route => route.fulfill({json: [{song_league_enabled: true,
        song_league_song_added_enabled: false, song_league_member: true, stats_access_requests_enabled: statsEnabled,
        device_registered: false, registered_device_count: 0}]}));
      await page.route('**/rest/v1/rpc/set_notification_preference', async route => {
        const body = route.request().postDataJSON(); writes.push(body);
        if (failSave) {failSave = false; return route.fulfill({status: 500, json: {message: 'Preference save failed'}});}
        await new Promise<void>(resolve => {holdSave = resolve;});
        statsEnabled = body.p_enabled; await route.fulfill({json: null});
      });
      await seedAuthenticatedBrowser(page, {cloudIdentity: true}); await page.goto('/new/settings/notifications');
      const panel = page.locator('v2-settings-notifications'); const stats = panel.getByRole('switch', {name: 'Stats access requests'});
      await expect(stats).toBeVisible(); await expect(stats).not.toBeChecked();
      // The dev build intentionally has no enabled service worker: actual unsupported state.
      await expect(panel.getByText('Notifications are unavailable', {exact: true})).toBeVisible();
      await expect(panel.getByRole('button', {name: 'Enable notifications'})).toHaveCount(0);
      await stats.press('Space'); await expect(panel.getByRole('alert')).toHaveText('Preference save failed');
      await expect(stats).not.toBeChecked(); await panel.getByRole('button', {name: 'Retry', exact: true}).click();
      await expect(panel.getByRole('alert')).toHaveCount(0); await stats.press('Space');
      await expect(stats).toBeDisabled(); await expect(stats).not.toBeChecked();
      await expect.poll(() => !!holdSave).toBe(true); holdSave!();
      await expect(stats).toBeChecked(); await expect(stats).toBeEnabled();
      expect(writes).toEqual([{p_category: 'stats_access_requests', p_enabled: true}, {p_category: 'stats_access_requests', p_enabled: true}]);
      await expectNoBlockingAxeViolations(page);
      const geometry = [];
      for (const width of [320, 360, 390, 760, 768, 1024, 1440, 1920]) {
        await page.setViewportSize({width, height}); await stats.scrollIntoViewIfNeeded(); await stats.click({trial: true});
        const sample = await stats.evaluate(element => {
          const box = element.getBoundingClientRect(); const row = element.closest('label')!.getBoundingClientRect();
          const images = [...element.closest('label')!.querySelectorAll('img')].map(image => {
            const bounds = image.getBoundingClientRect(); return {src: image.getAttribute('src'), width: bounds.width, height: bounds.height, loaded: image.complete && image.naturalWidth > 0};
          });
          const allImages = [...element.closest('v2-settings-notifications')!.querySelectorAll('img')].map(image => {const b=image.getBoundingClientRect();return {src:image.getAttribute('src'),width:b.width,height:b.height,loaded:image.complete&&image.naturalWidth>0};});
          return {width: innerWidth, height: innerHeight, scrollWidth: document.documentElement.scrollWidth, allImages,
            target: {width: box.width, height: box.height, right: box.right}, row: {left: row.left, right: row.right}, images};
        });
        expect(sample.scrollWidth).toBeLessThanOrEqual(width); expect(sample.target).toEqual({width: 48, height: 56, right: expect.any(Number)});
        expect(sample.row.left).toBeGreaterThanOrEqual(0); expect(sample.row.right).toBeLessThanOrEqual(width);
        expect(sample.images.map(image => [image.width, image.height, image.loaded])).toEqual([[20, 20, true], [48, 24, true]]);
        expect(sample.allImages).toHaveLength(7);
        for (const image of sample.allImages) {
          const size=image.src?.includes('switch-')?[48,24]:[20,20];
          expect([image.width,image.height,image.loaded]).toEqual([...size,true]);
        }
        geometry.push(sample);
      }
      await page.setViewportSize({width: info.project.name === 'mobile' ? 390 : 1440, height: 900});
      await page.evaluate(async () => {await document.fonts.ready;});
      await panel.screenshot({path: info.outputPath('notifications.png'), animations: 'disabled'});
      await page.screenshot({path: info.outputPath('notifications-page.png'), fullPage: true, animations: 'disabled'});
      await panel.getByRole('link', {name: 'How to install app'}).press('Enter');
      await expect(page).toHaveURL(/\/new\/settings\/install$/); const guide = page.locator('v2-settings-install');
      await expect(guide.locator('article')).toHaveCount(5); await expect(guide.getByRole('heading', {level: 1})).toHaveText('Install Analytify');
      await expectNoBlockingAxeViolations(page); await guide.screenshot({path: info.outputPath('install.png')});
      await page.screenshot({path: info.outputPath('install-page.png'), fullPage: true, animations: 'disabled'});
      await guide.getByRole('button', {name: 'Back', exact: true}).press('Enter');
      await expect(page).toHaveURL(/\/new\/settings\/notifications$/); await expect(stats).toBeChecked();
      expect(unexpected).toEqual([]);
      expect(transitionErrors).toEqual([]); expect(expectedSaveFailures.length).toBeLessThanOrEqual(1);
      await writeFile(info.outputPath('notification-workflow.json'), JSON.stringify({motion, height, geometry, writes, unexpected, transitionErrors, expectedSaveFailures}, null, 2));
    });
  }
}
