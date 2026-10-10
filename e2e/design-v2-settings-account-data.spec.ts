import {test, expect} from './fixtures';
import {mockSpotify, seedAuthenticatedBrowser, expectNoBlockingAxeViolations} from './helpers/authenticated-browser';
import {writeFile} from 'node:fs/promises';

for (const motion of ['no-preference', 'reduce'] as const) {
  for (const matrixHeight of [480, 1000]) {
  test(`Settings Account and Data preserve consent across live resizing (${motion}, height ${matrixHeight})`, async ({page}, info) => {
    await page.emulateMedia({reducedMotion: motion}); await mockSpotify(page);
    await page.route('**/rest/v1/users?**', route => route.request().method() === 'GET'
      ? route.fulfill({json: null}) : route.abort('blockedbyclient'));
    await page.route('**/rest/v1/rpc/get_public_site_settings', route => route.fulfill({json: {}}));
    await page.route('**/rest/v1/rpc/is_app_admin', route => route.fulfill({json: false}));
    const runtimeErrors: string[] = [];
    page.on('pageerror', error => runtimeErrors.push(error.message));
    page.on('console', message => {if (message.type() === 'error') runtimeErrors.push(message.text());});
    const destructiveRequests: string[] = [];
    page.on('request', request => {
      const url = new URL(request.url());
      if (request.method() === 'DELETE' || url.pathname.endsWith('/logout')) destructiveRequests.push(url.pathname);
    });
    await seedAuthenticatedBrowser(page, {cloudIdentity: true}); await page.goto('/new/settings/account');
    const panel = page.locator('v2-settings-account');
    await expect(panel.getByRole('heading', {name: 'Browser test user'})).toBeVisible();
    const spotify = panel.getByRole('link', {name: 'Spotify connection'});
    await expect(spotify).toHaveAttribute('href', 'https://www.spotify.com/account/apps/');
    await expect(spotify).toHaveAttribute('target', '_blank'); await expect(spotify).toHaveAttribute('rel', 'noopener noreferrer');
    await spotify.focus(); await expect(spotify).toBeFocused();
    await expect(spotify).toHaveCSS('border-top-color', 'rgb(53, 231, 131)');
    await expectNoBlockingAxeViolations(page);
    const geometry = [];
    for (const width of [320, 390, 760, 768, 1024, 1440, 1920]) {
      {
        const height = matrixHeight;
        await page.setViewportSize({width, height});
        await expect(page.locator('nav[aria-label="Settings sections"] [aria-current="page"]')).toHaveCount(1);
        const logout = panel.getByRole('button', {name: 'Log out', exact: true});
        await logout.scrollIntoViewIfNeeded(); await logout.click({trial: true});
        const sample = await logout.evaluate(element => {
          const rect = element.getBoundingClientRect();
          const target = document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2);
          return {width: innerWidth, height: innerHeight, scrollWidth: document.documentElement.scrollWidth,
            button: {x: rect.x, y: rect.y, width: rect.width, height: rect.height}, reachable: !!target && element.contains(target)};
        });
        expect(sample.scrollWidth).toBeLessThanOrEqual(width); expect(sample.button.height).toBeGreaterThanOrEqual(48);
        expect(sample.button.x).toBeGreaterThanOrEqual(0); expect(sample.button.x + sample.button.width).toBeLessThanOrEqual(width);
        expect(sample.reachable, JSON.stringify(sample)).toBe(true); geometry.push(sample);
      }
    }
    await page.setViewportSize({width: info.project.name === 'mobile' ? 390 : 1440, height: 900});
    await panel.screenshot({path: info.outputPath('settings-account.png')});
    await page.getByRole('link', {name: 'Data', exact: true}).press('Enter');
    const data = page.locator('v2-settings-data'); await expect(data.getByRole('heading', {name: 'Data & privacy'})).toBeVisible();
    await expect(page.locator('nav[aria-label="Settings sections"] [aria-current="page"]')).toHaveAccessibleName('Data');
    await expectNoBlockingAxeViolations(page); await data.screenshot({path: info.outputPath('settings-data.png')});
    const backup = data.getByRole('switch', {name: 'Cloud Backup'});
    await expect(backup).not.toBeChecked(); await backup.press('Space');
    await expect(data.locator('input[type=checkbox]')).not.toBeChecked(); await expect(page.getByRole('alertdialog')).toBeVisible();
    await page.keyboard.press('Escape'); await expect(page.getByRole('alertdialog')).toHaveCount(0);
    await data.getByRole('button', {name: 'Clear data', exact: true}).press('Enter');
    await expect(page.getByRole('alertdialog', {name: 'What would you like to clear?', exact: true})).toBeVisible();
    await page.keyboard.press('Escape'); await expect(page.getByRole('alertdialog')).toHaveCount(0);
    await expect(page).toHaveURL(/\/new\/settings\/data$/); expect(destructiveRequests).toEqual([]); expect(runtimeErrors).toEqual([]);
    await writeFile(info.outputPath('settings-account-data.json'), JSON.stringify({motion, geometry, destructiveRequests, runtimeErrors}, null, 2));
  });
}
}
