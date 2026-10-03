import {expect, test} from '@playwright/test';
import {
  expectNoBlockingAxeViolations,
  mockSpotify,
  seedAuthenticatedBrowser
} from './helpers/authenticated-browser';

test.beforeEach(async ({page}) => {
  await mockSpotify(page);
  await seedAuthenticatedBrowser(page);
});

test('v2 Stats exposes labeled independent controls and keyboard category tabs', async ({page}) => {
  await page.goto('/new/stats');
  await expect(page.getByRole('main', {name: 'Your Top Listening content'})).toBeVisible();
  await expect(page.getByRole('group', {name: 'Ranking period'})).toBeVisible();

  const songs = page.getByRole('button', {name: 'Songs'});
  await expect(songs).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByRole('searchbox', {name: 'Search songs or artists'})).toBeVisible();
  const songHistory = page.getByRole('button', {name: 'View position history for Test Song'});
  await expect(songHistory).toBeVisible();
  await songHistory.press('Space');
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(songHistory).toBeFocused();
  await expect(page.locator('.v2-ranking-row[role="button"]')).toHaveCount(0);
  await songs.press('ArrowRight');
  await expect(page.getByRole('button', {name: 'Artists'})).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByRole('searchbox', {name: 'Search artists'})).toBeVisible();
  const artistHistory = page.getByRole('button', {name: 'View position history for Test Artist'});
  await artistHistory.press('Enter');
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(artistHistory).toBeFocused();
  await expect(page.getByRole('button', {name: 'Open Test Artist on Spotify'})).toBeVisible();
  await expect(page.locator('.v2-ranked-artist[role="button"]')).toHaveCount(0);

  const historical = page.getByRole('button', {name: 'Search past'});
  await expect(historical).toHaveAttribute('aria-pressed', 'false');
  await historical.click();
  await expect(historical).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('app-design-v2-shell')).toHaveCount(1);
  await expectNoBlockingAxeViolations(page);
});

test('v2 Recently Played groups dates without chart-like position numbers', async ({page}) => {
  await page.goto('/new/history');
  await expect(page.getByRole('main', {name: 'Recently Played content'})).toBeVisible();
  await expect(page.getByRole('heading', {name: 'Today'})).toBeVisible({timeout: 15_000});
  await expect(page.getByRole('heading', {name: 'Yesterday'})).toBeVisible();
  await expect(page.getByText('Played today')).toBeVisible();
  const chronologyLabels = await page.locator('.v2-history-row time').allTextContents();
  expect(chronologyLabels.every(label => !label.includes('#'))).toBe(true);
  await expect(page.locator('time[datetime]')).toHaveCount(2);
  await expect(page.locator('app-design-v2-shell')).toHaveCount(1);
  await expectNoBlockingAxeViolations(page);
});

test('v2 Insights reflows at 320 CSS pixels', async ({page}) => {
  await page.setViewportSize({width: 320, height: 800});
  for (const path of ['/stats', '/history']) {
    await page.goto('/new' + path);
    await expect(page.locator('.v2-page')).toBeVisible({timeout: 15_000});
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow, `${path} should not overflow horizontally`).toBeLessThanOrEqual(1);
  }
});

test('Insights long names and controls reflow across the release matrix and enlarged text', async ({page}, testInfo) => {
  const title = 'A very long song title with an extended edition and featured artists '.repeat(4);
  await page.route('https://api.spotify.com/v1/me/top/tracks?*', route => route.fulfill({json: {
    items: [{id: 'long-track', name: title,
      artists: [{id: 'artist-1', name: 'A long artist name '.repeat(5)}],
      album: {id: 'album-1', name: 'Test Album', images: []}, duration_ms: 180000}], total: 1
  }}));
  const matrix = [320, 375, 430, 500, 768, 1024, 1440].map(width => ({width, fontSize: '100%'}));
  matrix.push({width: 320, fontSize: '200%'}, {width: 768, fontSize: '200%'});
  const evidence: unknown[] = [];
  for (const path of ['/stats', '/history']) {
    await page.goto('/new' + path);
    await expect(page.locator('.v2-page')).toBeVisible();
    for (const {width, fontSize} of matrix) {
      await page.setViewportSize({width, height: 900});
      await page.evaluate(size => { document.documentElement.style.fontSize = size; }, fontSize);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      expect(overflow, `${path} at ${width}px/${fontSize}`).toBeLessThanOrEqual(1);
      if (path === '/stats') {
        const history = page.getByRole('button', {name: `View position history for ${title.trim()}`});
        await expect(history).toBeVisible();
        const box = await history.boundingBox();
        expect(box!.width).toBeGreaterThanOrEqual(44);
        expect(box!.height).toBeGreaterThanOrEqual(44);
        await expect(page.getByRole('searchbox', {name: 'Search songs or artists'})).toBeVisible();
      } else {
        await expect(page.getByText('Played today', {exact: true})).toBeVisible();
      }
      evidence.push({path, width, fontSize, overflow});
    }
    await page.evaluate(() => { document.documentElement.style.fontSize = '100%'; });
  }
  await testInfo.attach('insights-reflow-matrix.json', {
    body: JSON.stringify({project: testInfo.project.name,
      scope: 'CSS viewport and text enlargement, not browser zoom or manual screen-reader evidence', evidence}, null, 2),
    contentType: 'application/json'
  });
});

test('ranking history keyboard focus remains visible and meets non-text contrast', async ({page}, testInfo) => {
  await page.goto('/new/stats');
  const history = page.getByRole('button', {name: 'View position history for Test Song'});
  await expect(history).toBeVisible();
  await page.keyboard.press('Tab');
  await history.focus();
  const evidence = await history.evaluate(element => {
    const style = getComputedStyle(element);
    const row = element.closest('.v2-ranking-row')!;
    const background = getComputedStyle(row).backgroundColor;
    const rgba = (color: string) => {
      const values = color.match(/[\d.]+/g)!.map(Number);
      return [values[0], values[1], values[2], values[3] ?? 1];
    };
    const bg = rgba(background);
    const ring = rgba(style.outlineColor);
    const painted = ring.slice(0, 3).map((channel, index) => channel * ring[3] + bg[index] * (1 - ring[3]));
    const luminance = (channels: number[]) => channels.slice(0, 3).map(channel => channel / 255)
      .map(channel => channel <= .04045 ? channel / 12.92 : ((channel + .055) / 1.055) ** 2.4)
      .reduce((sum, channel, index) => sum + channel * [.2126, .7152, .0722][index], 0);
    const a = luminance(painted), b = luminance(bg);
    const bounds = element.getBoundingClientRect(), container = row.getBoundingClientRect();
    const extent = parseFloat(style.outlineWidth) + parseFloat(style.outlineOffset);
    return {visible: element.matches(':focus-visible'), style: style.outlineStyle,
      width: parseFloat(style.outlineWidth), backgroundAlpha: bg[3],
      contrast: (Math.max(a, b) + .05) / (Math.min(a, b) + .05),
      fits: bounds.left - extent >= container.left && bounds.right + extent <= container.right
        && bounds.top - extent >= container.top && bounds.bottom + extent <= container.bottom};
  });
  expect(evidence.visible).toBe(true);
  expect(evidence.style).not.toBe('none');
  expect(evidence.width).toBeGreaterThanOrEqual(2);
  expect(evidence.backgroundAlpha).toBe(1);
  expect(evidence.contrast).toBeGreaterThanOrEqual(3);
  expect(evidence.fits).toBe(true);
  await testInfo.attach('ranking-focus-contrast.json', {
    body: JSON.stringify({scope: 'one rendered ranking-history action on its opaque row surface',
      project: testInfo.project.name, evidence}, null, 2), contentType: 'application/json'
  });
});
