import {expect, test} from '@playwright/test';
import {mockSpotify, seedAuthenticatedBrowser} from './helpers/authenticated-browser';

test('canonical library records navigation and interaction performance evidence', async ({page}, testInfo) => {
  await mockSpotify(page);
  await seedAuthenticatedBrowser(page);
  await page.addInitScript(() => {
    const metrics = {lcp: 0, cls: 0, shifts: [] as unknown[], longTasks: [] as number[], interactions: [] as number[]};
    (window as any).__releasePerformance = metrics;
    for (const type of ['largest-contentful-paint', 'layout-shift', 'longtask', 'event']) {
      if (!PerformanceObserver.supportedEntryTypes.includes(type)) continue;
      new PerformanceObserver(list => {
        for (const entry of list.getEntries()) {
          const item = entry as any;
          if (type === 'largest-contentful-paint') metrics.lcp = entry.startTime;
          if (type === 'layout-shift' && !item.hadRecentInput) {
            metrics.cls += item.value;
            metrics.shifts.push({value: item.value, time: entry.startTime,
              sources: item.sources?.map((source: any) => ({
                node: source.node?.outerHTML?.slice(0, 300),
                previousRect: source.previousRect, currentRect: source.currentRect
              }))});
          }
          if (type === 'longtask') metrics.longTasks.push(entry.duration);
          if (type === 'event' && item.interactionId) metrics.interactions.push(entry.duration);
        }
      }).observe(type === 'event' ? {type, buffered: true, durationThreshold: 16} : {type, buffered: true});
    }
  });
  const profiler = await page.context().newCDPSession(page);
  await profiler.send('Tracing.start', {
    categories: 'devtools.timeline,blink.user_timing,toplevel,disabled-by-default-devtools.timeline',
    transferMode: 'ReturnAsStream'
  });
  await page.goto('/playlists');
  const search = page.getByRole('searchbox', {name: 'Search your playlists'});
  await expect(search).toBeVisible();
  await expect(page.getByText('Test Playlist', {exact: true})).toBeVisible();
  await page.evaluate(() => performance.mark('library-search-start'));
  await search.fill('Test');
  await page.evaluate(() => {
    performance.mark('library-search-end');
    performance.measure('library-search', 'library-search-start', 'library-search-end');
    performance.mark('account-dialog-start');
  });
  await page.getByRole('button', {name: 'Open account and data settings'}).click();
  await page.keyboard.press('Escape');
  await page.evaluate(() => {
    performance.mark('account-dialog-end');
    performance.measure('account-dialog-open-close', 'account-dialog-start', 'account-dialog-end');
  });
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  const metrics = await page.evaluate(() => (window as any).__releasePerformance);
  await testInfo.attach('canonical-library-performance.json', {
    body: JSON.stringify({scope: 'local mocked-data lab sample; not field p75 or a Lighthouse report',
      project: testInfo.project.name, browser: 'Chromium', metrics}, null, 2),
    contentType: 'application/json'
  });
  const finished = new Promise<{stream: string}>(resolve => profiler.once('Tracing.tracingComplete', resolve));
  await profiler.send('Tracing.end');
  const {stream} = await finished;
  const trace: Buffer[] = [];
  let eof = false;
  while (!eof) {
    const chunk = await profiler.send('IO.read', {handle: stream, size: 262144});
    trace.push(Buffer.from(chunk.data, chunk.base64Encoded ? 'base64' : 'utf8'));
    eof = chunk.eof;
  }
  await profiler.send('IO.close', {handle: stream});
  await profiler.detach();
  const traceBody = Buffer.concat(trace);
  await testInfo.attach('chrome-performance-trace.json', {
    body: traceBody, contentType: 'application/json'
  });
  const events = JSON.parse(traceBody.toString('utf8')).traceEvents as {name: string}[];
  expect(events.some(event => event.name === 'library-search')).toBe(true);
  expect(events.some(event => event.name === 'account-dialog-open-close')).toBe(true);
  expect(metrics.cls).toBeLessThanOrEqual(0.1);
  expect(metrics.lcp).toBeGreaterThan(0);
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
  await page.goto('/stats');
  const rows = page.locator('.v2-ranking-row');
  await expect(rows).toHaveCount(100);
  const sample = () => page.evaluate(() => ({
    elements: document.querySelectorAll('*').length,
    rows: document.querySelectorAll('.v2-ranking-row').length,
    dialogs: document.querySelectorAll('.v2-trend-dialog').length,
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
    await rows.first().press('Enter');
    await expect(page.locator('.v2-trend-dialog')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.locator('.v2-trend-dialog')).toHaveCount(0);
    await expect(rows.first()).toBeFocused();
    const current = await sample();
    expect(current.elements).toBe(initial.elements);
    expect(current.artworkWithoutDimensions).toBe(0);
    samples.push({...current, browserAutomationRoundTripMs: await page.evaluate(start => performance.now() - start, start)});
  }
  await testInfo.attach('dense-rankings-dom-sample.json', {
    body: JSON.stringify({project: testInfo.project.name,
      scope: '100 mocked songs; bounded DOM and interaction correctness, not field INP or hardware timing', samples}, null, 2),
    contentType: 'application/json'
  });
});
