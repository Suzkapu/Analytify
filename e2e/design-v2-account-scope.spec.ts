import {test, expect} from './fixtures';
import {mockSpotify, seedAuthenticatedBrowser, expectNoBlockingAxeViolations} from './helpers/authenticated-browser';

// The removed account popover is replaced by canonical Settings routes. Their
// geometry, notifications and update workflows have dedicated Settings suites.
for (const cloudIdentity of [false, true]) for (const motion of ['no-preference', 'reduce'] as const) {
  test(`Settings retains account destinations and excludes blocked management (cloud=${cloudIdentity}, ${motion})`, async ({page}) => {
    await page.emulateMedia({reducedMotion: motion}); await mockSpotify(page);
    await page.route('**/rest/v1/users?**', route => route.fulfill({json: null}));
    await seedAuthenticatedBrowser(page, {cloudIdentity}); await page.goto('/settings/account');
    const account = page.locator('v2-settings-account');
    await expect(account.getByRole('heading', {name: 'Browser test user', exact: true})).toBeVisible();
    await expect(account.getByRole('link', {name: 'Spotify connection', exact: true})).toHaveAttribute('href', 'https://www.spotify.com/account/apps/');
    await expect(account.getByRole('link', {name: 'Legal & privacy', exact: true})).toHaveAttribute('href', '/legal');
    await expect(account.getByRole('button', {name: 'Log out', exact: true})).toBeVisible();
    await expect(page.getByRole('link', {name: 'Blocked users', exact: true})).toHaveCount(0);
    await expect(page.getByRole('button', {name: 'Blocked users', exact: true})).toHaveCount(0);
    await page.getByRole('navigation', {name: 'Settings sections'}).getByRole('link', {name: 'Data', exact: true}).press('Enter');
    await expect(page.locator('v2-settings-data').getByRole('switch', {name: 'Cloud Backup', exact: true})).toBeVisible();
    await expectNoBlockingAxeViolations(page);
  });
}
