import {test, expect} from './fixtures';
import {mockSpotify, seedAuthenticatedBrowser, expectNoBlockingAxeViolations} from './helpers/authenticated-browser';
import {writeFile} from 'node:fs/promises';
import type {Page, TestInfo} from '@playwright/test';

async function measureFeedback(page: Page, info: TestInfo, state: string) {
  await page.evaluate(() => document.fonts.ready);
  const samples = [];
  for (const width of [320, 390, 760, 761, 1440, 1920]) for (const height of [480, 1080]) {
    await page.setViewportSize({width, height});
    await expect.poll(() => page.evaluate(() => ({width: innerWidth, compact: matchMedia('(max-width:760px)').matches}))).toEqual({width, compact: width <= 760});
    await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
    const measured = await page.locator('v2-current-stats-feedback').first().evaluate(host => {
      const section = host.querySelector('section')!, style = getComputedStyle(section), bounds = section.getBoundingClientRect();
      const panel = host.querySelector('.loading-panel'), progress = host.querySelector<HTMLImageElement>('.progress');
      const button = host.querySelector('button'), title = host.querySelector('.title,strong');
      const slot = host.querySelector('.progress-slot');
      const slotBounds = slot?.getBoundingClientRect(), titleBounds = title?.getBoundingClientRect();
      const titleStyle = title ? getComputedStyle(title) : null;
      const panelStyle = panel ? getComputedStyle(panel) : null;
      return {width: bounds.width, padding: style.padding, gap: style.gap, radius: style.borderRadius, font: style.fontSize, line: style.lineHeight,
        titleFont: titleStyle?.fontSize, titleLine: titleStyle?.lineHeight, titleWeight: titleStyle?.fontWeight,
        progressSlot: slotBounds ? {width:slotBounds.width,height:slotBounds.height,gap:titleBounds ? titleBounds.left-slotBounds.right : null} : null,
        panel: panelStyle ? {padding: panelStyle.padding, gap: panelStyle.gap, border: panelStyle.borderTopWidth} : null,
        progress: progress ? {width: progress.getBoundingClientRect().width, height: progress.getBoundingClientRect().height, naturalWidth: progress.naturalWidth, naturalHeight: progress.naturalHeight, animation: getComputedStyle(progress).animationName} : null,
        buttonHeight: button?.getBoundingClientRect().height ?? null,
        skeletons: host.querySelectorAll('.skeleton-row').length,
        overflow: document.documentElement.scrollWidth - innerWidth,
        contentWidth: document.querySelector('.v2-page')!.getBoundingClientRect().width};
    });
    samples.push({width, height, ...measured});
    await writeFile(info.outputPath(`${state}-geometry.json`),JSON.stringify(samples,null,2));
    expect(measured.width).toBe(measured.contentWidth);
    expect(measured.padding).toBe('16px'); expect(measured.gap).toBe('12px'); expect(measured.radius).toBe('18px');
    expect(measured.font).toBe('14px'); expect(measured.line).toBe('20px');
    expect(measured.titleFont).toBe('14px'); expect(measured.titleLine).toBe('20px'); expect(measured.titleWeight).toBe('600');
    expect(measured.overflow).toBeLessThanOrEqual(1);
    if (state === 'loading') {
      expect(measured.panel).toEqual({padding:'24px', gap:'16px', border:'1px'}); expect(measured.skeletons).toBe(3);
      expect(measured.progressSlot).toEqual({width:20,height:20,gap:12});
      expect(measured.progress).toMatchObject({width:20, naturalWidth:20, animation:'none'});
      // SVG fractional intrinsic height is quantized to browser layout units (1/60 or 1/64px).
      expect(Math.abs(measured.progress!.height - 19.7753)).toBeLessThanOrEqual(1/60);
      // WebKit truncates the fractional SVG intrinsic metadata; Chromium/Firefox round up.
      // Actual rendered height and the exact 20px slot remain independently checked.
      expect(measured.progress!.naturalHeight).toBe(info.project.name === 'webkit-stats' ? 19 : 20);
    } else { expect(measured.panel).toBeNull(); expect(measured.skeletons).toBe(0); }
    expect(measured.buttonHeight).toBe(state === 'unavailable' ? 44 : null);
    if (height === 1080 && [390,1440].includes(width)) await page.locator('v2-current-stats-feedback').first().screenshot({path:info.outputPath(`${state}-${width}.png`)});
  }
  await writeFile(info.outputPath(`${state}-geometry.json`),JSON.stringify(samples,null,2));
}

for (const motion of ['no-preference', 'reduce'] as const) {
  test(`cold Spotify failure differs from empty rankings and offers recovery (${motion})`, async ({page}) => {
    await page.clock.setFixedTime(new Date('2026-10-06T12:00:00Z'));
    await page.emulateMedia({reducedMotion: motion}); await mockSpotify(page); await seedAuthenticatedBrowser(page);
    let failed = true;
    await page.route('https://api.spotify.com/v1/me/top/artists?*', route => failed
      ? route.fulfill({status: 503, headers: {'Retry-After': '0'}, json: {error: {status: 503, message: 'Isolated current Stats failure'}}})
      : route.fulfill({json: {items: [{id: 'recovered-artist', name: 'Recovered artist', genres: ['pop'], images: []}], total: 1}}));
    await page.goto('/new/stats');
    const main = page.getByRole('main');
    await expect(main.getByRole('alert')).toBeVisible({timeout: 12_000});
    await expect(main.getByRole('heading', {name: 'No top songs found', exact: true})).toHaveCount(0);
    await expect(main.locator('v2-stats-ranking-row')).toHaveCount(0);
    failed = false;
    await main.getByRole('button', {name: 'Retry', exact: true}).press('Enter');
    await expect(main.getByText('Test Song', {exact: true})).toBeVisible();
    await expect(main.getByRole('heading', {name:'Top songs', exact:true})).toBeFocused();
    await expect(main.getByRole('alert')).toHaveCount(0); await expectNoBlockingAxeViolations(page);
  });
}

test('successful empty Spotify responses produce an empty state without a failure alert', async ({page}) => {
  await page.clock.setFixedTime(new Date('2026-10-06T12:00:00Z')); await mockSpotify(page); await seedAuthenticatedBrowser(page);
  await page.route('https://api.spotify.com/v1/me/top/**', route => route.fulfill({json: {items: [], total: 0}}));
  await page.goto('/new/stats'); const main = page.getByRole('main');
  await expect(main.getByRole('heading', {name: 'No top songs found', exact: true})).toBeVisible();
  await expect(main.getByRole('alert')).toHaveCount(0); await expectNoBlockingAxeViolations(page);
});

for (const shared of [false,true]) for (const motion of ['no-preference','reduce'] as const) {
  test(`current feedback responsive loading/failure/empty and same-range recovery shared=${shared} (${motion})`, async ({page}, info) => {
    await page.clock.setFixedTime(new Date('2026-10-06T12:00:00Z')); await page.emulateMedia({reducedMotion:motion});
    await mockSpotify(page); await seedAuthenticatedBrowser(page);
    let release!:()=>void; const gate=new Promise<void>(resolve=>release=resolve); let recovered=false;
    const requests:unknown[]=[];
    if (shared) await page.route('**/rest/v1/rpc/get_shared_stats_snapshot',async route=>{
      requests.push(route.request().postDataJSON()); await gate;
      return recovered ? route.fulfill({json:{ownerUserId:'shared-owner',ownerDisplayName:'Alex',snapshotDate:'2026-10-04',topTracks:[],topArtists:[],topGenres:[]}})
        : route.fulfill({status:403,json:{message:'Isolated sharing permission failure'}});
    });
    else await page.route('https://api.spotify.com/v1/me/top/**',async route=>{
      await gate; return recovered ? route.fulfill({json:{items:[],total:0}}) : route.fulfill({status:403,json:{error:{status:403,message:'Isolated Spotify failure'}}});
    });
    await page.goto(shared?'/new/stats/shared-owner':'/new/stats');
    const main=page.getByRole('main');
    await expect(main.locator('[role="status"][aria-busy="true"]')).toBeVisible();
    await measureFeedback(page,info,'loading'); await expectNoBlockingAxeViolations(page);
    release(); await expect(main.getByRole('alert')).toBeVisible();
    await measureFeedback(page,info,'unavailable'); await expectNoBlockingAxeViolations(page);
    if(shared) await expect(main.getByRole('button',{name:/Compare dates|History|Create playlist/})).toHaveCount(0);
    recovered=true; await main.getByRole('button',{name:'Retry',exact:true}).press('Enter');
    await expect(main.getByRole('heading',{name:'No top songs found',exact:true})).toBeVisible();
    await measureFeedback(page,info,'empty'); await expectNoBlockingAxeViolations(page);
    if(shared) expect(requests).toEqual([{p_owner_user_id:'shared-owner',p_range:'short_term'},{p_owner_user_id:'shared-owner',p_range:'short_term'}]);
  });
}
