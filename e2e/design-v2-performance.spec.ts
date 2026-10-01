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
  await page.goto('/playlists');
  const search = page.getByRole('searchbox', {name: 'Search your playlists'});
  await expect(search).toBeVisible();
  await expect(page.getByText('Test Playlist', {exact: true})).toBeVisible();
  await search.fill('Test');
  await page.getByRole('button', {name: 'Open account and data settings'}).click();
  await page.keyboard.press('Escape');
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  const metrics = await page.evaluate(() => (window as any).__releasePerformance);
  await testInfo.attach('canonical-library-performance.json', {
    body: JSON.stringify({scope: 'local mocked-data lab sample; not field p75 or a Lighthouse report',
      project: testInfo.project.name, browser: 'Chromium', metrics}, null, 2),
    contentType: 'application/json'
  });
  expect(metrics.cls).toBeLessThanOrEqual(0.1);
  expect(metrics.lcp).toBeGreaterThan(0);
});
