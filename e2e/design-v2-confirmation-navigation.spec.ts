import {test, expect} from './fixtures';
import {mockSpotify, seedAuthenticatedBrowser, expectNoBlockingAxeViolations} from './helpers/authenticated-browser';
import {writeFile} from 'node:fs/promises';

for (const motion of ['no-preference', 'reduce'] as const) {
  test(`data confirmation Back, Cancel and reopening preserve the current session (${motion})`, async ({page}, info) => {
    await page.emulateMedia({reducedMotion: motion}); await mockSpotify(page);
    await page.route('**/rest/v1/users?**', route => route.request().method() === 'GET'
      ? route.fulfill({json: null}) : route.abort('blockedbyclient'));
    const destructiveRequests: string[] = [];
    page.on('request', request => {
      const url = new URL(request.url());
      if (request.method() === 'DELETE' || url.pathname.endsWith('/logout')) destructiveRequests.push(url.pathname);
    });
    await seedAuthenticatedBrowser(page, {cloudIdentity: true}); await page.goto('/new/stats');
    await expect(page.locator('.v2-ranking-list strong')).toHaveText('Test Song');
    const trigger = page.getByRole('button', {name: 'Open account and data settings', exact: true});
    const open = async () => {
      await trigger.press('Enter'); await page.getByRole('button', {name: 'Clear data', exact: true}).press('Enter');
    };
    const choose = page.getByRole('alertdialog', {name: 'What would you like to clear?', exact: true});
    const localChoice = choose.getByRole('button', {name: /Clear this browser and log out/});
    await open(); await expect(localChoice).toBeFocused();
    await localChoice.press('Enter');
    const local = page.getByRole('alertdialog', {name: 'Clear this browser and log out?', exact: true});
    await expect(local).toBeVisible(); await expectNoBlockingAxeViolations(page);
    await local.getByRole('button', {name: 'Back', exact: true}).press('Enter');
    await expect(choose).toBeVisible();
    await choose.getByRole('button', {name: /Delete cloud data and leave shared features/}).press('Enter');
    await expect(page.getByRole('alertdialog', {name: 'Delete cloud data and leave shared features?', exact: true})).toBeVisible();
    await page.keyboard.press('Escape'); await expect(page.getByRole('alertdialog')).toHaveCount(0);
    await expect(trigger).toBeFocused();
    await open(); await expect(choose).toBeVisible(); await expectNoBlockingAxeViolations(page);
    await choose.screenshot({path: info.outputPath('reopened-data-choice.png')});
    await choose.getByRole('button', {name: 'Cancel', exact: true}).press('Enter');
    await expect(page.getByRole('alertdialog')).toHaveCount(0); await expect(trigger).toBeFocused();
    await expect(page).toHaveURL(/\/new\/stats$/); expect(destructiveRequests).toEqual([]);
    await writeFile(info.outputPath('confirmation-navigation.json'), JSON.stringify({motion, destructiveRequests, finalPath: new URL(page.url()).pathname}, null, 2));
  });
}
