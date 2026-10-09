import type {Locator, TestInfo} from '@playwright/test';
import {writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {test, expect} from './fixtures';
import {expectNoBlockingAxeViolations, mockSpotify, seedAuthenticatedBrowser} from './helpers/authenticated-browser';

const canonicalArtworkUrl='http://127.0.0.1:4200/new/__e2e-canonical-stats-artwork.png';
async function mockCanonicalArtwork(page: import('@playwright/test').Page): Promise<void> {
  await page.route(canonicalArtworkUrl,route=>route.fulfill({path:join(__dirname,'assets/canonical-stats-artwork.png'),contentType:'image/png'}));
}

const tracks = Array.from({length: 30}, (_, rank) => ({
  id: `known-${rank}`, name: `Known song ${rank}`, artists: [{id: 'artist', name: 'Example Artist'}],
  album: {images: []}, external_urls: {spotify: `https://open.spotify.com/track/known-${rank}`}
}));
const artists = Array.from({length: 30}, (_, rank) => ({id: `artist-${rank}`, name: `Artist ${rank}`, images: [],
  external_urls: {spotify: `https://open.spotify.com/artist/artist-${rank}`}}));
const currentTracks = [{...tracks[0], id: 'debut', name: 'Debut song'}, tracks[16], tracks[2]];
const currentArtists = [{id: 'debut-artist', name: 'Debut artist', images: []}, artists[16], artists[2]];

async function clearCurrentFixtureStats(page: import('@playwright/test').Page): Promise<void> {
  // Remove only this test account's disposable current cache; keep comparison
  // snapshots and authentication so the real refresh path loads the new DTOs.
  await page.evaluate(async () => {
    await new Promise<void>((resolve,reject) => {
      const request=indexedDB.open('AnalytifyDB',4);
      request.onerror=()=>reject(request.error);
      request.onsuccess=()=>{
        const db=request.result;
        const transaction=db.transaction(['appData','featureData'],'readwrite');
        for(const user of ['e2e-user','e2e-user_dev']) for(const part of ['tracks','artists','genres','lastUpdated']) {
          const key=`${user}_stats_short_term_${part}`;
          transaction.objectStore('appData').delete(key);
          transaction.objectStore('featureData').delete(key);
        }
        transaction.oncomplete=()=>{db.close();resolve();};
        transaction.onerror=()=>reject(transaction.error);
      };
    });
  });
}

async function expectIntrinsicHistory(history: Locator): Promise<void> {
  const geometry=await history.evaluate(element=>{
    const text=document.createRange();text.selectNodeContents(element);
    const bounds=element.getBoundingClientRect();
    return {width:bounds.width,height:bounds.height,textWidth:text.getBoundingClientRect().width};
  });
  // Canonical text plus 12px on each side, with borders inset into that space.
  expect(geometry.width).toBeCloseTo(geometry.textWidth+24,1);
  expect(geometry.height).toBe(44);
}

async function recordCanonicalRow(row: Locator, testInfo: TestInfo, name: string): Promise<void> {
  await row.page().evaluate(() => document.fonts.ready);
  await expect(row).toHaveCSS('background-color', 'rgb(18, 24, 20)');
  await expect(row).toHaveCSS('padding-left', '16px');
  await expect(row.locator('strong')).toHaveCSS('font-family', /^"?Outfit Variable"?, sans-serif$/);
  expect(await row.page().evaluate(() => [...document.fonts].some(font =>
    font.family.replace(/["']/g, '') === 'Outfit Variable' && font.status === 'loaded'))).toBe(true);
  const history=row.getByRole('button',{name:/^View position history for/});
  await expectIntrinsicHistory(history);
  await expect(history).toHaveCSS('height','44px');
  await expect(history).toHaveCSS('font-size','14px');
  await expect(history).toHaveCSS('font-weight','600');
  await expect(history).toHaveCSS('line-height','20px');
  await expect(history).toHaveCSS('background-color','rgb(13, 19, 15)');
  await expect(history).toHaveCSS('border-top-color','rgb(52, 66, 58)');
  // Require the designed visible geometry before recording parity evidence.
  await expect.poll(() => row.evaluate(element => element.getBoundingClientRect().height)).toBe(80);
  const rendering = await row.evaluate(element => {
    const bounds = element.getBoundingClientRect();
    const ancestors = [];
    for (let current: Element | null = element; current; current = current.parentElement) {
      const style = getComputedStyle(current);
      ancestors.push({tag: current.tagName, classes: current.className, opacity: style.opacity,
        filter: style.filter, background: style.backgroundColor, shadow: style.boxShadow,
        zIndex: style.zIndex});
    }
    const image = element.querySelector('img')!;
    return {bounds: bounds.toJSON(), ancestors, artwork: {
      src: image.currentSrc, complete: image.complete, naturalWidth: image.naturalWidth,
      background: getComputedStyle(image.parentElement!).backgroundColor
    }};
  });
  expect(rendering.artwork.complete).toBe(true);
  expect(rendering.artwork.naturalWidth).toBeGreaterThan(0);
  expect(rendering.bounds.height).toBe(80);
  expect(rendering.bounds.width).toBe(row.page().viewportSize()!.width === 390 ? 358 : 1120);
  const evidencePath = testInfo.outputPath(`${name}-rendering.json`);
  await writeFile(evidencePath, JSON.stringify(rendering, null, 2));
  await testInfo.attach(`${name}-rendering.json`, {path: evidencePath, contentType: 'application/json'});
}

test.beforeEach(async ({page}) => {
  await page.clock.setFixedTime(new Date('2026-10-06T12:00:00Z'));
  await mockSpotify(page);
  await seedAuthenticatedBrowser(page);
  await page.evaluate(async ({tracks, artists}) => {
    await new Promise<void>((resolve, reject) => {
      const request = indexedDB.open('AnalytifyDB', 4);
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const db = request.result;
        const transaction = db.transaction('statsHistory', 'readwrite');
        for (const userId of ['e2e-user', 'e2e-user_dev']) {
          transaction.objectStore('statsHistory').put({userId, range: 'short_term',
            timestamp: new Date('2026-10-05T12:00:00Z').getTime(), snapshotDate: '2026-10-05',
            topTracks: tracks, topArtists: artists, topGenres: [], isLoaded: true});
        }
        transaction.oncomplete = () => {db.close(); resolve();};
        transaction.onerror = () => reject(transaction.error);
      };
    });
  }, {tracks, artists});
  await page.route('https://api.spotify.com/v1/me/top/tracks?*', route => route.fulfill({json: {items: currentTracks, total: 3}}));
  await page.route('https://api.spotify.com/v1/me/top/artists?*', route => route.fulfill({json: {items: currentArtists, total: 3}}));
  await page.goto('/new/stats');
  await expect(page.getByRole('button',{name:'Compare dates',exact:true})).toBeVisible();
  await expect(page.getByRole('img', {name: 'Top 10 debut', exact: true})).toHaveCount(1);
  await expect(page.getByRole('img', {name: 'Hot mover', exact: true})).toHaveCount(1);
});

test('canonical flame timeline loops without moving controls and stops on preference changes', async ({page}, testInfo) => {
  await page.emulateMedia({reducedMotion: 'no-preference'});
  const flames = page.locator('.v2-ranking-row v2-ranking-flame svg');
  await expect(flames).toHaveCount(2);
  await expect.poll(() => flames.first().evaluate(element => element.getAnimations().length)).toBe(3);
  // Observe the native clock across a full loop before seeking deterministic
  // keyframes. A paused style sample alone would not prove the loop runs.
  const start = await flames.first().evaluate(element => Number(element.getAnimations()[0].currentTime));
  await expect.poll(() => flames.first().evaluate(element => Number(element.getAnimations()[0].currentTime)), {timeout: 5000}).toBeGreaterThan(start + 2000);
  const evidence = [];
  for (const width of [390, 1440]) {
    await page.setViewportSize({width, height: 480});
    const rows = page.locator('.v2-ranking-row');
    const stable = await rows.evaluateAll(elements => elements.slice(0, 2).map(element => {
      const rank = element.querySelector('.rank-number')!.getBoundingClientRect();
      const history = element.querySelector('.v2-ranking-history')!.getBoundingClientRect();
      return {rank: {x: rank.x + scrollX, y: rank.y + scrollY}, history: {x: history.x + scrollX, y: history.y + scrollY}};
    }));
    for (const [time, opacity, rotate, scaleY] of [[0, 1, 0, 1], [100, .979334, .004521, 1.011625], [400, .84, .035, 1.09], [800, .96, -.026, .96], [1200, .88, .017, 1.04], [1600, 1, 0, 1], [2000, 1, 0, 1], [2400, .84, .035, 1.09]]) {
      const samples = await flames.evaluateAll((elements, time) => elements.map(element => {
        const animations = element.getAnimations();
        animations.forEach(animation => {animation.pause(); animation.currentTime = time;});
        const style = getComputedStyle(element);
        const matrix = new DOMMatrixReadOnly(style.transform);
        const bounds = element.getBoundingClientRect();
        return {label: element.getAttribute('aria-label'), opacity: Number(style.opacity), rotate: Math.atan2(matrix.b, matrix.a),
          scaleY: Number(style.scale.split(' ')[1] || style.scale), width: bounds.width, height: bounds.height,
          durations: animations.map(animation => animation.effect!.getTiming().duration), iterations: animations.map(animation => animation.effect!.getTiming().iterations === Infinity)};
      }), time);
      for (const sample of samples) {
        expect(sample.opacity).toBeCloseTo(opacity, 4);
        expect(sample.rotate).toBeCloseTo(rotate, 4);
        expect(sample.scaleY).toBeCloseTo(scaleY, 4);
        expect(sample.durations).toEqual([2000, 2000, 2000]);
        expect(sample.iterations).toEqual([true, true, true]);
        expect(sample.width).toBeGreaterThanOrEqual(48);
        expect(sample.width).toBeLessThan(51);
        expect(sample.height).toBeGreaterThan(46);
        expect(sample.height).toBeLessThan(55);
      }
      const after = await rows.evaluateAll(elements => elements.slice(0, 2).map(element => {
        const rank = element.querySelector('.rank-number')!.getBoundingClientRect();
        const history = element.querySelector('.v2-ranking-history')!.getBoundingClientRect();
        return {rank: {x: rank.x + scrollX, y: rank.y + scrollY}, history: {x: history.x + scrollX, y: history.y + scrollY}};
      }));
      for (let index = 0; index < stable.length; index++) for (const control of ['rank', 'history'] as const) for (const coordinate of ['x', 'y'] as const) {
        // Firefox serializes fractional viewport+scroll sums with ~3e-5px
        // rounding differences. This tolerance is below 0.00005px.
        expect(after[index][control][coordinate]).toBeCloseTo(stable[index][control][coordinate], 4);
      }
      evidence.push({width, time, samples});
      if (time === 400) for (const [index, kind] of ['debut', 'hot'].entries()) {
        const row = rows.nth(index);
        await row.evaluate(async element => {
          element.scrollIntoView({block: 'center'});
          await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
        });
        // Native capture must include the painted controls, rather than a row
        // still underneath mobile navigation after screenshot auto-scrolling.
        const action = row.getByRole('button', {name: /^View position history for/});
        await expect.poll(() => action.evaluate(element => {
          const bounds = element.getBoundingClientRect();
          return element.contains(document.elementFromPoint(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2));
        })).toBe(true);
        await row.screenshot({path: testInfo.outputPath(`flame-motion-${kind}-${width}-400ms.png`)});
      }
    }
  }
  await page.emulateMedia({reducedMotion: 'reduce'});
  for (const flame of await flames.all()) {
    await expect(flame).toHaveCSS('animation-name', 'none');
    await expect(flame).toHaveCSS('opacity', '1');
    // Media-query style changes and cancellation of previously paused native
    // animations can settle in separate browser frames. Require cancellation,
    // rather than sampling the animation list only once during that boundary.
    await expect.poll(() => flame.evaluate(element => element.getAnimations().length)).toBe(0);
    expect(await flame.evaluate(element => ({width: element.getBoundingClientRect().width, height: element.getBoundingClientRect().height}))).toEqual({width: 48, height: 48});
  }
  await page.emulateMedia({reducedMotion: 'no-preference'});
  await expect.poll(() => flames.first().evaluate(element => element.getAnimations().filter(animation => animation.playState === 'running').length)).toBe(3);
  await expectNoBlockingAxeViolations(page);
  await writeFile(testInfo.outputPath('flame-canonical-motion.json'), JSON.stringify(evidence, null, 2));
});

for (const motion of ['no-preference', 'reduce'] as const) {
  test(`snapshot classifications survive filtering, categories and responsive resizing with motion ${motion}`, async ({page}, testInfo) => {
    await page.emulateMedia({reducedMotion: motion});
    const evidence = [];
    for (const width of [320, 360, 390, 768, 1024, 1440, 1920]) {
      for (const height of [480, 1080]) {
        await page.setViewportSize({width, height});
        const row = page.locator('.v2-ranking-row').first();
        const geometry = await row.evaluate(element => {
          const art = element.querySelector('.v2-ranking-art')!.getBoundingClientRect();
          const flame = element.querySelector('svg')!.getBoundingClientRect();
          const rank = element.querySelector('.rank')!.getBoundingClientRect();
          const action = element.querySelector('.v2-ranking-history')!.getBoundingClientRect();
          return {overflow: document.documentElement.scrollWidth - innerWidth,
            icon: {width: Number.parseFloat(getComputedStyle(element.querySelector('svg')!).width), height: Number.parseFloat(getComputedStyle(element.querySelector('svg')!).height)}, paintedIcon: {width: flame.width, height: flame.height}, action: {width: action.width, height: action.height},
            rankWidth:rank.width, ordered: flame.right <= rank.right && rank.right <= art.left && art.right <= action.left,
            iconAnimation: getComputedStyle(element.querySelector('svg')!).animationName};
        });
        expect(geometry.overflow).toBeLessThanOrEqual(1);
        expect(geometry.icon).toEqual({width: 48, height: 48});
        expect(geometry.rankWidth).toBe(76);
        expect(geometry.action.width).toBeGreaterThanOrEqual(44);
        expect(geometry.action.height).toBeGreaterThanOrEqual(44);
        expect(geometry.ordered).toBe(true);
        if (motion === 'reduce') {
          expect(geometry.paintedIcon).toEqual({width: 48, height: 48});
          expect(geometry.iconAnimation).toBe('none');
        } else {
          expect(geometry.paintedIcon.width).toBeGreaterThanOrEqual(48);
          expect(geometry.paintedIcon.width).toBeLessThan(51);
          expect(geometry.paintedIcon.height).toBeGreaterThan(46);
          expect(geometry.paintedIcon.height).toBeLessThan(55);
          expect(geometry.iconAnimation).toMatch(/flame-opacity.*flame-rotation.*flame-scale/);
        }
        evidence.push({width, height, ...geometry});
      }
    }
    const search = page.getByRole('searchbox', {name: 'Search songs or artists'});
    await search.fill('Known song 16');
    await expect(page.locator('.v2-ranking-row')).toHaveCount(1);
    await expect(page.locator('.v2-ranking-copy strong')).toHaveText('Known song 16');
    await expect(page.getByRole('group',{name:'Rank 2. ↑ 15 places',exact:true})).toHaveCount(1);
    await expect(page.getByRole('img', {name: 'Hot mover', exact: true})).toHaveCount(1);
    await expect(page.getByRole('img', {name: 'Top 10 debut', exact: true})).toHaveCount(0);
    const history = page.getByRole('button', {name: 'View position history for Known song 16'});
    await history.press('Enter');
    await expect(page.getByRole('dialog')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(history).toBeFocused();
    await search.fill('');
    await page.getByRole('button', {name: 'Artists', exact: true}).click();
    await expect(page.getByRole('img', {name: 'Top 10 debut', exact: true})).toHaveCount(1);
    await expect(page.getByRole('img', {name: 'Hot mover', exact: true})).toHaveCount(1);
    for (const width of [320, 360, 390, 768, 1024, 1440, 1920]) {
      for (const height of [480, 1080]) {
        await page.setViewportSize({width, height});
        const geometry = await page.locator('.v2-ranked-artist').first().evaluate(row => {
          const art = row.querySelector('.v2-artist-art')!.getBoundingClientRect();
          const flame = row.querySelector('svg')!.getBoundingClientRect();
          const rank = row.querySelector('.rank')!.getBoundingClientRect();
          const copy = row.querySelector('.v2-artist-copy')!.getBoundingClientRect();
          const history = row.querySelector('.v2-artist-history')!.getBoundingClientRect();
          return {overflow: document.documentElement.scrollWidth - innerWidth,
            art: {width: art.width, height: art.height}, history: {width: history.width, height: history.height},
            rankWidth:rank.width, ordered: flame.right <= rank.right && rank.right <= art.left && art.right <= copy.left && copy.right <= history.left};
        });
        expect(geometry.overflow).toBeLessThanOrEqual(1);
        expect(geometry.art).toEqual({width: 48, height: 48});
        expect(geometry.rankWidth).toBe(76);
        await expectIntrinsicHistory(page.locator('.v2-ranked-artist').first().locator('.history'));
        expect(geometry.ordered).toBe(true);
        evidence.push({category: 'artists', width, height, ...geometry});
      }
    }
    await page.setViewportSize({width: 390, height: 900});
    const artistSearch = page.getByRole('searchbox', {name: 'Search artists', exact: true});
    await artistSearch.fill('Artist 16');
    await expect(page.locator('.v2-ranked-artist')).toHaveCount(1);
    await expect(page.locator('.v2-artist-copy strong')).toHaveText('Artist 16');
    await expect(page.getByRole('group',{name:'Rank 2. ↑ 15 places',exact:true})).toHaveCount(1);
    const artistHistory = page.getByRole('button', {name: 'View position history for Artist 16'});
    await artistHistory.press('Enter');
    await expect(page.getByRole('dialog')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(artistHistory).toBeFocused();
    const artwork = page.getByRole('button', {name: 'Open Artist 16 on Spotify'});
    await page.keyboard.press('Shift+Tab');
    await expect(artwork).toBeFocused();
    const before = await artwork.boundingBox();
    await expect(artwork).toHaveCSS('border-top-color', 'rgb(53, 231, 131)');
    await artwork.hover();
    await expect(artwork).toHaveCSS('border-top-color', 'rgb(53, 231, 131)');
    expect(await artwork.boundingBox()).toEqual(before);
    await artistSearch.fill('');
    await expect(page.getByRole('button', {name: 'Open Debut artist on Spotify'})).toBeDisabled();
    await expectNoBlockingAxeViolations(page);
    const geometryPath=testInfo.outputPath('flame-responsive-geometry.json');
    await writeFile(geometryPath,JSON.stringify({motion,evidence},null,2)+'\n');
    await testInfo.attach('flame-responsive-geometry.json', {path:geometryPath,contentType:'application/json'});
  });
}

test.describe('static canonical row captures', () => {
  // Capture canonical colors after suppressing decorative motion from startup.
  // Normal and reduced motion remain covered by the resizing workflows above.
  test.use({reducedMotion: 'reduce'});
  test.beforeEach(async ({page}) => {
    await mockCanonicalArtwork(page);
    // Use canonical labels and sample artwork to compare the designed 80px row;
    // longer real-data labels are exercised by the separate reflow workflows.
    await page.route('https://api.spotify.com/v1/me/top/tracks?*',route=>route.fulfill({json:{items:[
      {...currentTracks[0],album:{images:[{url:canonicalArtworkUrl}]},name:'Midnight Drive',artists:[{id:'artist',name:'Neon Coast'}]},
      {...currentTracks[1],album:{images:[{url:canonicalArtworkUrl}]},name:'Paper Planes',artists:[{id:'artist',name:'Luma'}]},currentTracks[2]
    ],total:3}}));
    await page.route('https://api.spotify.com/v1/me/top/artists?*',route=>route.fulfill({json:{items:[
      {...currentArtists[0],images:[{url:canonicalArtworkUrl}],name:'Neon Coast'},{...currentArtists[1],images:[{url:canonicalArtworkUrl}],name:'Luma'},currentArtists[2]
    ],total:3}}));
    await clearCurrentFixtureStats(page);
    await page.reload();
    await expect(page.locator('.v2-ranking-row strong').first()).toHaveText('Midnight Drive');
  });

  for (const width of [390, 1440]) {
    test(`canonical artist row geometry at ${width}px`, async ({page}, testInfo) => {
      await page.setViewportSize({width, height: 900});
      await page.getByRole('button', {name: 'Artists', exact: true}).click();
      const row = page.locator('.v2-ranked-artist').nth(1);
      await row.evaluate(element => element.scrollIntoView({block: 'center'}));
      await expect(row.getByRole('button', {name: 'View position history for Luma'}))
        .toHaveCSS('border-top-color', 'rgb(52, 66, 58)');
      await recordCanonicalRow(row, testInfo, 'artist');
      await expect(row).toHaveScreenshot(`stats-artist-row-${width}.png`, {animations: 'disabled'});
    });
  }
  for (const width of [390, 1440]) {
    test(`canonical flame colors and placement at ${width}px`, async ({page}, testInfo) => {
      await page.setViewportSize({width, height: 900});
      await expect(page.getByRole('img', {name: 'Top 10 debut', exact: true})).toHaveCSS('fill', 'rgb(119, 184, 255)');
      await expect(page.getByRole('img', {name: 'Hot mover', exact: true})).toHaveCSS('fill', 'rgb(255, 155, 84)');
      await page.locator('.v2-ranking-row').first().evaluate(row => row.scrollIntoView({block: 'center'}));
      await recordCanonicalRow(page.locator('.v2-ranking-row').first(), testInfo, 'debut');
      await expect(page.locator('.v2-ranking-row').first()).toHaveScreenshot(`stats-debut-row-${width}.png`, {animations: 'disabled'});
      await page.locator('.v2-ranking-row').nth(1).evaluate(row => row.scrollIntoView({block: 'center'}));
      await recordCanonicalRow(page.locator('.v2-ranking-row').nth(1), testInfo, 'hot-mover');
      await expect(page.locator('.v2-ranking-row').nth(1)).toHaveScreenshot(`stats-hot-mover-row-${width}.png`, {animations: 'disabled'});
    });
  }
  for (const width of [390,1440]) {
    test(`canonical History action states retain geometry and keyboard recovery at ${width}px`,async({page},testInfo)=>{
      await page.setViewportSize({width,height:900});
      const row=page.locator('.v2-ranking-row').nth(1);
      await page.evaluate(()=>document.fonts.ready);
      await row.evaluate(element=>element.scrollIntoView({block:'center'}));
      const history=row.getByRole('button',{name:'View position history for Paper Planes'});
      const artwork=row.getByRole('button',{name:'Open Paper Planes on Spotify'});
      // Establish actionability before measuring; hover can legitimately scroll
      // a control away from the fixed mobile navigation.
      await history.hover();
      await page.mouse.move(0,0);
      await recordCanonicalRow(row,testInfo,'history-action-row');
      await expect(history).toHaveCSS('background-color','rgb(13, 19, 15)');
      await expect(history).toHaveCSS('border-top-color','rgb(52, 66, 58)');
      await expect(history).toHaveCSS('border-top-width','1px');
      const initial=await history.boundingBox();
      expect(initial?.height).toBe(44);await expectIntrinsicHistory(history);
      await history.hover();
      await expect(history).toHaveCSS('background-color','rgb(24, 32, 25)');
      await expect(history).toHaveCSS('border-top-color','rgb(107, 125, 113)');
      expect(await history.boundingBox()).toEqual(initial);
      await artwork.focus();await artwork.press('Tab');
      await expect(history).toBeFocused();
      await expect(history).toHaveCSS('border-top-width','2px');
      await expect(history).toHaveCSS('border-top-color','rgb(159, 255, 200)');
      await expect(history).toHaveCSS('background-color','rgb(18, 24, 20)');
      await expect(history).toHaveCSS('outline-style','none');
      await history.hover();
      await expect(history).toHaveCSS('border-top-width','2px');
      await expect(history).toHaveCSS('background-color','rgb(18, 24, 20)');
      expect(await history.boundingBox()).toEqual(initial);
      await history.press('Enter');
      await expect(page.getByRole('dialog',{name:'Paper Planes position history'})).toBeVisible();
      await page.keyboard.press('Escape');
      await expect(page.getByRole('dialog')).toHaveCount(0);
      await expect(history).toBeFocused();
      await expect(history).toHaveCSS('border-top-width','2px');
      await expectNoBlockingAxeViolations(page);
      await artwork.focus();await page.mouse.move(0,0);
      await expect(history).toHaveCSS('background-color','rgb(13, 19, 15)');
      await expect(history).toHaveScreenshot(`stats-history-action-default-${width}.png`,{animations:'disabled'});
      await history.hover();
      await expect(history).toHaveCSS('background-color','rgb(24, 32, 25)');
      await expect(history).toHaveScreenshot(`stats-history-action-hover-${width}.png`,{animations:'disabled'});
      await artwork.focus();await artwork.press('Tab');
      await expect(history).toHaveCSS('border-top-width','2px');
      await expect(history).toHaveScreenshot(`stats-history-action-focus-${width}.png`,{animations:'disabled'});
      const path=testInfo.outputPath('history-action-state-geometry.json');
      await writeFile(path,JSON.stringify({width,initial,final:await history.boundingBox()},null,2)+'\n');
      await testInfo.attach('history-action-state-geometry',{path,contentType:'application/json'});
    });
  }

});

test('song ranking artwork and History follow the canonical independent action workflow', async ({page}) => {
  await page.setViewportSize({width:390,height:900});
  await page.getByRole('searchbox',{name:'Search songs or artists'}).fill('Known song 16');
  const row=page.locator('.v2-ranking-row');
  const artwork=row.getByRole('button',{name:'Open Known song 16 on Spotify'});
  const history=row.getByRole('button',{name:'View position history for Known song 16'});
  await expect(artwork).toHaveCSS('width','48px');
  await expect(artwork).toHaveCSS('height','48px');
  await expect(history).toHaveText('History');
  await expectIntrinsicHistory(history);
  await expect(row.locator('strong')).toHaveText('Known song 16');
  await expect(row.locator('.copy span')).toHaveText('Example Artist');
  await expect(row.getByRole('group',{name:'Rank 2. ↑ 15 places',exact:true})).toBeVisible();
  await history.press('Enter');
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(history).toBeFocused();
  await page.keyboard.press('Shift+Tab');
  await expect(artwork).toBeFocused();
  const before=await artwork.boundingBox();
  await expect(artwork).toHaveCSS('border-top-color','rgb(53, 231, 131)');
  await expect(artwork).toHaveCSS('border-top-width','3px');
  await artwork.hover();
  expect(await artwork.boundingBox()).toEqual(before);
  await history.focus();
  await expect(artwork).toHaveCSS('border-top-color','rgb(53, 231, 131)');
  await expect(artwork).toHaveCSS('border-top-width','2px');
  expect(await artwork.boundingBox()).toEqual(before);
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expectNoBlockingAxeViolations(page);
});

for (const motion of ['no-preference','reduce'] as const) {
  test(`large original ranks wrap movement without shifting actions with motion ${motion}`, async ({page},testInfo) => {
    await page.emulateMedia({reducedMotion:motion});
    await mockCanonicalArtwork(page);
    const names=new Map([[50,'Paper Planes'],[100,'A remarkably long song title that remains readable at every playlist width'],[1000,'Thousandth boundary item']]);
    const items=Array.from({length:1000},(_,index)=>({...tracks[0],id:`boundary-${index+1}`,
      name:names.get(index+1) ?? `Boundary item ${index+1}`,album:{images:[{url:canonicalArtworkUrl}]},
      artists:[{id:'artist',name:index===49?'Luma':index===99?'Luma, Atlas North and featured collaborators':'Example Artist'}],
      external_urls:{spotify:`https://open.spotify.com/track/boundary-${index+1}`}}));
    const previous=items.filter((_,index)=>![49,99,999].includes(index));
    previous.unshift(items[99],items[999]);previous.splice(64,0,items[49]);
    await page.evaluate(async topTracks=>{
      await new Promise<void>((resolve,reject)=>{
        const request=indexedDB.open('AnalytifyDB',4);request.onerror=()=>reject(request.error);
        request.onsuccess=()=>{
          const db=request.result,transaction=db.transaction('statsHistory','readwrite');
          for(const userId of ['e2e-user','e2e-user_dev']) transaction.objectStore('statsHistory').put({userId,range:'short_term',
            timestamp:new Date('2026-10-05T12:00:00Z').getTime(),snapshotDate:'2026-10-05',
            topTracks,topArtists:[],topGenres:[],isLoaded:true});
          transaction.oncomplete=()=>{db.close();resolve();};transaction.onerror=()=>reject(transaction.error);
        };
      });
    },previous);
    await page.route('https://api.spotify.com/v1/me/top/tracks?*',route=>route.fulfill({json:{items,total:1000}}));
    await clearCurrentFixtureStats(page);await page.reload();await page.evaluate(()=>document.fonts.ready);
    const evidence=[];
    for(const [rank,name] of names) {
      await page.getByRole('searchbox',{name:'Search songs or artists'}).fill(name);
      const row=page.locator('.v2-ranking-row');
      if(rank===1000) {
        // Fresh Spotify Stats deliberately caps the deduplicated pool at 100.
        await expect(row).toHaveCount(0);
        await expect(page.getByRole('heading',{name:'No top songs found'})).toBeVisible();
        evidence.push({rank,sourceLimit:100,visibleRows:0});continue;
      }
      await expect(row).toHaveCount(1);
      const caption=rank===50?'↑ 15 places':rank===100?'↓ 99 places':'↓ 998 places';
      await expect(row.getByRole('group',{name:`Rank ${rank}. ${caption}`,exact:true})).toBeVisible();
      await expect(row.locator('.rank-number')).toHaveText(String(rank));
      await expect(row.locator('strong')).toHaveText(name);
      await expect(row.getByRole('img',{name:'Hot mover',exact:true})).toHaveCount(rank===50?1:0);
      for(const width of [320,360,390,760,761,768,1024,1440,1920]) for(const height of [480,1080]) {
        await page.setViewportSize({width,height});await row.scrollIntoViewIfNeeded();
        const geometry=await row.evaluate(element=>{
          const bounds=element.getBoundingClientRect(),column=element.querySelector('.rank')!.getBoundingClientRect();
          const number=element.querySelector('.rank-number')!.getBoundingClientRect();
          const movement=element.querySelector('.rank-movement')!.getBoundingClientRect();
          const art=element.querySelector('.artwork')!.getBoundingClientRect();
          const copy=element.querySelector('.copy')!.getBoundingClientRect();
          const action=element.querySelector('.history')!.getBoundingClientRect();
          return {row:bounds.toJSON(),column:column.toJSON(),number:number.toJSON(),movement:movement.toJSON(),
            ordered:column.right<=art.left&&art.right<=copy.left&&copy.right<=action.left,
            copyInset:getComputedStyle(element.querySelector('.copy')!).paddingLeft,
            overflow:document.documentElement.scrollWidth-innerWidth};
        });
        expect(geometry.column.width).toBe(76);expect(geometry.column.height).toBe(60);
        expect(geometry.number.height).toBe(36);expect(geometry.movement.height).toBe(24);
        expect(geometry.movement.top).toBeCloseTo(geometry.number.bottom,1);
        expect(geometry.number.left).toBeCloseTo(geometry.column.left+2,1);
        expect(geometry.movement.left).toBeCloseTo(geometry.number.left,1);
        expect(geometry.number.right).toBeLessThanOrEqual(geometry.column.right-4);
        expect(geometry.movement.right).toBeLessThanOrEqual(geometry.column.right-4);
        expect(geometry.row.height).toBeGreaterThanOrEqual(92);expect(geometry.ordered).toBe(true);
        expect(geometry.copyInset).toBe(width<=760?'0px':'16px');expect(geometry.overflow).toBeLessThanOrEqual(1);
        await expectIntrinsicHistory(row.locator('.history'));
        evidence.push({rank,width,height,...geometry});
      }
      if(motion==='reduce') for(const width of [390,1440]) {
        await page.setViewportSize({width,height:900});
        await row.evaluate(element=>element.scrollIntoView({block:'center',behavior:'instant'}));
        expect(await row.evaluate(element=>{
          const nav=document.querySelector('.v2-mobile-nav');
          return !nav?.getClientRects().length || element.getBoundingClientRect().bottom<=nav.getBoundingClientRect().top;
        })).toBe(true);
        await expect(row).toHaveScreenshot(`stats-large-rank-${rank}-${width}.png`,{animations:'disabled'});
      }
      const history=row.getByRole('button',{name:'View position history for '+name});
      await history.press('Enter');await expect(page.getByRole('dialog')).toBeVisible();
      await page.keyboard.press('Escape');await expect(history).toBeFocused();
    }
    await expectNoBlockingAxeViolations(page);
    const path=testInfo.outputPath('large-rank-responsive-geometry.json');
    await writeFile(path,JSON.stringify({motion,evidence},null,2)+'\n');
    await testInfo.attach('large-rank-responsive-geometry',{path,contentType:'application/json'});
  });

  test(`long ranking names grow without clipping controls or keyboard actions with motion ${motion}`, async ({page},testInfo) => {
    await page.emulateMedia({reducedMotion:motion});
    const name='An exceptionally long song title with several meaningful words and an extended version subtitle';
    const artist='A long artist collaboration with additional featured performers';
    await page.route('https://api.spotify.com/v1/me/top/tracks?*',route=>route.fulfill({json:{items:[
      {...currentTracks[1],name,artists:[{id:'artist',name:artist}]}
    ],total:1}}));
    await clearCurrentFixtureStats(page);
    await page.reload();
    const row=page.locator('.v2-ranking-row');
    await expect(row).toHaveCount(1);
    await expect(row.locator('strong')).toHaveText(name);
    const evidence=[];
    for(const width of [320,360,390,768,1024,1440,1920]) for(const height of [480,1080]) {
      await page.setViewportSize({width,height});
      const geometry=await row.evaluate(element=>{
        const bounds=element.getBoundingClientRect();
        const copy=element.querySelector('.copy')!.getBoundingClientRect();
        const art=element.querySelector('.artwork')!.getBoundingClientRect();
        const history=element.querySelector('.history')!.getBoundingClientRect();
        const style=getComputedStyle(element.querySelector('.copy')!);
        return {height:bounds.height,paddingBelowCopy:bounds.bottom-copy.bottom,paddingAboveCopy:copy.top-bounds.top,
          ordered:art.right<=copy.left&&copy.right<=history.left,
          overflow:document.documentElement.scrollWidth-innerWidth,
          copyOverflow:style.overflowY,textOverflow:style.textOverflow,
          artwork:{width:art.width,height:art.height},history:{width:history.width,height:history.height}};
      });
      expect(geometry.height).toBeGreaterThanOrEqual(80);
      expect(geometry.paddingBelowCopy).toBeGreaterThanOrEqual(15.9);
      expect(geometry.paddingAboveCopy).toBeGreaterThanOrEqual(15.9);
      expect(geometry.ordered).toBe(true);
      expect(geometry.overflow).toBeLessThanOrEqual(1);
      expect(geometry.copyOverflow).toBe('visible');expect(geometry.textOverflow).toBe('clip');
      expect(geometry.artwork).toEqual({width:48,height:48});
      await expectIntrinsicHistory(row.locator('.history'));
      await expect(row.locator('strong')).toHaveText(name);
      await expect(row.locator('.copy span')).toContainText(artist);
      evidence.push({width,height,...geometry});
    }
    await page.setViewportSize({width:320,height:480});
    const history=row.getByRole('button',{name:'View position history for '+name});
    await history.press('Enter');await expect(page.getByRole('dialog')).toBeVisible();
    await page.keyboard.press('Escape');await expect(history).toBeFocused();
    await page.keyboard.press('Shift+Tab');
    await expect(row.getByRole('button',{name:'Open '+name+' on Spotify'})).toBeFocused();
    await expectNoBlockingAxeViolations(page);
    const reflowPath=testInfo.outputPath('long-row-reflow.json');
    await writeFile(reflowPath,JSON.stringify({motion,evidence},null,2)+'\n');
    await testInfo.attach('long-row-reflow.json',{path:reflowPath,contentType:'application/json'});
  });
}
