import {test, expect} from './fixtures';
import {mockSpotify, seedAuthenticatedBrowser, expectNoBlockingAxeViolations} from './helpers/authenticated-browser';
import {writeFile} from 'node:fs/promises';

for (const motion of ['no-preference', 'reduce'] as const) {
  test(`cloud deletion preserves failure recovery and blocks duplicate submissions (${motion})`, async ({page}, info) => {
    const transitionErrors: string[] = [];
    const recordTransitionError = (message: string) => {
      if (/TimeoutError|DOM update timed out/.test(message)) transitionErrors.push(message);
    };
    page.on('pageerror', error => recordTransitionError(error.message));
    page.on('console', message => recordTransitionError(message.text()));
    await page.emulateMedia({reducedMotion: motion});
    await mockSpotify(page);
    const requests: {method: string; table: string; actor: string | null}[] = [];
    let release!: () => void;
    const held = new Promise<void>(resolve => {release = resolve;});
    await page.route('**/rest/v1/users?**', async route => {
      // Account bootstrap reads are a separate contract. A deterministic empty
      // reply avoids injecting SDK network retries into the deletion fixture.
      if (route.request().method() === 'GET') return route.fulfill({status: 200, json: null});
      if (route.request().method() !== 'DELETE') return route.abort('blockedbyclient');
      const url = new URL(route.request().url());
      requests.push({method: 'DELETE', table: url.pathname, actor: url.searchParams.get('id')});
      if (requests.length === 1) {
        await held;
        await route.fulfill({status: 403, json: {code: '42501', message: 'Isolated deletion denied'}});
      } else await route.fulfill({status: 204, body: ''});
    });
    await seedAuthenticatedBrowser(page, {cloudIdentity: true});
    await page.goto('/stats');
    await expect(page.locator('.v2-ranking-list strong')).toHaveText('Test Song');
    const trigger = page.getByRole('button', {name: 'Open account and data settings', exact: true});
    await trigger.press('Enter');
    await page.getByRole('button', {name: 'Clear data', exact: true}).press('Enter');
    await page.getByRole('button', {name: /Delete cloud data and leave shared features/}).press('Enter');
    const dialog = page.getByRole('alertdialog', {name: 'Delete cloud data and leave shared features?', exact: true});
    const remove = dialog.getByRole('button', {name: 'Delete cloud data', exact: true});
    await remove.press('Enter');
    await expect.poll(() => requests.length).toBe(1);
    await expect(remove).toBeDisabled();
    await expect(dialog.getByRole('button', {name: 'Back', exact: true})).toBeDisabled();
    await remove.dispatchEvent('click');
    expect(requests).toEqual([{method: 'DELETE', table: '/rest/v1/users', actor: 'eq.de111111-1111-4111-8111-111111111111'}]);
    await expect(page).toHaveURL(/\/stats$/);
    release();
    await expect(dialog.getByRole('alert')).toContainText('Some steps may already have completed');
    await expect(remove).toBeEnabled();
    await expectNoBlockingAxeViolations(page);
    await dialog.screenshot({path: info.outputPath('deletion-recovery.png')});
    await remove.press('Enter');
    await expect(page).toHaveURL(/\/login$/);
    await expect(page.locator('app-login-page')).toBeVisible();
    expect(requests).toHaveLength(2);
    expect(requests[1]).toEqual(requests[0]);
    await expect(dialog).toHaveCount(0);
    await writeFile(info.outputPath('deletion-contract.json'), JSON.stringify({requests, motion, finalPath: new URL(page.url()).pathname, transitionErrors}, null, 2));
    expect(transitionErrors).toEqual([]);
  });
}
