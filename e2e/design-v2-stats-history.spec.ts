import {test, expect} from './fixtures';
import {expectNoBlockingAxeViolations, mockSpotify, seedAuthenticatedBrowser} from './helpers/authenticated-browser';
import {writeFile} from 'node:fs/promises';
import type {Route} from '@playwright/test';

test.beforeEach(async ({page}) => {
  await page.clock.setFixedTime(new Date('2026-10-06T12:00:00Z'));
  await mockSpotify(page);
  await seedAuthenticatedBrowser(page);
  await page.evaluate(async () => {
    const dates = ['2026-09-05','2026-09-09','2026-09-14','2026-09-18','2026-09-24','2026-09-28','2026-10-04'];
    const ranks = [15,4,45,20,90,60,3];
    const song = {id: 'history-song', name: 'Midnight Drive', artists: [{name: 'Example Artist'}], album: {images: []}};
    await new Promise<void>((resolve, reject) => {
      const request = indexedDB.open('AnalytifyDB', 4);
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const db = request.result, transaction = db.transaction('statsHistory', 'readwrite');
        for (const userId of ['e2e-user','e2e-user_dev']) for (let index = 0; index < dates.length; index++) {
          const other = Array.from({length: ranks[index] - 1}, (_, rank) => ({id: `other-${rank}`, name: `Other ${rank}`, artists: []}));
          transaction.objectStore('statsHistory').put({userId, range: 'short_term', timestamp: new Date(`${dates[index]}T12:00:00Z`).getTime(),
            snapshotDate: dates[index], topTracks: [...other, song], topArtists: [], topGenres: [], isLoaded: true});
        }
        transaction.oncomplete = () => {db.close(); resolve();};
        transaction.onerror = () => reject(transaction.error);
      };
    });
  });
  await page.route('https://api.spotify.com/v1/me/top/tracks?*', route => route.fulfill({json: {items: [], total: 0}}));
  await page.route('https://api.spotify.com/v1/me/top/artists?*', route => route.fulfill({json: {items: [], total: 0}}));
  await page.goto('/new/stats');
  const date = page.getByRole('combobox', {name: 'Ranking date', exact: true});
  await expect(date).toBeVisible();
  await date.selectOption(String(new Date('2026-10-04T12:00:00Z').getTime()));
  await expect(page.getByRole('button', {name: 'View position history for Midnight Drive'})).toBeVisible();
});

test('approved shared snapshot has no private history actions in any category', async ({page}) => {
  const requests: {path:string;body:any}[] = [];
  await page.route('https://tmmhylpexbubyznlizfs.supabase.co/**', async route => {
    const path = new URL(route.request().url()).pathname;
    requests.push({path,body:route.request().postDataJSON()});
    return route.fulfill({json:path === '/rest/v1/rpc/get_shared_stats_snapshot' ? {
      ownerUserId:'shared-owner',ownerDisplayName:'Alex',snapshotDate:'2026-10-04',
      topTracks:[{id:'shared-song',name:'Shared Song',artists:[{name:'Shared Artist'}],album:{images:[]},external_urls:{spotify:'https://open.spotify.com/track/shared-song'}}],
      topArtists:[{id:'shared-artist',name:'Shared Artist',images:[],external_urls:{spotify:'https://open.spotify.com/artist/shared-artist'}}],
      topGenres:[{name:'pop',weight:100}]
    } : []});
  });
  await page.goto('/new/stats/shared-owner');
  await expect(page.getByRole('heading',{name:'Alex top listening'})).toBeVisible();
  for (const [category,item] of [['Songs','Shared Song'],['Artists','Shared Artist'],['Genres','pop']]) {
    await page.getByRole('group',{name:'Ranking category'}).getByRole('button',{name:category,exact:true}).click();
    const main = page.getByRole('main');
    if(category==='Genres') await expect(main.getByText(`1. ${item}`,{exact:true})).toBeVisible();
    else {
      await expect(main.locator('strong').filter({hasText:new RegExp(`^${item}$`)})).toBeVisible();
      await expect(main.getByRole('group',{name:'Rank 1. Unchanged',exact:true})).toBeVisible();
      await expect(main.locator('.rank-number')).toHaveText('1');
    }
    await expect(main.getByRole('button',{name:/View position history/})).toHaveCount(0);
    await expect(main.getByRole('button',{name:'Search past',exact:true})).toHaveCount(0);
    await expect(main.getByRole('combobox',{name:'Ranking date',exact:true})).toHaveCount(0);
    await expect(main.getByRole('combobox',{name:'Compare against',exact:true})).toHaveCount(0);
    await expect(main.locator('button.v2-genre-row, .v2-artist-history')).toHaveCount(0);
    await expect(page.getByRole('dialog')).toHaveCount(0);
    if (category !== 'Genres') await expect(main.getByRole('button',{name:`Open ${item} on Spotify`})).toBeEnabled();
  }
  expect(requests.filter(request=>request.path === '/rest/v1/rpc/get_shared_stats_snapshot')).toEqual([
    {path:'/rest/v1/rpc/get_shared_stats_snapshot',body:{p_owner_user_id:'shared-owner',p_range:'short_term'}}
  ]);
  expect(requests.some(request=>request.path.startsWith('/rest/v1/stats_snapshot_'))).toBe(false);
  await expectNoBlockingAxeViolations(page);
});

for (const motion of ['no-preference','reduce'] as const) {
  test(`saved history preserves real dates, keyboard inspection and responsive geometry with motion ${motion}`, async ({page}, testInfo) => {
    await page.emulateMedia({reducedMotion: motion});
    const trigger = page.getByRole('button', {name: 'View position history for Midnight Drive'});
    await trigger.press('Enter');
    const dialog = page.getByRole('dialog', {name: 'Midnight Drive position history'});
    const close = dialog.getByRole('button', {name: 'Close', exact: true});
    await expect(dialog).toBeVisible();
    await expect(close).toBeFocused();
    const slider = dialog.getByRole('slider', {name: 'Saved ranking position'});
    await expect(slider).toHaveAttribute('aria-valuemax', '7');
    await slider.focus();
    await slider.press('End');
    await expect(slider).toHaveAttribute('aria-valuetext', '4 Oct 2026, position 3');
    await slider.press('Home');
    await slider.press('ArrowRight');
    await expect(slider).toHaveAttribute('aria-valuetext', '9 Sep 2026, position 4');
    await dialog.getByRole('button', {name: 'View saved positions'}).click();
    const table = dialog.getByRole('table', {name: 'Saved ranking positions'});
    await expect(table.getByRole('row')).toHaveCount(8);
    await expect(table.getByRole('cell').filter({hasText: /^#\d+$/})).toHaveText(['#15','#4','#45','#20','#90','#60','#3']);
    await expect(table.locator('time').first()).toHaveAttribute('datetime', '2026-09-05');
    await expectNoBlockingAxeViolations(page);
    const evidence = [];
    for (const width of [320,360,390,768,1024,1440,1920]) for (const height of [480,1080]) {
      await page.setViewportSize({width,height});
      await expect(dialog).toBeVisible();
      await expect.poll(async () => dialog.evaluate(element => ({
        viewportHeight: innerHeight,
        fits: element.getBoundingClientRect().height <= innerHeight - 32
      }))).toEqual({viewportHeight: height, fits: true});
      await expect.poll(async () => slider.locator('svg').evaluate(svg => {
        const box = svg.getBoundingClientRect(), viewBox = (svg as SVGSVGElement).viewBox.baseVal;
        return Math.abs(box.width - viewBox.width) + Math.abs(box.height - viewBox.height);
      })).toBeLessThan(1);
      const geometry = await dialog.evaluate(element => {
        const box = element.getBoundingClientRect(), close = element.querySelector('.close-button')!.getBoundingClientRect();
        const body = element.querySelector('.history-body') as HTMLElement;
        const overlay = element.parentElement!;
        return {overflow: document.documentElement.scrollWidth - innerWidth,
          dialog: {x: box.x, y: box.y, width: box.width, height: box.height}, close: {y: close.y, bottom: close.bottom, height: close.height},
          body: {height: body.clientHeight, scrollHeight: body.scrollHeight, overflow: getComputedStyle(body).overflowY},
          blur: getComputedStyle(overlay).backdropFilter,
          occluded: [[box.x + box.width / 2, box.y + 8], [box.x + box.width / 2, box.bottom - 8],
            [box.x + 8, box.y + box.height / 2], [box.right - 8, box.y + box.height / 2]]
            .filter(([x,y]) => !element.contains(document.elementFromPoint(x,y))).length,
          marker: element.querySelector('.position-marker')!.getBoundingClientRect().width};
      });
      expect(geometry.overflow).toBeLessThanOrEqual(1);
      expect(geometry.dialog.x).toBeGreaterThanOrEqual(15);
      expect(geometry.dialog.y).toBeGreaterThanOrEqual(15);
      expect(geometry.close.height).toBe(44);
      expect(geometry.close.bottom).toBeLessThanOrEqual(height - 15);
      expect(geometry.body.overflow).toBe('auto');
      expect(geometry.blur).toBe('blur(12px)');
      expect(geometry.occluded).toBe(0);
      expect([6,10]).toContain(geometry.marker);
      if (height === 480) expect(geometry.body.scrollHeight).toBeGreaterThan(geometry.body.height);
      evidence.push({width,height,...geometry});
    }
    const geometryPath = testInfo.outputPath('responsive-history-geometry.json');
    await writeFile(geometryPath, JSON.stringify(evidence,null,2) + '\n');
    await testInfo.attach('responsive-history-geometry', {path: geometryPath,contentType:'application/json'});
    await page.setViewportSize({width:1440,height:1080});
    await dialog.getByRole('button', {name: 'Hide saved positions'}).click();
    await expect(table).toHaveCount(0);
    await close.focus();
    await close.press('Shift+Tab');
    await expect(dialog.getByRole('button',{name:'View saved positions'})).toBeFocused();
    await dialog.screenshot({path:testInfo.outputPath(`history-selected-${motion}-1440.png`),animations:'disabled'});
    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);
    await expect(trigger).toBeFocused();
  });
}

for (const motion of ['no-preference','reduce'] as const) for (const failureStatus of [403,503,200]) {
  test(`cloud failure ${failureStatus === 200 ? 'malformed response' : failureStatus} preserves local history and recovers with one scoped retry, motion ${motion}`, async ({page},testInfo) => {
    await page.emulateMedia({reducedMotion: motion});
    const pending: Route[] = [];
    const queries: URL[] = [];
    await page.route('https://tmmhylpexbubyznlizfs.supabase.co/**', async route => {
      const url = new URL(route.request().url());
      if (url.pathname === '/rest/v1/stats_snapshot_tracks' && url.searchParams.get('select')?.startsWith('rank,')) {
        queries.push(url);
        pending.push(route);
        return;
      }
      // All other cloud traffic is fulfilled offline, including account hydration.
      return route.fulfill({json: url.pathname === '/rest/v1/users' ? {backup_active: true} : []});
    });
    await page.evaluate(async () => {
      await new Promise<void>((resolve,reject) => {
        const request = indexedDB.open('AnalytifyDB',4);
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
          const db = request.result, tx = db.transaction(['appData','statsHistory'],'readwrite');
          tx.objectStore('appData').put({key:'supabaseUserId',value:'11111111-1111-4111-8111-111111111111'});
          tx.objectStore('appData').put({key:'de111111-1111-4111-8111-111111111111_backup_active',value:'true'});
          for (const userId of ['e2e-user','e2e-user_dev']) tx.objectStore('statsHistory').put({userId,range:'short_term',
            timestamp:new Date('2026-09-03T12:00:00Z').getTime(),snapshotDate:'2026-09-03',topTracks:[],topArtists:[],topGenres:[],isLoaded:false});
          tx.oncomplete = () => {db.close();resolve();}; tx.onerror = () => reject(tx.error);
        };
      });
    });
    await page.reload();
    await page.getByRole('combobox',{name:'Ranking date',exact:true}).selectOption(String(new Date('2026-10-04T12:00:00Z').getTime()));
    const trigger = page.getByRole('button',{name:'View position history for Midnight Drive'});
    await trigger.evaluate(element => element.scrollIntoView({block:'center'}));
    await expect.poll(() => trigger.evaluate(async element => {
      const before = element.getBoundingClientRect();
      await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
      const after = element.getBoundingClientRect();
      const hit = document.elementFromPoint(after.x + after.width / 2,after.y + after.height / 2);
      return {stable:before.y === after.y,withinViewport:after.top >= 0 && after.bottom <= innerHeight,hit:element.contains(hit)};
    })).toEqual({stable:true,withinViewport:true,hit:true});
    await trigger.click();
    const dialog = page.getByRole('dialog',{name:'Midnight Drive position history'});
    const slider = dialog.getByRole('slider',{name:'Saved ranking position'});
    await expect.poll(() => pending.length).toBe(1);
    await expect(slider).toHaveAttribute('aria-valuemax','7');
    await expect(dialog.getByRole('status')).toContainText('Refreshing saved history');
    const busy = dialog.getByRole('button',{name:'Retrying…',exact:true});
    await expect(busy).toBeDisabled();
    await expect(busy).toHaveAttribute('aria-busy','true');
    await expect(dialog.getByRole('button',{name:'Close',exact:true})).toBeEnabled();
    await expect(busy.locator('.progress-icon')).toHaveCSS('animation-name',motion === 'reduce' ? 'none' : /history-progress$/);
    if (motion === 'no-preference') await expect(busy.locator('.progress-icon')).toHaveCSS('animation-duration','0.8s');
    const failedAttempts = failureStatus === 503 ? 4 : 1;
    for (let attempt = 0; attempt < failedAttempts; attempt++) {
      await expect.poll(() => pending.length).toBe(attempt + 1);
      expect(pending[attempt].request().headers()['x-retry-count'] || '').toBe(attempt ? String(attempt) : '');
      await expect(slider).toHaveAttribute('aria-valuemax','7');
      await expect(busy).toBeDisabled();
      await pending[attempt].fulfill({status:failureStatus,headers:{'Retry-After':'0'},json:failureStatus === 200
        ? [{rank:'invalid',stats_snapshots:{snapshot_date:'2026-09-03'}},{rank:9,stats_snapshots:{snapshot_date:'2026-09-03'}}]
        : {message:'Isolated history service failure'}});
    }
    await expect(dialog.getByRole('alert')).toContainText('Showing local positions');
    await expect(slider).toHaveAttribute('aria-valuemax','7');
    expect(await dialog.evaluate(element => {
      const box = element.getBoundingClientRect();
      // Inert suppresses hit testing but does not suppress paint. Restore it
      // synchronously after checking which layer actually covers the dialog.
      const inert = [...document.querySelectorAll<HTMLElement>('[inert]')];
      inert.forEach(node => node.removeAttribute('inert'));
      try { return element.contains(document.elementFromPoint(box.x + box.width / 2,box.bottom - 20)); }
      finally {inert.forEach(node => node.setAttribute('inert',''));}
    })).toBe(true);
    await expectNoBlockingAxeViolations(page);
    await dialog.screenshot({path:testInfo.outputPath('history-partial.png'),animations:'disabled'});
    await dialog.getByRole('button',{name:'Retry history',exact:true}).click();
    await expect.poll(() => pending.length).toBe(failedAttempts + 1);
    await expect(busy).toBeDisabled();
    await busy.evaluate(button => (button as HTMLButtonElement).click());
    expect(queries).toHaveLength(failedAttempts + 1);
    for (const query of queries) {
      expect(query.searchParams.get('stats_snapshots.user_id')).toBe('eq.de111111-1111-4111-8111-111111111111');
      expect(query.searchParams.get('stats_snapshots.range')).toBe('eq.short_term');
      expect(query.searchParams.get('track_id')).toBe('eq.history-song');
    }
    expect(pending[failedAttempts].request().headers()['x-retry-count']).toBeUndefined();
    await pending[failedAttempts].fulfill({json:[{rank:9,stats_snapshots:{snapshot_date:'2026-09-03',created_at:'2026-09-03T12:00:00Z'}},
      {rank:1,stats_snapshots:{snapshot_date:'2026-10-04',created_at:'2026-10-04T12:00:00Z'}}]});
    await expect(dialog.getByRole('alert')).toHaveCount(0);
    await expect(busy).toHaveCount(0);
    await expect(slider).toHaveAttribute('aria-valuemax','8');
    await dialog.getByRole('button',{name:'View saved positions'}).click();
    const table = dialog.getByRole('table',{name:'Saved ranking positions'});
    // Loaded local snapshots remain authoritative when cloud and local disagree.
    await expect(table.getByRole('cell').filter({hasText:/^#\d+$/})).toHaveText(['#9','#15','#4','#45','#20','#90','#60','#3']);
    await expectNoBlockingAxeViolations(page);
    await dialog.getByRole('button',{name:'Close',exact:true}).click();
    await expect(dialog).toHaveCount(0);
    await expect(trigger).toBeFocused();
    expect(queries).toHaveLength(failedAttempts + 1);
  });
}

for (const motion of ['no-preference','reduce'] as const) {
  test(`cloud-only history distinguishes loading, unavailable, empty and single positions with motion ${motion}`, async ({page},testInfo) => {
    await page.emulateMedia({reducedMotion:motion});
    const pending: Route[] = [];
    const searches: unknown[] = [];
    await page.route('https://tmmhylpexbubyznlizfs.supabase.co/**', async route => {
      const url = new URL(route.request().url());
      if (url.pathname === '/rest/v1/rpc/search_past_top_items') {
        searches.push(route.request().postDataJSON());
        return route.fulfill({json:[{kind:'track',item_id:'archive-song',item_name:'Archive Song',subtitle:'Archive Artist',
          best_rank:7,first_seen:'2026-09-18',last_seen:'2026-09-18',appearances:1}]});
      }
      if (url.pathname === '/rest/v1/stats_snapshot_tracks' && url.searchParams.get('select')?.startsWith('rank,')) {
        expect(url.searchParams.get('track_id')).toBe('eq.archive-song');
        expect(url.searchParams.get('stats_snapshots.user_id')).toBe('eq.de111111-1111-4111-8111-111111111111');
        expect(url.searchParams.get('stats_snapshots.range')).toBe('eq.short_term');
        pending.push(route);return;
      }
      return route.fulfill({json:url.pathname === '/rest/v1/users' ? {backup_active:true} : []});
    });
    await page.evaluate(async () => {
      await new Promise<void>((resolve,reject) => {
        const request = indexedDB.open('AnalytifyDB',4);
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
          const db=request.result,tx=db.transaction('appData','readwrite');
          tx.objectStore('appData').put({key:'supabaseUserId',value:'11111111-1111-4111-8111-111111111111'});
          tx.objectStore('appData').put({key:'de111111-1111-4111-8111-111111111111_backup_active',value:'true'});
          tx.oncomplete=()=>{db.close();resolve();};tx.onerror=()=>reject(tx.error);
        };
      });
    });
    await page.reload();
    await page.getByRole('combobox',{name:'Ranking date',exact:true}).selectOption('current');
    await page.getByRole('button',{name:'Search past',exact:true}).click();
    await page.getByRole('searchbox',{name:'Search songs or artists'}).fill('Archive');
    const trigger=page.getByRole('button',{name:'Archive Song Archive Artist',exact:true});
    await expect(trigger).toBeVisible();
    expect(searches).toEqual([{p_range:'short_term',p_kind:'track',p_query:'Archive',p_limit:20}]);
    await trigger.press('Enter');
    const dialog=page.getByRole('dialog',{name:'Archive Song position history'});
    const close=dialog.getByRole('button',{name:'Close',exact:true});
    await expect.poll(()=>pending.length).toBe(1);
    await expect(dialog.getByRole('status')).toContainText('Loading position history');
    await expect(dialog.locator('.chart-skeleton')).toHaveAttribute('aria-hidden','true');
    const initialProgress=dialog.locator('.loading-title .progress-icon');
    await expect(initialProgress).toHaveCSS('animation-name',motion === 'reduce' ? 'none' : /history-progress$/);
    await expect.poll(()=>initialProgress.evaluate((element:HTMLImageElement)=>{
      if (!element.complete || !element.naturalWidth) return 0;
      const canvas=document.createElement('canvas');canvas.width=element.naturalWidth;canvas.height=element.naturalHeight;
      const context=canvas.getContext('2d')!;context.drawImage(element,0,0);
      const pixels=context.getImageData(0,0,canvas.width,canvas.height).data;
      let green=0;
      for(let offset=0;offset<pixels.length;offset+=4) if(pixels[offset+3]>100 && pixels[offset+1]>180
        && pixels[offset+1]>pixels[offset]*2 && pixels[offset+1]>pixels[offset+2]*1.5) green++;
      return green;
    })).toBeGreaterThan(10);

    await expect(dialog.getByRole('slider')).toHaveCount(0);
    await expect(close).toBeEnabled();await expect(close).toBeFocused();
    await expectNoBlockingAxeViolations(page);
    await dialog.screenshot({path:testInfo.outputPath('history-cloud-only-loading.png'),animations:'disabled'});
    await pending[0].fulfill({status:403,json:{message:'Isolated unavailable history'}});
    await expect(dialog.getByRole('alert')).toContainText('History unavailable');
    await dialog.screenshot({path:testInfo.outputPath('history-cloud-only-unavailable.png'),animations:'disabled'});
    await expect(dialog.getByRole('slider')).toHaveCount(0);
    await dialog.getByRole('button',{name:'Retry history',exact:true}).click();
    await expect.poll(()=>pending.length).toBe(2);
    const busy=dialog.getByRole('button',{name:'Retrying…',exact:true});
    await expect(dialog.getByRole('status')).toContainText('Retrying saved history');
    await expect(busy).toBeDisabled();await expect(busy).toHaveAttribute('aria-busy','true');
    await busy.evaluate(button=>(button as HTMLButtonElement).click());expect(pending).toHaveLength(2);
    await expect(close).toBeEnabled();
    await dialog.screenshot({path:testInfo.outputPath('history-cloud-only-retrying.png'),animations:'disabled'});
    await pending[1].fulfill({json:[]});
    await expect(dialog).toContainText('No saved positions yet');
    await expect(dialog.getByRole('alert')).toHaveCount(0);
    await expect(dialog.getByRole('button',{name:/Retry/})).toHaveCount(0);
    await expect(dialog.locator('svg,table')).toHaveCount(0);
    await expectNoBlockingAxeViolations(page);
    await dialog.screenshot({path:testInfo.outputPath('history-cloud-only-empty.png'),animations:'disabled'});
    await close.click();await expect(trigger).toBeFocused();
    await trigger.press('Enter');await expect.poll(()=>pending.length).toBe(3);
    await pending[2].fulfill({json:[{rank:7,stats_snapshots:{snapshot_date:'2026-09-18'}}]});
    await expect(dialog).toContainText('One saved position');
    await expect(dialog.locator('time')).toHaveAttribute('datetime','2026-09-18');
    await expect(dialog).toContainText('#7');
    await expect(dialog.locator('svg,table')).toHaveCount(0);
    await expectNoBlockingAxeViolations(page);
    await dialog.screenshot({path:testInfo.outputPath('history-cloud-only-single.png'),animations:'disabled'});
    await close.click();await expect(trigger).toBeFocused();
    expect(pending).toHaveLength(3);
  });
}

for (const lateOutcome of ['ready','unavailable'] as const) {
  test(`late ${lateOutcome} history cannot replace a reopened request or shared navigation`, async ({page}) => {
    const pending:Route[]=[];
    const sharedRequests:unknown[]=[];
    await page.route('https://tmmhylpexbubyznlizfs.supabase.co/**',async route=>{
      const url=new URL(route.request().url());
      if(url.pathname==='/rest/v1/stats_snapshot_tracks' && url.searchParams.get('select')?.startsWith('rank,')) {
        expect(url.searchParams.get('track_id')).toBe('eq.history-song');
        expect(url.searchParams.get('stats_snapshots.user_id')).toBe('eq.de111111-1111-4111-8111-111111111111');
        expect(url.searchParams.get('stats_snapshots.range')).toBe('eq.short_term');
        pending.push(route);return;
      }
      if(url.pathname==='/rest/v1/rpc/get_shared_stats_snapshot') {
        sharedRequests.push(route.request().postDataJSON());
        return route.fulfill({json:{ownerUserId:'shared-owner',ownerDisplayName:'Alex',snapshotDate:'2026-10-04',
          topTracks:[{id:'shared-song',name:'Shared Song',artists:[{name:'Shared Artist'}],album:{images:[]}}],topArtists:[],topGenres:[]}});
      }
      return route.fulfill({json:url.pathname==='/rest/v1/users'?{backup_active:true}:[]});
    });
    await page.evaluate(async()=>{
      await new Promise<void>((resolve,reject)=>{
        const request=indexedDB.open('AnalytifyDB',4);request.onerror=()=>reject(request.error);
        request.onsuccess=()=>{
          const db=request.result,tx=db.transaction(['appData','statsHistory'],'readwrite');
          tx.objectStore('appData').put({key:'supabaseUserId',value:'11111111-1111-4111-8111-111111111111'});
          tx.objectStore('appData').put({key:'de111111-1111-4111-8111-111111111111_backup_active',value:'true'});
          for(const userId of ['e2e-user','e2e-user_dev'])tx.objectStore('statsHistory').put({userId,range:'short_term',
            timestamp:new Date('2026-09-03T12:00:00Z').getTime(),snapshotDate:'2026-09-03',topTracks:[],topArtists:[],topGenres:[],isLoaded:false});
          tx.oncomplete=()=>{db.close();resolve();};tx.onerror=()=>reject(tx.error);
        };
      });
    });
    // Use the real router link and browser history so the pending controller is
    // destroyed by navigation, rather than reloading the application in a fixture.
    await page.goto('/new/stats/shared-owner');
    await expect(page.getByRole('heading',{name:'Alex top listening'})).toBeVisible();
    await page.getByRole('link',{name:'Stats',exact:true}).first().click();
    await expect(page.getByRole('heading',{name:'Your top listening'})).toBeVisible();
    await page.getByRole('combobox',{name:'Ranking date',exact:true}).selectOption(String(new Date('2026-10-04T12:00:00Z').getTime()));
    const trigger=page.getByRole('button',{name:'View position history for Midnight Drive'});
    const dialog=page.getByRole('dialog',{name:'Midnight Drive position history'});
    const close=dialog.getByRole('button',{name:'Close',exact:true});
    const slider=dialog.getByRole('slider',{name:'Saved ranking position'});
    await trigger.press('Enter');await expect.poll(()=>pending.length).toBe(1);
    await close.click();await expect(trigger).toBeFocused();
    await trigger.press('Enter');await expect.poll(()=>pending.length).toBe(2);
    const fulfillLate=async(index:number)=>{
      const responsePromise=page.waitForResponse(response=>response.request()===pending[index].request());
      await pending[index].fulfill(lateOutcome==='ready'
        ? {json:[{rank:1,stats_snapshots:{snapshot_date:'2026-09-02'}}]}
        : {status:403,json:{message:'Isolated late unavailable history'}});
      const response=await responsePromise;await response.finished();
      // Allow the received response and Angular's next paint to finish before
      // asserting it did not alter the newer UI; no fixed timer or forced action.
      await page.evaluate(()=>new Promise<void>(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve()))));
    };
    await fulfillLate(0);
    await expect(dialog.getByRole('status')).toContainText('Refreshing saved history');
    await expect(dialog.getByRole('button',{name:'Retrying…',exact:true})).toBeDisabled();
    await expect(dialog.getByRole('alert')).toHaveCount(0);
    await expect(slider).toHaveAttribute('aria-valuemax','7');
    expect(pending).toHaveLength(2);
    await pending[1].fulfill({json:[{rank:9,stats_snapshots:{snapshot_date:'2026-09-03'}}]});
    await expect(slider).toHaveAttribute('aria-valuemax','8');
    await dialog.getByRole('button',{name:'View saved positions'}).click();
    const table=dialog.getByRole('table',{name:'Saved ranking positions'});
    await expect(table.getByRole('cell').filter({hasText:/^#\d+$/})).toHaveText(['#9','#15','#4','#45','#20','#90','#60','#3']);
    await expect(table.locator('time')).toHaveText(['3 Sep','5 Sep','9 Sep','14 Sep','18 Sep','24 Sep','28 Sep','4 Oct']);
    await close.click();await trigger.press('Enter');await expect.poll(()=>pending.length).toBe(3);
    await page.goBack();
    await expect(page.getByRole('heading',{name:'Alex top listening'})).toBeVisible();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await fulfillLate(2);
    await expect(page.getByRole('heading',{name:'Alex top listening'})).toBeVisible();
    const main=page.getByRole('main');
    await expect(main.locator('.v2-ranking-copy strong')).toHaveText('Shared Song');
    await expect(main.getByRole('group',{name:'Rank 1. Unchanged',exact:true})).toBeVisible();
    await expect(main.locator('.rank-number')).toHaveText('1');
    await expect(main.getByRole('button',{name:/View position history/})).toHaveCount(0);
    await expect(main.getByRole('alert')).toHaveCount(0);
    await expect(page.getByRole('dialog')).toHaveCount(0);
    expect(sharedRequests).toEqual(Array.from({length:2},()=>({p_owner_user_id:'shared-owner',p_range:'short_term'})));
    expect(pending).toHaveLength(3);
    await expectNoBlockingAxeViolations(page);
  });
}

test('canonical history palette distinguishes surfaces, controls, hover and keyboard focus',async({page})=>{
  await page.emulateMedia({reducedMotion:'reduce'});
  const searchBorder=await page.getByRole('searchbox',{name:'Search songs or artists'}).evaluate(element=>getComputedStyle(element).borderColor);
  await page.getByRole('button',{name:'View position history for Midnight Drive'}).press('Enter');
  const dialog=page.getByRole('dialog',{name:'Midnight Drive position history'});
  const close=dialog.getByRole('button',{name:'Close',exact:true});
  const slider=dialog.getByRole('slider',{name:'Saved ranking position'});
  await slider.focus();await page.mouse.move(0,0);
  const colors=await dialog.evaluate(element=>({
    surfaceBorder:getComputedStyle(element).borderColor,
    selection:getComputedStyle(element.querySelector('.entity-badge')!).backgroundColor,
    chartSelection:getComputedStyle(element.querySelector('.history-area')!).fill,
    defaultControl:getComputedStyle(element.querySelector('.close-button')!).borderColor
  }));
  await close.hover();
  const hover=await close.evaluate(element=>({border:getComputedStyle(element).borderColor,background:getComputedStyle(element).backgroundColor}));
  await close.focus();await page.keyboard.press('Shift+Tab');await page.keyboard.press('Tab');
  await expect(close).toBeFocused();
  const focus=await close.evaluate(element=>({border:getComputedStyle(element).borderColor,background:getComputedStyle(element).backgroundColor}));
  expect({searchBorder,...colors,hover,focus}).toEqual({
    searchBorder:'rgb(107, 125, 113)',surfaceBorder:'rgb(52, 66, 58)',selection:'rgb(25, 60, 41)',chartSelection:'rgb(25, 60, 41)',
    defaultControl:'rgb(107, 125, 113)',hover:{border:'rgb(107, 125, 113)',background:'rgb(24, 32, 25)'},
    focus:{border:'rgb(159, 255, 200)',background:'rgb(18, 24, 20)'}
  });
  await expectNoBlockingAxeViolations(page);
});
