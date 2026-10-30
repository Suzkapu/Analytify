import {test, expect} from './fixtures';
import {mockSpotify} from './helpers/authenticated-browser';
import {observeNativeTransitions, expectNativeTransitionsSettled} from './helpers/native-transitions';
import {writeFile} from 'node:fs/promises';

test('first Login renders directly and later Legal navigation retains native transitions', async ({page}, info) => {
  await observeNativeTransitions(page); await mockSpotify(page);
  await page.route('**/rest/v1/rpc/get_public_site_settings', route => route.fulfill({json: {}}));
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => {if (message.type() === 'error') errors.push(message.text());});
  await page.goto('/login'); await expect(page.locator('app-login-page')).toBeVisible();
  const starts = () => page.evaluate(() => (window as Window & {analytifyNativeTransitionProbe: {starts: number}}).analytifyNativeTransitionProbe.starts);
  expect(await starts()).toBe(0);
  await expectNativeTransitionsSettled(page);
  await page.getByRole('link', {name: 'Terms', exact: true}).press('Enter');
  await expect(page).toHaveURL(/\/legal#terms$/);
  await expect(page.getByRole('main', {name: 'Legal content'})).toBeVisible();
  await expectNativeTransitionsSettled(page); expect(await starts()).toBeGreaterThan(0);
  // Provider migration must preserve real fragment scrolling below the header.
  await expect.poll(() => page.locator('#terms').evaluate(element => Math.round(element.getBoundingClientRect().top)))
    .toBe(96);
  expect(errors).toEqual([]);
  await writeFile(info.outputPath('startup-navigation.json'), JSON.stringify({initialStarts: 0, laterStarts: await starts(), errors}, null, 2));
});
