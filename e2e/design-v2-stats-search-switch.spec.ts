import {test, expect} from './fixtures';
import {expectNoBlockingAxeViolations, mockSpotify, seedAuthenticatedBrowser} from './helpers/authenticated-browser';
import type {Route} from '@playwright/test';

test('historical search stays cancellable, ignores a late result and recovers through the native switch', async ({page}, testInfo) => {
  await mockSpotify(page);
  await seedAuthenticatedBrowser(page, {cloudIdentity: true});
  const pending: Route[] = [];
  const queries: unknown[] = [];
  await page.route('https://tmmhylpexbubyznlizfs.supabase.co/**', async route => {
    const path = new URL(route.request().url()).pathname;
    if (path === '/rest/v1/rpc/search_past_top_items') {
      queries.push(route.request().postDataJSON());
      pending.push(route);
      return;
    }
    return route.fulfill({json: path === '/rest/v1/users' ? {backup_active: true} : []});
  });
  await page.evaluate(async () => {
    await new Promise<void>((resolve, reject) => {
      const request = indexedDB.open('AnalytifyDB', 4);
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const db = request.result, tx = db.transaction('appData', 'readwrite');
        tx.objectStore('appData').put({key: 'de111111-1111-4111-8111-111111111111_backup_active', value: 'true'});
        tx.oncomplete = () => {db.close(); resolve();};
        tx.onerror = () => reject(tx.error);
      };
    });
  });
  await page.goto('/new/stats');
  const search = page.getByRole('searchbox', {name: 'Search songs or artists', exact: true});
  const toggle = page.getByRole('switch', {name: 'Search past rankings'});
  await expect(toggle).toHaveAttribute('aria-checked', 'false');
  await search.fill('Former');
  await toggle.press('Space');
  await expect.poll(() => pending.length).toBe(1);
  expect(queries[0]).toEqual({p_range: 'short_term', p_kind: 'track', p_query: 'Former', p_limit: 20});
  await expect(page.getByText('Searching saved rankings…', {exact: true})).toBeVisible();
  await expect(toggle).toBeEnabled();
  await toggle.press('Enter');
  await expect(toggle).toHaveAttribute('aria-checked', 'false');
  const result = [{kind: 'track', item_id: 'former-track', item_name: 'Former favourite', subtitle: 'Old artist', image_url: '', spotify_url: '', best_rank: 2, first_seen: '2026-09-01', last_seen: '2026-09-05', appearances: 2}];
  await pending[0].fulfill({json: result});
  await expect(page.locator('.v2-past-results')).toHaveCount(0);
  await toggle.press('Space');
  await expect.poll(() => pending.length).toBe(2);
  await pending[1].fulfill({status: 503, json: {message: 'Search temporarily unavailable'}});
  await expect(page.getByText('Search temporarily unavailable', {exact: true})).toBeVisible();
  await toggle.press('Enter');
  await toggle.press('Space');
  await expect.poll(() => pending.length).toBe(3);
  await pending[2].fulfill({json: result});
  await expect(page.getByRole('button', {name: /Former favourite/})).toBeVisible();
  await expectNoBlockingAxeViolations(page);
  await page.screenshot({path: testInfo.outputPath('historical-search-recovered.png'), fullPage: true});
});

test('canonical search row keeps touch geometry when resizing short and tall windows', async ({page}, testInfo) => {
  await mockSpotify(page);
  await seedAuthenticatedBrowser(page);
  await page.goto('/new/stats');
  const group = page.getByRole('group', {name: 'Search rankings', exact: true});
  const toggle = group.getByRole('switch', {name: 'Search past rankings'});
  const input = group.getByRole('searchbox');
  const compare = group.getByRole('button', {name: 'Compare dates'});
  for (const width of [1440, 390]) for (const height of [480, 1000]) {
    await page.setViewportSize({width, height});
    await expect(toggle).toBeVisible();
    const boxes = await Promise.all([input.boundingBox(), compare.boundingBox(), toggle.boundingBox()]);
    const [search, dates, past] = boxes.map(box => {expect(box).not.toBeNull(); return box!;});
    expect(search.height).toBe(48);
    expect(dates.height).toBe(48);
    expect(past.height).toBe(48);
    if (width === 1440) {
      expect(past.width).toBe(240);
      expect(dates.x - search.x - search.width).toBeCloseTo(12, 4);
      expect(past.x - dates.x - dates.width).toBeCloseTo(12, 4);
      expect(past.y).toBeCloseTo(search.y, 4);
    } else {
      expect(search.width).toBe(358);
      expect(dates.width).toBe(166);
      expect(past.width).toBe(358);
      expect(dates.y - search.y - search.height).toBeCloseTo(8, 4);
      expect(past.y - dates.y - dates.height).toBeCloseTo(8, 4);
      expect(past.x).toBe(search.x);
    }
    await group.evaluate(element => element.scrollIntoView({block: 'center'}));
    await expect.poll(() => toggle.evaluate(element => {
      const box = element.getBoundingClientRect();
      return element.contains(document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2));
    })).toBe(true);
    await group.screenshot({path: testInfo.outputPath(`search-row-${width}-${height}.png`), animations: 'disabled'});
  }
  await expectNoBlockingAxeViolations(page);
});

test('selection follows the native 220ms timeline and responds to reduced motion', async ({page}, testInfo) => {
  await page.emulateMedia({reducedMotion: 'no-preference'});
  await mockSpotify(page);
  await seedAuthenticatedBrowser(page);
  await page.goto('/new/stats');
  const toggle = page.getByRole('switch', {name: 'Search past rankings'});
  await toggle.press('Tab');
  await toggle.focus();
  await toggle.press('Space');
  await expect(toggle).toHaveAttribute('aria-checked', 'true');
  // Capture native CSS transitions immediately, before Playwright polling can
  // consume this short timeline. Resume once to prove the native clock runs.
  const timing = await toggle.evaluate(element => {
    const thumb = element.querySelector('.thumb')!;
    const animation = thumb.getAnimations().find(item => (item as CSSTransition).transitionProperty === 'transform')!;
    animation.pause();
    animation.currentTime = 55;
    const matrix = new DOMMatrixReadOnly(getComputedStyle(thumb).transform);
    const effect = animation.effect!.getTiming();
    animation.play();
    return {duration: effect.duration, easing: effect.easing, travel: matrix.m41};
  });
  expect(timing.duration).toBe(220);
  expect(timing.easing).toBe('ease-in-out');
  expect(timing.travel).toBeCloseTo(1.808, 2);
  await expect.poll(() => toggle.locator('.thumb').evaluate(element => new DOMMatrixReadOnly(getComputedStyle(element).transform).m41)).toBe(14);
  await toggle.hover();
  await page.keyboard.press('Tab');
  await page.keyboard.press('Shift+Tab');
  await expect(toggle).toBeFocused();
  expect(await toggle.evaluate(element => getComputedStyle(element).borderTopColor)).toBe('rgb(159, 255, 200)');
  await toggle.screenshot({path: testInfo.outputPath('toggle-on-focus.png')});
  await page.emulateMedia({reducedMotion: 'reduce'});
  await toggle.press('Space');
  await expect(toggle).toHaveAttribute('aria-checked', 'false');
  const reduced = await toggle.locator('.thumb').evaluate(element => ({
    travel: new DOMMatrixReadOnly(getComputedStyle(element).transform).m41,
    active: element.getAnimations().length
  }));
  expect(reduced).toEqual({travel: 0, active: 0});
});
