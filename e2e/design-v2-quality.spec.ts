import {expect, test} from './fixtures';
import {
  mockSpotify,
  seedAuthenticatedBrowser
} from './helpers/authenticated-browser';

const widths = [320, 375, 430, 500, 768, 1024, 1440] as const;

test('decorative icons use a non-blocking loaded font face', async ({page}) => {
  await page.goto('/login');
  await expect(page.locator('.pi:visible').first()).toBeVisible();
  const faces = await page.evaluate(async () => {
    const icon = document.querySelector('.pi')!;
    const family = getComputedStyle(icon).fontFamily;
    if (family.replace(/["']/g, '') !== 'AnalytifyIcons') throw new Error(`Unexpected icon face: ${family}`);
    await document.fonts.load(`16px ${family}`);
    return [...document.fonts].filter(face => face.family.replace(/["']/g, '') === 'AnalytifyIcons'
      && face.status === 'loaded').map(face => ({display: face.display, status: face.status}));
  });
  expect(faces.length).toBeGreaterThan(0);
  expect(faces.every(face => face.display === 'swap')).toBe(true);
});

test.beforeEach(async ({page}) => {
  await mockSpotify(page);
  await seedAuthenticatedBrowser(page, {cloudIdentity: true});
});

test('the temporary /new compatibility URL resolves to the canonical route', async ({page}) => {
  await page.goto('/new/playlists?source=bookmark#library');
  await expect(page).toHaveURL(/\/playlists\?source=bookmark#library$/);
  await expect(page.getByRole('heading', {name: 'Your playlists', exact: true})).toBeVisible();
});

test('the shared shell and representative dense content reflow at every release width', async ({page}) => {
  await page.goto('/playlists');
  await expect(page.getByRole('heading', {name: 'Your playlists', exact: true})).toBeVisible();
  for (const width of widths) {
    await page.setViewportSize({width, height: 900});
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow, `${width}px must not overflow horizontally`).toBeLessThanOrEqual(1);
    await expect(page.locator('app-design-v2-shell')).toHaveCount(1);
  }
});

test('200% text enlargement preserves the primary task and does not create horizontal overflow', async ({page}) => {
  await page.setViewportSize({width: 768, height: 900});
  await page.goto('/playlists');
  await page.evaluate(() => { document.documentElement.style.fontSize = '200%'; });
  await expect(page.getByRole('searchbox', {name: 'Search your playlists'})).toBeVisible();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(1);
});

test('mobile fixed navigation does not obscure the last task region', async ({page}) => {
  await page.setViewportSize({width: 320, height: 640});
  await page.goto('/playlists');
  const card = page.locator('.v2-playlist-card').last();
  await expect(card).toBeVisible();
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  // The shell uses native smooth scrolling. Evaluate settled clearance rather
  // than an engine-dependent intermediate animation frame.
  await expect.poll(async () => {
    const cardBox = await card.boundingBox();
    const navBox = await page.getByRole('navigation', {name: 'Primary navigation'}).boundingBox();
    expect(cardBox).not.toBeNull();
    expect(navBox).not.toBeNull();
    return cardBox!.y + cardBox!.height - navBox!.y;
  }).toBeLessThanOrEqual(0);
});
