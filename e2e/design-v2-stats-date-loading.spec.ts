import {test,expect} from './fixtures';
import {mockSpotify,seedAuthenticatedBrowser,expectNoBlockingAxeViolations} from './helpers/authenticated-browser';

const owner='de111111-1111-4111-8111-111111111111';
const snapshot='22222222-2222-4222-8222-222222222222';
const timestamp=new Date('2026-10-04T12:00:00Z').getTime();

for(const purpose of ['ranking','comparison'] as const) for(const outcome of ['unavailable','failed'] as const) {
  test(`${purpose} date ${outcome} stops render retries and recovers after explicit reselection`,async({page})=>{
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
    const ranking=page.getByRole('combobox',{name:'Ranking date'});
    const comparison=page.getByRole('combobox',{name:'Compare against'});
    await expect(ranking.locator(`option[value="${timestamp}"]`)).toBeAttached();
    await expect(page.locator('.v2-ranking-list strong').filter({hasText:'Test Song'})).toBeVisible();
    expect(requests).toHaveLength(0);
    const control=purpose==='ranking'?ranking:comparison;
    await control.selectOption(String(timestamp));
    const failureAttempts=outcome==='failed'?4:1; // SDK permits three bounded 503 retries.
    await expect.poll(()=>requests.length,{timeout:15000}).toBe(failureAttempts);
    if(purpose==='ranking') await expect(page.getByText('No top songs found',{exact:true})).toBeVisible();
    else await expect(page.locator('.v2-ranking-list strong').filter({hasText:'Test Song'})).toBeVisible();
    const search=page.getByRole('searchbox',{name:'Search songs or artists'});
    for(const query of ['Saved','not found','']) {
      await search.fill(query);await expect(search).toHaveValue(query);
      if(query) await expect(page.getByText('No top songs found',{exact:true})).toBeVisible();
    }
    expect(requests).toHaveLength(failureAttempts);
    expect(requests[0].searchParams.get('user_id')).toBe(`eq.${owner}`);
    expect(requests[0].searchParams.get('id')).toBe(`eq.${snapshot}`);
    recovered=true;
    await control.selectOption(purpose==='ranking'?'current':'');
    await control.selectOption(String(timestamp));
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
