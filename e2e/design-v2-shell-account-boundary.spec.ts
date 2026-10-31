import {test, expect} from './fixtures';
import {mockSpotify, seedAuthenticatedBrowser, expectNoBlockingAxeViolations} from './helpers/authenticated-browser';
import {writeFile} from 'node:fs/promises';
import type {Page} from '@playwright/test';

async function openSettings(page: Page) {
  if ((page.viewportSize()?.width ?? 0) <= 760) {
    await page.getByRole('button', {name: 'Open navigation menu', exact: true}).press('Enter');
    await page.getByRole('dialog', {name: 'Navigation menu', exact: true}).getByRole('link', {name: 'Settings', exact: true}).press('Enter');
  } else await page.locator('.v2-sidebar').getByRole('link', {name: 'Settings', exact: true}).press('Enter');
}


for (const motion of ['no-preference', 'reduce'] as const) for (const oldOutcome of ['success', 'failure'] as const) {
  test(`public navigation rejects delayed account ${oldOutcome} and reloads on return (${motion})`, async ({page}, info) => {
    await page.addInitScript(() => {
      const probe = {pending: 0, errors: [] as string[]};
      Object.assign(window, {analytifyTransitionProbe: probe});
      const native = document.startViewTransition?.bind(document);
      if (!native) return;
      document.startViewTransition = (...args: Parameters<typeof native>) => {
        const transition = native(...args); probe.pending++;
        const capture = (error: unknown) => {
          const message = String(error);
          if (/TimeoutError|DOM update timed out/i.test(message)) probe.errors.push(message);
        };
        void transition.ready.catch(capture);
        void transition.updateCallbackDone.catch(capture);
        void transition.finished.then(() => {probe.pending--;}, error => {probe.pending--; capture(error);});
        return transition;
      };
    });
    const transitionErrors: string[] = [];
    page.on('console', message => {if (/TimeoutError.*Transition|DOM update timed out/i.test(message.text())) transitionErrors.push(message.text());});
    await page.emulateMedia({reducedMotion: motion});
    await mockSpotify(page); await seedAuthenticatedBrowser(page);
    await page.evaluate(async () => {
      const db = await new Promise<IDBDatabase>((resolve, reject) => {
        const request = indexedDB.open('AnalytifyDB', 4);
        request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error);
      });
      const tx = db.transaction('appData', 'readwrite');
      for (const id of ['e2e-user', 'e2e-user_dev']) tx.objectStore('appData').put({key: `${id}_display_name`, value: 'Cached account'});
      await new Promise<void>((resolve, reject) => {tx.oncomplete = () => resolve(); tx.onerror = () => reject(tx.error);}); db.close();
    });
    let release!: () => void;
    const pending = new Promise<void>(resolve => {release = resolve;});
    let profileRequests = 0, oldCompleted = false, oldCancelled = false;
    page.on('requestfailed', request => {if (request.url() === 'https://api.spotify.com/v1/me') oldCancelled = true;});
    await page.route('https://api.spotify.com/v1/me', async route => {
      profileRequests++;
      if (profileRequests === 1) {
        await pending;
        await route.fulfill(oldOutcome === 'failure' ? {status: 503, json: {error: 'isolated offline'}}
          : {json: {id: 'e2e-user', display_name: 'Obsolete account', images: []}});
        oldCompleted = true;
      } else await route.fulfill({json: {id: 'e2e-user', display_name: 'Current account', images: []}});
    });
    await page.goto('/settings/account');
    await expect(page.getByRole('status', {name: 'Loading Analytify', exact: true})).toHaveCount(0);
    await expect.poll(() => profileRequests).toBe(1);
    const account = page.locator('v2-settings-account');
    await expect(account.getByRole('heading', {name: 'Cached account', exact: true})).toBeVisible();
    await account.getByRole('link', {name: 'Legal & privacy', exact: true}).press('Enter');
    await expect(page).toHaveURL(/\/legal$/);
    await expect(page.locator('.design-v2')).toHaveAttribute('data-chrome', 'public'); await expect(account).toHaveCount(0);
    await expect.poll(() => oldCancelled).toBe(true);
    await expect.poll(() => page.evaluate(() => (window as Window & {analytifyTransitionProbe: {pending: number; errors: string[]}}).analytifyTransitionProbe)).toEqual({pending: 0, errors: []});
    release(); await expect.poll(() => oldCompleted).toBe(true);
    await page.getByRole('link', {name: 'Analytify playlists', exact: true}).press('Enter');
    await expect(page).toHaveURL(/\/playlists$/);
    await expect(page.locator('.design-v2')).toHaveAttribute('data-chrome', 'app');
    await openSettings(page);
    await expect(account.getByRole('heading', {name: 'Current account', exact: true})).toBeVisible();
    expect(profileRequests).toBe(2); await expect(page.getByText('Obsolete account', {exact: true})).toHaveCount(0);
    await expectNoBlockingAxeViolations(page);
    await account.screenshot({path: info.outputPath('current-account.png')});
    // Same-account app navigation keeps the settled profile, without another request.
    const navigation = page.locator(info.project.name === 'mobile' ? '.v2-mobile-nav' : '.v2-sidebar');
    await navigation.getByRole('link', {name: 'Stats', exact: true}).press('Enter');
    await expect(page).toHaveURL(/\/stats$/);
    await openSettings(page);
    await expect(account.getByRole('heading', {name: 'Current account', exact: true})).toBeVisible();
    expect(profileRequests).toBe(2);
    await expect.poll(() => page.evaluate(() => (window as Window & {analytifyTransitionProbe: {pending: number; errors: string[]}}).analytifyTransitionProbe)).toEqual({pending: 0, errors: []});
    expect(transitionErrors).toEqual([]);
    await writeFile(info.outputPath('account-requests.json'), JSON.stringify({motion, oldOutcome, profileRequests, oldCompleted, oldCancelled, transitionErrors}, null, 2));
  });
}
