import {writeFile} from 'node:fs/promises';
import {test, expect} from './fixtures';
import {expectNoBlockingAxeViolations, mockSpotify, seedAuthenticatedBrowser} from './helpers/authenticated-browser';

const categories = ['Songs', 'Artists', 'Genres'] as const;
const periods = [['4 weeks', 'short_term'], ['6 months', 'medium_term'], ['1 year', 'long_term']] as const;

for (const shared of [false, true]) for (const reducedMotion of ['no-preference', 'reduce'] as const) {
  test(`Stats content composition preserves ${shared ? 'shared' : 'owner'} workflows (${reducedMotion})`, async ({page}, testInfo) => {
    await page.clock.setFixedTime(new Date('2026-10-06T12:00:00Z'));
    await page.emulateMedia({reducedMotion});
    await mockSpotify(page);
    await seedAuthenticatedBrowser(page);
    const sharedRequests: unknown[] = [];
    await page.route('https://tmmhylpexbubyznlizfs.supabase.co/**', route => {
      if (new URL(route.request().url()).pathname === '/rest/v1/rpc/get_shared_stats_snapshot') {
        const body = route.request().postDataJSON(); sharedRequests.push(body);
        return route.fulfill({json: {ownerUserId: 'shared-owner', ownerDisplayName: 'Alex', snapshotDate: '2026-10-04',
          topTracks: [{id: 'shared-song', name: `Shared Song ${body.p_range}`, artists: [{name: 'Shared Artist'}], album: {images: []}, external_urls: {spotify: 'https://open.spotify.com/track/shared-song'}}],
          topArtists: [{id: 'shared-artist', name: `Shared Artist ${body.p_range}`, images: [], external_urls: {spotify: 'https://open.spotify.com/artist/shared-artist'}}],
          topGenres: [{name: `Shared genre ${body.p_range}`, weight: 100}]}});
      }
      return route.fulfill({json: []});
    });
    if (shared) { await page.goto('/new/stats'); await expect(page.getByRole('heading', {name: 'Your top listening', exact: true})).toBeVisible(); await expect(page.getByRole('main').getByText('Test Song', {exact: true})).toBeVisible(); }
    await page.goto(shared ? '/new/stats/shared-owner' : '/new/stats');
    const main = page.getByRole('main');
    await expect(main.locator('v2-stats-ranking-row')).toHaveCount(1);
    await page.evaluate(() => document.fonts.ready);
    expect.soft(await main.getByRole('button', {name: 'Back', exact: true}).count()).toBe(shared ? 1 : 0);
    const evidence = [];
    for (const width of [320,390,760,761,1440,1920]) for (const height of [480,1080]) {
      await page.setViewportSize({width, height});
      await expect.poll(() => page.evaluate(() => ({width: innerWidth, compact: matchMedia('(max-width: 760px)').matches}))).toEqual({width, compact: width <= 760});
      await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
      const measured = await main.evaluate(element => {
        const heading = element.querySelector('h1')!, header = heading.closest('header')!;
        const description = element.querySelector('.v2-page__description')!;
        const sections = element.querySelector('.v2-page__sections')!, controls = element.querySelector('.stats-choice-controls')!;
        const titleStyle = getComputedStyle(heading), descriptionStyle = getComputedStyle(description);
        const headerBox = header.getBoundingClientRect(), controlBox = controls.getBoundingClientRect();
        const categoryHeading = element.querySelector('.stats-results-heading');
        const headingStyle = categoryHeading ? getComputedStyle(categoryHeading) : null;
        const resultGroup = element.querySelector('.stats-resolved-results');
        const back = element.querySelector<HTMLButtonElement>('.v2-page__back'), backImage = back?.querySelector('img');
        const create = element.querySelector<HTMLButtonElement>('.stats-create-playlist'), actionGroup = element.querySelector('.stats-playlist-action');
        const actionBox = create?.getBoundingClientRect(), groupBox = actionGroup?.getBoundingClientRect();
        return {title: heading.textContent, fontSize: parseFloat(titleStyle.fontSize), lineHeight: parseFloat(titleStyle.lineHeight), letterSpacing: titleStyle.letterSpacing,
          eyebrow: element.querySelector('.v2-page__eyebrow')?.textContent ?? '',
          description: description.textContent, descriptionVisible: description.getBoundingClientRect().height > 0,
          descriptionFont: parseFloat(descriptionStyle.fontSize), descriptionLine: parseFloat(descriptionStyle.lineHeight),
          headingToControls: controlBox.top - headerBox.bottom, contentGap: parseFloat(getComputedStyle(sections).rowGap),
          categoryHeading: categoryHeading?.textContent?.trim() ?? '', categoryFont: headingStyle ? parseFloat(headingStyle.fontSize) : null,
          categoryLine: headingStyle ? parseFloat(headingStyle.lineHeight) : null, resultGap: resultGroup ? parseFloat(getComputedStyle(resultGroup).rowGap) : null,
          back: back ? {width: back.offsetWidth, height: back.offsetHeight, imageWidth: backImage?.width, imageHeight: backImage?.height, naturalWidth: backImage?.naturalWidth, naturalHeight: backImage?.naturalHeight} : null,
          create: create && actionBox && groupBox ? {label: create.textContent?.trim(), width: create.offsetWidth, height: create.offsetHeight,
            centered: Math.abs((actionBox.left + actionBox.right) / 2 - (groupBox.left + groupBox.right) / 2) <= 1 / 60,
            icon: create.querySelector('i')?.className, iconWidth: create.querySelector('i')?.getBoundingClientRect().width} : null,
          pageWidth: element.querySelector('.v2-page')!.getBoundingClientRect().width, availableWidth: element.getBoundingClientRect().width,
          overflow: document.documentElement.scrollWidth - innerWidth};
      });
      evidence.push({width, height, ...measured});
      const evidencePath = testInfo.outputPath('stats-content-composition.json');
      await writeFile(evidencePath, JSON.stringify(evidence, null, 2));
      if (height === 1080 && [390,1440].includes(width)) await main.locator('.v2-page').screenshot({path: testInfo.outputPath(`stats-content-${width}.png`), animations: 'disabled'});
      expect.soft(measured.title).toBe(shared ? 'Alex · Listening stats' : 'Your top listening');
      expect.soft(measured.eyebrow).toBe('');
      expect.soft(measured.fontSize).toBe(width <= 760 ? 28 : 36);
      expect.soft(measured.lineHeight).toBe(width <= 760 ? 36 : 44);
      expect.soft(measured.letterSpacing).toBe('normal');
      expect.soft(measured.descriptionVisible).toBe(width > 760);
      expect.soft(measured.description).toBe(shared ? 'Read-only listening snapshot · Refreshed 4 October' : 'Your songs, artists and genres, ranked over time.');
      expect.soft(measured.descriptionFont).toBe(16);
      expect.soft(measured.descriptionLine).toBe(24);
      expect.soft(measured.headingToControls).toBe(width <= 760 ? 12 : 16);
      expect.soft(measured.contentGap).toBe(width <= 760 ? 12 : 16);
      expect.soft(measured.categoryHeading).toBe('Top songs');
      expect.soft(measured.categoryFont).toBe(20); expect.soft(measured.categoryLine).toBe(28); expect.soft(measured.resultGap).toBe(16);
      expect.soft(measured.back).toEqual(shared ? {width: 92, height: 44, imageWidth: 18, imageHeight: 18, naturalWidth: 18, naturalHeight: 18} : null);
      expect.soft(measured.create).toEqual(shared ? null : {label: 'Create playlist from these songs', width: 240, height: 48, centered: true, icon: 'pi pi-list', iconWidth: 18});
      expect.soft(measured.pageWidth).toBe(width <= 760 ? width - 32 : Math.min(measured.availableWidth, 1120));
      expect.soft(measured.overflow).toBeLessThanOrEqual(1);
    }
    await testInfo.attach('stats-content-composition.json', {path: testInfo.outputPath('stats-content-composition.json'), contentType: 'application/json'});
    for (const [label, range] of periods) {
      await page.getByRole('group', {name: 'Ranking period'}).getByRole('button', {name: label, exact: true}).click();
      for (const category of categories) {
        await page.getByRole('group', {name: 'Ranking category'}).getByRole('button', {name: category, exact: true}).click();
        const expectedName = shared ? `${category === 'Songs' ? 'Shared Song' : category === 'Artists' ? 'Shared Artist' : 'Shared genre'} ${range}` : category === 'Songs' ? 'Test Song' : category === 'Artists' ? 'Test Artist' : 'pop';
        await expect(main.getByText(expectedName, {exact: category !== 'Genres'}).first()).toBeVisible();
        expect.soft(await main.evaluate(element => element.querySelector('.stats-results-heading')?.textContent ?? '')).toBe(`Top ${category.toLowerCase()}`);
        if (shared) {
          await expect(main.getByRole('button', {name: /View position history|Compare dates|Create playlist/})).toHaveCount(0);
          await expect(main.getByRole('switch', {name: 'Search past rankings'})).toHaveCount(0);
        }
        const search = main.getByRole('searchbox');
        await search.fill('definitely missing');
        await expect(main.getByRole('heading', {name: category === 'Songs' ? 'No top songs found' : category === 'Artists' ? 'No top artists found' : 'No genre data found', exact: true})).toBeVisible();
        await search.fill('');
        await expect(main.getByText(expectedName, {exact: category !== 'Genres'}).first()).toBeVisible();
      }
    }
    if (shared) expect(sharedRequests).toEqual(periods.map(([,p_range]) => ({p_owner_user_id: 'shared-owner', p_range})));
    await expectNoBlockingAxeViolations(page);
    if (shared) {
      await main.getByRole('button', {name: 'Back', exact: true}).press('Enter');
      await expect(page).toHaveURL(/\/new\/stats$/);
      await expect(page.getByRole('heading', {name: 'Your top listening', exact: true})).toBeVisible();
      await expect(page.getByRole('main').getByText('Test Song', {exact: true})).toBeVisible();
    }
  });
}

for (const reducedMotion of ['no-preference', 'reduce'] as const) {
  test(`shared range loading, permission failure and recovery replace stale rankings (${reducedMotion})`, async ({page}) => {
    await page.clock.setFixedTime(new Date('2026-10-06T12:00:00Z'));
    await page.emulateMedia({reducedMotion});
    await mockSpotify(page); await seedAuthenticatedBrowser(page);
    let releaseMedium!: () => void;
    const mediumReady = new Promise<void>(resolve => releaseMedium = resolve);
    let longCalls = 0;
    await page.route('https://tmmhylpexbubyznlizfs.supabase.co/**', async route => {
      if (new URL(route.request().url()).pathname !== '/rest/v1/rpc/get_shared_stats_snapshot') return route.fulfill({json: []});
      const range = route.request().postDataJSON().p_range;
      if (range === 'medium_term') await mediumReady;
      if (range === 'long_term' && ++longCalls === 1) return route.fulfill({status: 403, json: {message: 'Permission denied for the isolated shared range.'}});
      return route.fulfill({json: {ownerUserId: 'shared-owner', ownerDisplayName: 'Alex', snapshotDate: '2026-10-04',
        topTracks: [{id: 'shared-song', name: `Shared Song ${range}`, artists: [], album: {images: []}}], topArtists: [], topGenres: []}});
    });
    await page.goto('/new/stats/shared-owner');
    const main = page.getByRole('main'), period = page.getByRole('group', {name: 'Ranking period'});
    await expect(main.getByText('Shared Song short_term', {exact: true})).toBeVisible();
    await period.getByRole('button', {name: '6 months', exact: true}).click();
    await expect(main.getByRole('heading', {name: 'Loading shared Spotify insights…', exact: true})).toBeVisible();
    await expect(main.getByText('Shared Song short_term', {exact: true})).toHaveCount(0);
    await expect(main.locator('.stats-results-heading')).toHaveCount(0);
    releaseMedium();
    await expect(main.getByText('Shared Song medium_term', {exact: true})).toBeVisible();
    await expect(main.getByRole('heading', {name: 'Loading shared Spotify insights…', exact: true})).toHaveCount(0);
    await period.getByRole('button', {name: '1 year', exact: true}).click();
    await expect(main.getByRole('heading', {name: 'Shared stats unavailable', exact: true})).toBeVisible();
    await expect(main.getByRole('alert')).toContainText('Permission denied');
    await expect(main.getByText('Shared Song medium_term', {exact: true})).toHaveCount(0);
    await expect(main.locator('.stats-results-heading')).toHaveCount(0);
    await period.getByRole('button', {name: '6 months', exact: true}).click();
    await expect(main.getByText('Shared Song medium_term', {exact: true})).toBeVisible();
    await period.getByRole('button', {name: '1 year', exact: true}).click();
    await expect(main.getByText('Shared Song long_term', {exact: true})).toBeVisible();
    await expect(main.getByRole('alert')).toHaveCount(0);
    await expect(main.getByRole('heading', {name: 'Top songs', exact: true})).toBeVisible();
    await expect(main.getByRole('button', {name: /View position history|Compare dates|Create playlist/})).toHaveCount(0);
    expect(longCalls).toBe(2);
    await expectNoBlockingAxeViolations(page);
  });
}
