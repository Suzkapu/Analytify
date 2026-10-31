import {test, expect} from './fixtures';
import type {Request} from '@playwright/test';
import {mockSpotify, seedAuthenticatedBrowser, expectNoBlockingAxeViolations} from './helpers/authenticated-browser';
import {writeFile} from 'node:fs/promises';

for (const motion of ['no-preference', 'reduce'] as const) {
  test(`logout cancels pending backup status before reaching login (${motion})`, async ({page}, info) => {
    await page.emulateMedia({reducedMotion: motion}); await mockSpotify(page);
    let old: Request | undefined, cancelled = false, replySettled = false;
    let release!: () => void, completed!: () => void;
    const held = new Promise<void>(resolve => {release = resolve;});
    const completion = new Promise<void>(resolve => {completed = resolve;});
    page.on('requestfailed', request => {if (request === old) cancelled = true;});
    await page.route('**/rest/v1/users?**', async route => {
      const url = new URL(route.request().url());
      if (route.request().method() !== 'GET') return route.abort('blockedbyclient');
      if (!old && url.searchParams.get('select')?.includes('backup_active')) {
        old = route.request(); await held;
        try {await route.fulfill({json: {backup_active: true, last_synced_at: '2026-10-09T10:00:00Z'}});}
        finally {replySettled = true; completed();}
      } else await route.fulfill({json: null});
    });
    await seedAuthenticatedBrowser(page, {cloudIdentity: true}); await page.goto('/settings/account');
    await expect.poll(() => Boolean(old)).toBe(true);
    await page.getByRole('button', {name: 'Log out', exact: true}).press('Enter');
    // The held reply is released only after logout reaches login. A lifecycle
    // drain that still depends on the old response therefore cannot pass.
    await expect.poll(() => cancelled).toBe(true);
    await expect(page).toHaveURL(/\/login$/);
    await expect(page.locator('app-login-page')).toBeVisible();
    release(); await completion;
    const obsoleteStatus = await page.evaluate(async () => new Promise<unknown[]>((resolve, reject) => {
      const request = indexedDB.open('AnalytifyDB', 4);
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const db = request.result; const transaction = db.transaction('appData', 'readonly');
        const store = transaction.objectStore('appData'); const values: unknown[] = [];
        for (const key of ['de111111-1111-4111-8111-111111111111_backup_active', 'de111111-1111-4111-8111-111111111111_last_synced_at']) {
          const read = store.get(key); read.onsuccess = () => values.push(read.result ?? null);
        }
        transaction.oncomplete = () => {db.close(); resolve(values);};
        transaction.onerror = () => reject(transaction.error);
      };
    }));
    expect(obsoleteStatus).toEqual([null, null]);
    await expectNoBlockingAxeViolations(page);
    await page.screenshot({path: info.outputPath('cancelled-status-login.png')});
    await writeFile(info.outputPath('status-cancellation.json'), JSON.stringify({motion, cancelled, replySettled, obsoleteStatus, finalPath: new URL(page.url()).pathname}, null, 2));
  });
}
