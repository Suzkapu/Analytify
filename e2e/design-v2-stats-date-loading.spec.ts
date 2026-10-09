import {chooseStatsDate,showStatsDateControls} from './helpers/stats-calendar';
import {test,expect} from './fixtures';
import {writeFile} from 'node:fs/promises';
import {mockSpotify,seedAuthenticatedBrowser,expectNoBlockingAxeViolations} from './helpers/authenticated-browser';

const owner='de111111-1111-4111-8111-111111111111';
const snapshot='22222222-2222-4222-8222-222222222222';
const timestamp=new Date('2026-10-04T12:00:00Z').getTime();

for(const purpose of ['ranking','comparison'] as const) for(const outcome of ['unavailable','failed'] as const) {
  test(`${purpose} date ${outcome} stops render retries and recovers through canonical Retry`,async({page})=>{
    await page.clock.setFixedTime(new Date('2026-10-06T12:00:00Z'));
    await mockSpotify(page);await seedAuthenticatedBrowser(page,{cloudIdentity:true});
    await page.evaluate(async({snapshot,timestamp})=>{
      await new Promise<void>((resolve,reject)=>{
        const request=indexedDB.open('AnalytifyDB',4);
        request.onerror=()=>reject(request.error);
        request.onsuccess=()=>{
          const db=request.result,tx=db.transaction(['statsHistory','featureData','appData'],'readwrite');
          for(const userId of ['e2e-user','e2e-user_dev']) tx.objectStore('statsHistory').put({
            id:snapshot,userId,range:'short_term',timestamp,
            snapshotDate:'2026-10-04',topTracks:[],topArtists:[],topGenres:[],isLoaded:false
          });
          tx.objectStore('statsHistory').put({id:'33333333-3333-4333-8333-333333333333',userId:'e2e-user_dev',range:'short_term',
            timestamp:timestamp+86400000,snapshotDate:'2026-10-05',isLoaded:true,
            topTracks:[{id:'baseline-song',name:'Baseline song',artist:'Baseline Artist'}],topArtists:[],topGenres:[]});
          for(const userId of ['e2e-user','e2e-user_dev']) {
            const parts={tracks:[{id:'current-song',name:'Test Song',artists:[{name:'Test Artist'}],album:{images:[]}}],
              artists:[{id:'current-artist',name:'Test Artist',images:[]}],genres:[{name:'pop',count:1,percentage:100}]};
            for(const [part,value] of Object.entries(parts)) tx.objectStore('featureData').put({key:`${userId}_stats_short_term_${part}`,value:JSON.stringify(value)});
            tx.objectStore('appData').put({key:`${userId}_stats_short_term_lastUpdated`,value:String(Date.now())});
          }
          tx.oncomplete=()=>{db.close();resolve();};tx.onerror=()=>reject(tx.error);
        };
      });
    },{snapshot,timestamp});
    const requests:URL[]=[];let recovered=false;
    await page.route('**/rest/v1/stats_snapshots**',async route=>{
      const url=new URL(route.request().url());
      if(!url.searchParams.has('id')) return route.fulfill({json:[]});
      requests.push(url);
      if(!recovered) return outcome==='failed'
        ? route.fulfill({status:503,headers:{'Retry-After':'0','Access-Control-Expose-Headers':'Retry-After'},json:{message:'Isolated saved-date failure'}})
        : route.fulfill({json:null});
      return route.fulfill({json:{id:snapshot,snapshot_date:'2026-10-04',created_at:'2026-10-04T12:00:00Z',range:'short_term',
        stats_snapshot_tracks:[{rank:1,tracks:{id:'recovered-song',name:'Recovered song',duration_ms:180000,explicit:false,
          albums:{id:'saved-album',name:'Saved album',image_url:null},track_artists:[{artist_rank:0,artists:{id:'saved-artist',name:'Saved Artist'}}]}}],
        stats_snapshot_artists:[],stats_snapshot_genres:[]}});
    });
    await page.goto('/new/stats');
    await expect(page.locator('.v2-ranking-list strong').filter({hasText:'Test Song'})).toBeVisible();
    expect(requests).toHaveLength(0);
    await showStatsDateControls(page);
    const fieldGeometry=await page.locator('#v2-stats-dates').evaluate(element=>{
      const rect=element.getBoundingClientRect();
      return {width:rect.width,gap:getComputedStyle(element).gap,
        fields:[...element.querySelectorAll('.date-field')].map(field=>{
          const bounds=field.getBoundingClientRect(), value=field.querySelector('.value')!.getBoundingClientRect();
          return {width:bounds.width,height:bounds.height,valueHeight:value.height};
        })};
    });
    expect(fieldGeometry.gap).toBe('12px');
    expect(fieldGeometry.fields).toHaveLength(2);
    expect(fieldGeometry.fields[0].width).toBe(fieldGeometry.fields[1].width);
    for(const field of fieldGeometry.fields) {expect(field.height).toBe(76);expect(field.valueHeight).toBe(48);}
    const action=page.getByRole('button',{name:'Compare dates',exact:true});
    const actionBounds=(await action.boundingBox())!;
    // Firefox may report a 3e-5px projection error for this integer CSS height.
    expect(actionBounds.width).toBeCloseTo(page.viewportSize()!.width <= 760 ? 166 : 164,4);
    expect(actionBounds.height).toBeCloseTo(48,4);
    expect(await action.evaluate(element=>{const style=getComputedStyle(element);return [style.fontSize,style.fontWeight,style.lineHeight];})).toEqual(['14px','600','20px']);
    await action.screenshot({path:test.info().outputPath('snapshot-compare-dates-action.png')});
    const actionIcon=page.locator('.compare-dates img');
    await expect(actionIcon).toBeVisible();
    expect(await actionIcon.evaluate(element=>{const image=element as HTMLImageElement, bounds=image.getBoundingClientRect();return [image.complete,image.naturalWidth,image.naturalHeight,bounds.width,bounds.height];})).toEqual([true,20,20,20,20]);
    await writeFile(test.info().outputPath('snapshot-date-field-geometry.json'),JSON.stringify(fieldGeometry,null,2));
    await page.locator('#v2-stats-dates').screenshot({path:test.info().outputPath('snapshot-date-fields.png')});
    await chooseStatsDate(page,purpose,'2026-10-04');
    const failureAttempts=outcome==='failed'?4:1; // SDK permits three bounded 503 retries.
    await expect.poll(()=>requests.length,{timeout:15000}).toBe(failureAttempts);
    const feedback=page.locator('v2-snapshot-feedback');
    await expect(feedback.getByText(purpose==='ranking'?'Saved rankings unavailable':'Comparison unavailable',{exact:true})).toBeVisible();
    if(purpose==='ranking') await expect(page.locator('.v2-ranking-list')).toHaveCount(0);
    else await expect(page.locator('.v2-ranking-list strong').filter({hasText:'Test Song'})).toBeVisible();
    const search=page.getByRole('searchbox',{name:'Search songs or artists'});
    for(const query of ['Saved','not found','']) {
      await search.fill(query);await expect(search).toHaveValue(query);
      if(purpose==='ranking') await expect(feedback.getByText('Saved rankings unavailable',{exact:true})).toBeVisible();
      else if(query) await expect(page.getByText('No top songs found',{exact:true})).toBeVisible();
    }
    expect(requests).toHaveLength(failureAttempts);
    expect(requests[0].searchParams.get('user_id')).toBe(`eq.${owner}`);
    expect(requests[0].searchParams.get('id')).toBe(`eq.${snapshot}`);
    await expect(page.locator('.rank-movement, v2-ranking-flame')).toHaveCount(0);
    await feedback.getByRole('button',{name:'Choose date',exact:true}).click();
    const dialog=page.getByRole('dialog',{name:purpose==='ranking'?'VIEW SNAPSHOT':'COMPARE SNAPSHOT'});
    await expect(dialog).toBeVisible();
    const geometry=await dialog.evaluate(element=>{
      const bounds=element.getBoundingClientRect();
      const overlay=element.parentElement!;
      return {x:bounds.x,y:bounds.y,width:bounds.width,height:bounds.height,viewport:{width:innerWidth,height:innerHeight},
        blur:getComputedStyle(overlay).backdropFilter,
        actions:[...element.querySelectorAll('footer button')].map(button=>button.textContent?.trim())};
    });
    expect(geometry.x).toBeGreaterThanOrEqual(16);
    expect(geometry.y).toBeGreaterThanOrEqual(16);
    expect(geometry.x+geometry.width).toBeLessThanOrEqual(geometry.viewport.width-16);
    expect(geometry.y+geometry.height).toBeLessThanOrEqual(geometry.viewport.height-16);
    expect(geometry.width).toBe(geometry.viewport.width<=760?288:356);
    expect(geometry.blur).toBe('blur(12px)');
    expect(geometry.actions.at(-1)).toBe('Close');
    const geometryPath=test.info().outputPath('snapshot-calendar-geometry.json');
    const screenshotPath=test.info().outputPath('snapshot-calendar.png');
    await writeFile(geometryPath,JSON.stringify(geometry,null,2));
    await dialog.screenshot({path:screenshotPath});
    await test.info().attach('snapshot-calendar-geometry',{path:geometryPath,contentType:'application/json'});
    await test.info().attach('snapshot-calendar',{path:screenshotPath,contentType:'image/png'});
    const resized=[];
    for(const width of [320,360,390,768,1024,1440,1920]) for(const height of [400,1000]) {
      await page.setViewportSize({width,height});
      await expect.poll(async()=>Math.round((await dialog.boundingBox())!.width)).toBe(width<=760?288:356);
      const bounds=(await dialog.boundingBox())!;
      expect(bounds.x).toBeGreaterThanOrEqual(16);
      expect(bounds.y).toBeGreaterThanOrEqual(16);
      expect(bounds.x+bounds.width).toBeLessThanOrEqual(width-16);
      expect(bounds.y+bounds.height).toBeLessThanOrEqual(height-16);
      const close=dialog.getByRole('button',{name:'Close',exact:true});
      await expect(close).toBeInViewport();
      const closeBounds=(await close.boundingBox())!;
      expect(closeBounds.y+closeBounds.height).toBeLessThanOrEqual(bounds.y+bounds.height);
      expect(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth)).toBe(false);
      resized.push({viewport:{width,height},dialog:bounds,close:closeBounds});
    }
    await writeFile(test.info().outputPath('snapshot-calendar-resize.json'),JSON.stringify(resized,null,2));
    await page.setViewportSize(geometry.viewport);
    await expectNoBlockingAxeViolations(page);
    await dialog.getByRole('button',{name:'Close',exact:true}).focus();
    await page.keyboard.press('Escape');await expect(dialog).toHaveCount(0);
    await expect(feedback.getByRole('button',{name:'Choose date',exact:true})).toBeFocused();
    recovered=true;
    await feedback.getByRole('button',{name:'Retry',exact:true}).click();
    await expect.poll(()=>requests.length).toBe(failureAttempts+1);
    if(purpose==='ranking') await expect(page.locator('.v2-ranking-list strong').filter({hasText:'Recovered song'})).toBeVisible();
    else await expect(page.locator('.v2-ranking-list strong').filter({hasText:'Test Song'})).toBeVisible();
    await expectNoBlockingAxeViolations(page);
    expect(requests).toHaveLength(failureAttempts+1);
    for(const request of requests) {
      expect(request.searchParams.get('user_id')).toBe(`eq.${owner}`);
      expect(request.searchParams.get('id')).toBe(`eq.${snapshot}`);
    }
  });
}
