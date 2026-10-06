import {expect, test} from './fixtures';
import {mockSpotify, seedAuthenticatedBrowser} from './helpers/authenticated-browser';

test('large cached playlists render incrementally and search the entire collection', async ({page}, testInfo) => {
  await mockSpotify(page);
  await seedAuthenticatedBrowser(page);
  await page.evaluate(async () => {
    await new Promise<void>((resolve, reject) => {
      const request = indexedDB.open('AnalytifyDB', 4);
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const db = request.result;
        const transaction = db.transaction(['appData', 'featureData'], 'readwrite');
        const tracks = Array.from({length: 1000}, (_, index) => ({
          id: `large-song-${index}`, name: `Large song ${String(index + 1).padStart(4, '0')}`,
          playlist_index: index, duration_ms: 120000,
          artists: [{id: 'artist-1', name: 'Test Artist'}],
          album: {id: 'album-1', name: 'Test Album', images: []},
          external_urls: {spotify: `https://open.spotify.com/track/large-song-${index}`}
        }));
        for (const userId of ['e2e-user', 'e2e-user_dev']) {
          transaction.objectStore('featureData').put({key: `${userId}_playlist-1`,
            value: JSON.stringify([{id: 'artist-1', name: 'Test Artist', images: [], tracks}])});
          const store = transaction.objectStore('appData');
          store.put({key: `${userId}_playlist-1_lastUpdated`, value: String(Date.now())});
          store.put({key: `${userId}_playlist-1_Amount`, value: '1000'});
          store.put({key: `${userId}_playlist-1_CachedTrackCount`, value: '1000'});
          store.put({key: `${userId}_playlist-1_Name`, value: JSON.stringify('Large playlist')});
        }
        transaction.oncomplete = () => {db.close(); resolve();};
        transaction.onerror = () => reject(transaction.error);
      };
    });
  });
  await page.goto('/new/songs/playlist-1');
  await page.getByRole('button', {name: 'Songs', exact: true}).click();
  const rows = page.locator('.v2-track-row');
  await expect(rows).toHaveCount(50);
  const sample = () => page.evaluate(() => ({
    elements: document.querySelectorAll('*').length,
    rows: document.querySelectorAll('.v2-track-row').length,
    artworkWithoutDimensions: [...document.querySelectorAll<HTMLImageElement>('.v2-track-row img')]
      .filter(image => !image.width || !image.height).length,
    eagerArtwork: document.querySelectorAll('.v2-track-row img:not([loading="lazy"])').length
  }));
  const initial = await sample();
  expect(initial.artworkWithoutDimensions).toBe(0);
  expect(initial.eagerArtwork).toBe(0);
  const distantCopy = rows.nth(49).locator('.v2-track-copy');
  await expect.poll(() => distantCopy.evaluate(element =>
    element.checkVisibility({contentVisibilityAuto: true}))).toBe(false);
  const containment = await rows.nth(49).evaluate(element => ({
    contentVisibility: getComputedStyle(element).contentVisibility,
    intrinsicSize: getComputedStyle(element).containIntrinsicSize,
    height: element.getBoundingClientRect().height
  }));
  expect(containment.contentVisibility).toBe('auto');
  expect(containment.intrinsicSize).not.toBe('none');
  expect(containment.height).toBeGreaterThan(0);
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  await expect(rows).toHaveCount(100);
  // Appending the next batch can move the scroll anchor to the new last row.
  // Bring the original distant row into view before testing lazy paint recovery.
  await rows.nth(49).scrollIntoViewIfNeeded();
  await expect.poll(() => distantCopy.evaluate(element =>
    element.checkVisibility({contentVisibilityAuto: true}))).toBe(true);
  const revealedAction = rows.nth(49).getByRole('button', {name: 'Open Large song 0050 on Spotify'});
  await revealedAction.focus();
  await expect(revealedAction).toBeFocused();
  await page.evaluate(() => window.scrollTo(0, 0));
  const search = page.getByRole('searchbox', {name: 'Search songs or artists'});
  const samples = [initial, await sample()];
  for (let iteration = 0; iteration < 3; iteration++) {
    await search.fill('Large song 1000');
    await expect(rows).toHaveCount(1);
    await expect(rows.first()).toContainText('Large song 1000');
    await search.fill('');
    await expect(rows).toHaveCount(50);
    const current = await sample();
    expect(current).toEqual(initial);
    samples.push(current);
  }
  await testInfo.attach('large-playlist-incremental-rendering.json', {
    body: JSON.stringify({project: testInfo.project.name, collectionSize: 1000, containment,
      scope: 'mocked local cache; incremental DOM and full-collection search, not virtualization or field performance', samples}, null, 2),
    contentType: 'application/json'
  });
});

test('full top-song rankings remain bounded through filtering, tabs, and history dialogs', async ({page}, testInfo) => {
  await mockSpotify(page);
  await seedAuthenticatedBrowser(page);
  await page.route('https://api.spotify.com/v1/me/top/tracks?*', async route => {
    const url = new URL(route.request().url());
    const offset = Number(url.searchParams.get('offset') || 0);
    const limit = Number(url.searchParams.get('limit') || 50);
    const tracks = Array.from({length: 100}, (_, index) => ({
      id: `dense-track-${index}`, name: `Ranking song ${String(index + 1).padStart(3, '0')}`,
      artists: [{id: 'artist-1', name: 'Test Artist'}],
      album: {id: `album-${index}`, name: `Album ${index}`, images: []},
      duration_ms: 180000, external_urls: {spotify: `https://open.spotify.com/track/dense-track-${index}`}
    }));
    await route.fulfill({json: {items: tracks.slice(offset, offset + limit), total: 100}});
  });
  await page.goto('/new/stats');
  const rows = page.locator('.v2-ranking-row');
  await expect(rows).toHaveCount(100);
  const sample = () => page.evaluate(() => ({
    elements: document.querySelectorAll('*').length,
    rows: document.querySelectorAll('.v2-ranking-row').length,
    dialogs: document.querySelectorAll('[role="dialog"]').length,
    artworkWithoutDimensions: [...document.querySelectorAll<HTMLImageElement>('.v2-ranking-row img')]
      .filter(image => !image.width || !image.height).length
  }));
  const initial = await sample();
  const search = page.getByRole('searchbox', {name: 'Search songs or artists'});
  const samples: unknown[] = [initial];
  for (let iteration = 0; iteration < 3; iteration++) {
    const start = await page.evaluate(() => performance.now());
    await search.fill('Ranking song 100');
    await expect(rows).toHaveCount(1);
    await search.fill('');
    await expect(rows).toHaveCount(100);
    await page.getByRole('button', {name: 'Artists', exact: true}).click();
    await expect(rows).toHaveCount(0);
    await expect(page.locator('.v2-ranked-artist')).toHaveCount(1);
    await page.getByRole('button', {name: 'Songs', exact: true}).click();
    await expect(rows).toHaveCount(100);
    const historyAction = rows.first().getByRole('button', {name: 'View position history for Ranking song 001'});
    await historyAction.press('Enter');
    const historyDialog = page.getByRole('dialog', {name: 'Ranking song 001 position history'});
    await expect(historyDialog).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(historyDialog).toHaveCount(0);
    await expect(historyAction).toBeFocused();
    const current = await sample();
    expect(current.elements).toBe(initial.elements);
    expect(current.dialogs).toBe(0);
    expect(current.artworkWithoutDimensions).toBe(0);
    samples.push({...current, browserAutomationRoundTripMs: await page.evaluate(start => performance.now() - start, start)});
  }
  await testInfo.attach('dense-rankings-dom-sample.json', {
    body: JSON.stringify({project: testInfo.project.name,
      scope: '100 mocked songs; bounded DOM and interaction correctness, not field INP or hardware timing', samples}, null, 2),
    contentType: 'application/json'
  });
});
